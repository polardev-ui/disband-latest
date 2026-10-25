import Foundation
import Supabase
import Realtime
import Observation
import UIKit

@MainActor
@Observable
final class ChatViewModel {
    let source: ChatSource

    var messages: [DisplayMessage] = []
    var reactions: [String: [ReactionSummary]] = [:]   // messageId -> summaries
    var typers: [TypingService.Event] = []
    var typingProfiles: [String: Profile] = [:]
    var isGroupScope: Bool {
        switch source {
        case .channel, .group: return true
        case .dm: return false
        }
    }
    private var typingChannel: RealtimeChannelV2?
    private var typingTask: Task<Void, Never>?
    private var typingTimers: [String: Task<Void, Never>] = [:]
    private var lastTypingSentAt: Date = .distantPast
    private var isSelfDm = false
    var loading = true
    var loadError: String?
    /// Older pages are loaded as the reader reaches the top of the
    /// conversation. A window used to be limited to the newest fifty
    /// messages, with no way to reach anything before them.
    private(set) var hasMoreHistory = false
    private(set) var loadingOlder = false
    static let pageSize = 50
    /// A send that the server refused. Shown above the composer; `loadError`
    /// only appears in an empty conversation, so a rejected send in a busy
    /// channel used to fail with no sign at all.
    var sendError: String?
    var currentUserId: String?
    var currentUserProfile: Profile?

    private var profileCache: [String: Profile] = [:]
    private var channel: RealtimeChannelV2?
    private var listenTask: Task<Void, Never>?
    private var deleteChannel: RealtimeChannelV2?
    private var deleteTask: Task<Void, Never>?
    private var reactionChannel: RealtimeChannelV2?
    private var reactionTask: Task<Void, Never>?
    nonisolated(unsafe) private var foregroundObserver: NSObjectProtocol?

    init(source: ChatSource) {
        self.source = source
        // Re-fetch when the app returns to the foreground. Realtime inserts
        // that happened while the socket was suspended are never replayed, so
        // a chat open before backgrounding used to miss messages (and any
        // unread state) until it was reopened.
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.reloadOnForeground()
            }
        }
    }

    deinit {
        if let foregroundObserver {
            NotificationCenter.default.removeObserver(foregroundObserver)
        }
    }

    func reloadOnForeground() async {
        await load()
        await loadReactions()
    }

    func start(currentUserId: String?, profile: Profile?) async {
        self.currentUserId = currentUserId
        self.currentUserProfile = profile

        // Instant paint from cache, then refresh in the background.
        if let cached = ChatCache.shared.messages(source.cacheKey) {
            messages = cached
            reactions = ChatCache.shared.reactions(source.cacheKey) ?? [:]
            loading = false
        }
        // Subscribe while the first page loads. The five realtime channels
        // and the page don't depend on each other, and doing them one after
        // another was most of the time a conversation took to settle.
        // Subscribing first also closes the gap where a message sent during
        // the load was never delivered.
        async let live: Void = subscribeAll()
        await load()
        await loadReactions()
        await live
    }

    private func subscribeAll() async {
        async let inserts: Void = subscribe()
        async let deletes: Void = subscribeDeletes()
        async let reacts: Void = subscribeReactions()
        async let selfDm: Void = detectSelfDm()
        async let typing: Void = subscribeTyping()
        _ = await (inserts, deletes, reacts, selfDm, typing)
    }

    private var typingTopic: String? {
        switch source {
        case .channel(let id, _): return TypingService.topic(kind: "ch", id: id)
        case .dm(let threadId, _): return TypingService.topic(kind: "dm", id: threadId)
        case .group(let id, _): return TypingService.topic(kind: "group", id: id)
        }
    }

    private func detectSelfDm() async {
        guard case .dm(let threadId, _) = source, let me = currentUserId else {
            isSelfDm = false
            return
        }
        struct ThreadMembers: Decodable { let userA: String; let userB: String
            enum CodingKeys: String, CodingKey { case userA = "user_a"; case userB = "user_b" }
        }
        let rows: [ThreadMembers] = (try? await SupabaseManager.client
            .from("dm_threads").select("user_a,user_b").eq("id", value: threadId)
            .execute().value) ?? []
        isSelfDm = rows.first.map { $0.userA == me && $0.userB == me } ?? false
    }

    private func subscribeTyping() async {
        guard let topic = typingTopic, let me = currentUserId else { return }
        let (ch, stream) = await TypingService.watch(topic: topic)
        typingChannel = ch
        typingTask = Task { [weak self] in
            for await event in stream {
                guard let self else { continue }
                if event.userId == me { continue }
                await self.receiveTyper(event)
            }
        }
    }

    private func receiveTyper(_ event: TypingService.Event) async {
        typingTimers[event.userId]?.cancel()
        if !typers.contains(where: { $0.userId == event.userId }) {
            typers.append(event)
        }
        if typingProfiles[event.userId] == nil {
            if let profiles = try? await DatabaseService.profiles(ids: [event.userId]) {
                typingProfiles[event.userId] = profiles[event.userId]
            }
        }
        typingTimers[event.userId] = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard let self else { return }
            self.typers.removeAll { $0.userId == event.userId }
            self.typingTimers[event.userId] = nil
        }
    }

    func notifyTyping(displayName: String) {
        guard let me = currentUserId, let topic = typingTopic else { return }
        if isSelfDm {
            Task { await self.receiveTyper(TypingService.Event(userId: me, name: displayName)) }
        }
        let now = Date()
        guard now.timeIntervalSince(lastTypingSentAt) >= 1.5 else { return }
        lastTypingSentAt = now
        let watch = typingChannel
        Task {
            await TypingService.send(topic: topic, userId: me, name: displayName, via: watch)
        }
    }

    private func cacheNow() {
        ChatCache.shared.store(source.cacheKey, messages: messages, reactions: reactions)
    }

    func stop() {
        listenTask?.cancel()
        deleteTask?.cancel()
        reactionTask?.cancel()
        typingTask?.cancel()
        for task in typingTimers.values { task.cancel() }
        typingTimers = [:]
        let ch = channel, dc = deleteChannel, rc = reactionChannel, tc = typingChannel
        channel = nil; deleteChannel = nil; reactionChannel = nil; typingChannel = nil
        Task { await ch?.unsubscribe(); await dc?.unsubscribe(); await rc?.unsubscribe(); await tc?.unsubscribe() }
    }

    // MARK: - Loading

    /// Fetch the newest page, or the page immediately before `before`.
    private func fetchMessages(before: String? = nil) async throws -> [DisplayMessage] {
        switch source {
        case .channel(let id, _):
            return try await DatabaseService.messages(
                channelId: id, limit: Self.pageSize, before: before
            ).map(DisplayMessage.init)
        case .dm(let threadId, _):
            return try await DatabaseService.dmMessages(
                threadId: threadId, limit: Self.pageSize, before: before
            ).map(DisplayMessage.init)
        case .group(let id, _):
            return try await DatabaseService.groupMessages(
                groupId: id, limit: Self.pageSize, before: before
            ).map(DisplayMessage.init)
        }
    }

    private var oldestLoadedAt: String? {
        messages.first(where: { !$0.pending })?.createdAt
    }

    /// Load the page before the oldest message currently in memory.
    ///
    /// The returned Bool tells the list whether anything was inserted above
    /// the current position, so it can keep the reader's place instead of
    /// letting the new page shove the thread downward.
    @discardableResult
    func loadOlder() async -> Bool {
        guard !loadingOlder, hasMoreHistory, let before = oldestLoadedAt else { return false }
        loadingOlder = true
        defer { loadingOlder = false }

        do {
            let older = try await fetchMessages(before: before)
            let known = Set(messages.map(\.id))
            let fresh = older.filter { !known.contains($0.id) }
            if !fresh.isEmpty {
                messages.insert(contentsOf: fresh, at: 0)
                for m in fresh { if let a = m.author { profileCache[a.id] = a } }
                cacheNow()
                await loadReactions(for: fresh.map(\.id), replacing: false)
            }
            // A short page means there is nothing older left. If every row
            // came back as a duplicate the page was still full, so keep the
            // door open for another attempt.
            if older.count < Self.pageSize {
                hasMoreHistory = false
            }
            return !fresh.isEmpty
        } catch {
            // Leave `hasMoreHistory` alone: this is usually a transient
            // network failure, and the top-of-list sentinel should retry.
            return false
        }
    }

    /**
     Errors that are worth trying again on their own.

     A statement timeout is the database saying "not right now", not "this
     channel is broken" — it is transient by definition, and a channel that
     hit one used to present a dead end with the raw Postgres sentence on it
     ("canceling statement due to statement timeout") and no way forward but
     backing out of the channel and re-entering. One quiet retry turns almost
     all of those into a slightly slow open.

     Matched on the message text because PostgREST surfaces these as a decoded
     error body rather than a typed failure, so there is nothing else to match
     on.
     */
    private func isTransient(_ error: Error) -> Bool {
        let text = error.localizedDescription.lowercased()
        return text.contains("statement timeout")
            || text.contains("canceling statement")
            || text.contains("timed out")
            || text.contains("connection")
            || text.contains("network")
    }

    func load() async {
        loading = messages.isEmpty   // only spin when there's nothing to show
        loadError = nil
        do {
            let loaded: [DisplayMessage]
            do {
                loaded = try await fetchMessages()
            } catch let first where isTransient(first) {
                // One retry, after a beat long enough for a spike to pass.
                try? await Task.sleep(for: .milliseconds(700))
                loaded = try await fetchMessages()
            }
            for m in loaded { if let a = m.author { profileCache[a.id] = a } }
            // Keep any optimistic rows the server hasn't echoed back yet.
            let stillPending = messages.filter { opt in
                opt.pending && !loaded.contains { matches(opt, $0) }
            }
            // Also keep pages the reader already pulled in. Re-opening a
            // channel used to throw that history away and drop them back at
            // the newest fifty, even though the cache had more.
            let loadedIds = Set(loaded.map(\.id))
            let oldestFresh = loaded.first?.createdAt
            let olderPages: [DisplayMessage]
            if let oldestFresh {
                olderPages = messages.filter { old in
                    !old.pending && !loadedIds.contains(old.id) && old.createdAt < oldestFresh
                }
            } else {
                // A successful empty page means the conversation is empty,
                // not that the cache should keep showing deleted history.
                olderPages = []
            }
            messages = olderPages + loaded + stillPending
            // If the newest page was full there is probably another one
            // above it. A cached older page also means more may exist above
            // that, so keep the sentinel available until a short page proves
            // otherwise.
            hasMoreHistory = olderPages.isEmpty
                ? loaded.count >= Self.pageSize
                : true
            cacheNow()
        } catch {
            // The retry above has already been spent, so this is what the
            // reader sees. A Postgres internal sentence is not it.
            loadError = isTransient(error)
                ? "Couldn't load this conversation just now."
                : error.localizedDescription
        }
        loading = false
    }

    private func matches(_ a: DisplayMessage, _ b: DisplayMessage) -> Bool {
        a.authorId == b.authorId && a.content == b.content
            && (a.attachmentUrl ?? "") == (b.attachmentUrl ?? "")
    }

    // MARK: - Sending

    func send(content: String, authorId: String, replyToId: String? = nil) async {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await dispatch(content: trimmed, attachment: nil, replyToId: replyToId, authorId: authorId)
    }

    /// Send a GIF or uploaded image/file (optionally with a caption).
    func sendAttachment(_ attachment: OutgoingAttachment, caption: String = "",
                        replyToId: String? = nil, authorId: String) async {
        await dispatch(content: caption.trimmingCharacters(in: .whitespacesAndNewlines),
                       attachment: attachment, replyToId: replyToId, authorId: authorId)
    }

    /**
     Uploads a file and sends it, showing the upload in the conversation.

     The upload used to happen behind a spinner on the composer, so the message
     appeared only once it had finished — on a slow connection a large video
     looked like nothing was happening at all. A placeholder row goes in first
     and tracks the bytes, then becomes the real message.
     */
    func uploadAndSendAttachment(
        data: Data,
        filename: String,
        mimeType: String,
        type: AttachmentType,
        caption: String = "",
        replyToId: String? = nil,
        authorId: String,
    ) async {
        let placeholderId = "uploading-\(UUID().uuidString)"
        messages.append(DisplayMessage(
            id: placeholderId, authorId: authorId, author: currentUserProfile,
            content: caption.trimmingCharacters(in: .whitespacesAndNewlines),
            attachmentUrl: nil, attachmentType: type,
            attachmentName: filename, attachmentSize: data.count,
            replyToId: replyToId,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            editedAt: nil, pending: true, uploadProgress: 0,
        ))

        do {
            let result = try await MediaService.uploadImage(
                data, filename: filename, mimeType: mimeType,
                onProgress: { [weak self] fraction in
                    Task { @MainActor in
                        guard let self,
                              let index = self.messages.firstIndex(where: { $0.id == placeholderId })
                        else { return }
                        self.messages[index].uploadProgress = fraction
                    }
                },
            )
            messages.removeAll { $0.id == placeholderId }
            await sendAttachment(
                OutgoingAttachment(url: result.url, type: type.rawValue, key: result.key),
                caption: caption, replyToId: replyToId, authorId: authorId,
            )
        } catch {
            messages.removeAll { $0.id == placeholderId }
            loadError = error.localizedDescription
        }
    }

    /**
     Upload several images and send them as one message.

     Sequential, like the web's `uploadAttachments`, and for the same reason:
     ten concurrent uploads of phone-sized photos saturate an ordinary
     connection, make every one of them slow, and turn the progress number
     into noise. One placeholder row tracks the whole set — progress runs
     across all of them, so the bar moves steadily instead of resetting ten
     times.

     A failure part-way keeps what already landed rather than discarding it:
     the message goes out with the images that uploaded, and the rest are
     reported. Throwing the lot away would mean a dropped connection on the
     tenth photo costs the other nine.
     */
    func uploadAndSendAttachments(
        items: [(data: Data, filename: String, mimeType: String, type: AttachmentType)],
        caption: String = "",
        replyToId: String? = nil,
        authorId: String,
    ) async {
        guard !items.isEmpty else { return }
        if items.count == 1 {
            let only = items[0]
            await uploadAndSendAttachment(
                data: only.data, filename: only.filename, mimeType: only.mimeType,
                type: only.type, caption: caption, replyToId: replyToId, authorId: authorId)
            return
        }

        let placeholderId = "uploading-\(UUID().uuidString)"
        let totalBytes = items.reduce(0) { $0 + $1.data.count }
        messages.append(DisplayMessage(
            id: placeholderId, authorId: authorId, author: currentUserProfile,
            content: caption.trimmingCharacters(in: .whitespacesAndNewlines),
            attachmentUrl: nil, attachmentType: items[0].type,
            attachmentName: "\(items.count) images", attachmentSize: totalBytes,
            replyToId: replyToId,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            editedAt: nil, pending: true, uploadProgress: 0,
        ))

        var uploaded: [StoredAttachment] = []
        var failure: Error?

        for (index, item) in items.enumerated() {
            do {
                let result = try await MediaService.uploadImage(
                    item.data, filename: item.filename, mimeType: item.mimeType,
                    onProgress: { [weak self] fraction in
                        Task { @MainActor in
                            guard let self,
                                  let i = self.messages.firstIndex(where: { $0.id == placeholderId })
                            else { return }
                            // Across the whole set, not this one file.
                            self.messages[i].uploadProgress =
                                (Double(index) + fraction) / Double(items.count)
                        }
                    },
                )
                uploaded.append(StoredAttachment(
                    url: result.url, key: result.key, type: item.type,
                    name: item.filename, size: item.data.count))
            } catch {
                failure = error
                break
            }
        }

        messages.removeAll { $0.id == placeholderId }

        guard !uploaded.isEmpty else {
            loadError = failure?.localizedDescription ?? "Couldn't upload those images."
            return
        }

        do {
            _ = try await DatabaseService.sendMessageWithAttachments(
                source: source, authorId: authorId,
                content: caption.trimmingCharacters(in: .whitespacesAndNewlines),
                attachments: uploaded, replyToId: replyToId)
            await load()
            if failure != nil {
                loadError = "Sent \(uploaded.count) of \(items.count) — the rest didn't upload."
            }
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// Sends a video picked from Photos: converted to MP4 so every client can
    /// play it, then streamed up from disk. The progress card covers both
    /// steps — conversion is the first 30%, the upload the rest.
    func uploadAndSendVideo(source: URL, replyToId: String? = nil, authorId: String) async {
        let placeholderId = "uploading-\(UUID().uuidString)"
        let size = (try? FileManager.default.attributesOfItem(atPath: source.path)[.size] as? Int) ?? nil
        messages.append(DisplayMessage(
            id: placeholderId, authorId: authorId, author: currentUserProfile,
            content: "",
            attachmentUrl: nil, attachmentType: .video,
            attachmentName: "video.mp4", attachmentSize: size,
            replyToId: replyToId,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            editedAt: nil, pending: true, uploadProgress: 0,
        ))
        let report: @Sendable (Double) -> Void = { [weak self] fraction in
            Task { @MainActor in
                guard let self,
                      let index = self.messages.firstIndex(where: { $0.id == placeholderId }) else { return }
                self.messages[index].uploadProgress = fraction
            }
        }

        var converted: URL?
        defer {
            try? FileManager.default.removeItem(at: source)
            if let converted { try? FileManager.default.removeItem(at: converted) }
        }
        do {
            let mp4 = try await MediaService.prepareVideo(source) { report($0 * 0.3) }
            converted = mp4
            let result = try await MediaService.uploadFile(at: mp4, filename: "video.mp4", mimeType: "video/mp4") {
                report(0.3 + $0 * 0.7)
            }
            messages.removeAll { $0.id == placeholderId }
            await sendAttachment(
                OutgoingAttachment(url: result.url, type: AttachmentType.video.rawValue, key: result.key),
                caption: "", replyToId: replyToId, authorId: authorId,
            )
        } catch {
            messages.removeAll { $0.id == placeholderId }
            loadError = error.localizedDescription
        }
    }

    static func friendlySendError(_ error: Error) -> String {
        let text = error.localizedDescription
        let lower = text.lowercased()
        if lower.contains("timed out") { return "You're timed out in this space." }
        if lower.contains("row-level security") || lower.contains("permission") || lower.contains("42501") {
            return "You don't have permission to post here."
        }
        if lower.contains("rate") && lower.contains("limit") { return "Slow down — you're sending too fast." }
        return text.count <= 120 ? text : "Your message couldn't be sent."
    }

    private func dispatch(content: String, attachment: OutgoingAttachment?,
                          replyToId: String?, authorId: String) async {
        // Optimistic row — appears immediately in gray ("sending").
        let optimistic = DisplayMessage(
            id: "optimistic-\(UUID().uuidString)", authorId: authorId,
            author: currentUserProfile, content: content,
            attachmentUrl: attachment?.url,
            attachmentType: attachment.flatMap { AttachmentType(rawValue: $0.type) },
            replyToId: replyToId, createdAt: ISO8601DateFormatter().string(from: Date()),
            editedAt: nil, pending: true)
        messages.append(optimistic)

        do {
            // The insert echoes the row id back so a Tether ask can target the
            // exact message that was saved.
            let messageId: String
            let surface: String
            let threadId: String?
            switch source {
            case .channel(let id, _):
                messageId = try await DatabaseService.sendMessage(channelId: id, authorId: authorId,
                                                                  content: content, attachment: attachment,
                                                                  replyToId: replyToId)
                surface = "server"
                threadId = nil
            case .dm(let tid, _):
                messageId = try await DatabaseService.sendDmMessage(threadId: tid, authorId: authorId,
                                                                    content: content, attachment: attachment,
                                                                    replyToId: replyToId)
                surface = "dm"
                threadId = tid
            case .group(let id, _):
                messageId = try await DatabaseService.sendGroupMessage(groupId: id, authorId: authorId,
                                                                       content: content, attachment: attachment,
                                                                       replyToId: replyToId)
                surface = "group"
                threadId = nil
            }
            /*
             Promote the optimistic row the moment the insert answers.

             The id came back all along and was used only for the Tether ask,
             so the row kept its `optimistic-…` id and stayed `pending` until
             a realtime echo turned up that matched it on *content*. When the
             echo was late, dropped, or carried text the server had altered in
             any way, the message sat there greyed as "Sending…" forever —
             already sent, and saying otherwise.

             Nothing needs to be matched now: the insert told us the id, so
             the row becomes the real row here, and the echo (if it arrives)
             dedupes against that id instead of guessing from the text.
             */
            if let index = messages.firstIndex(where: { $0.id == optimistic.id }) {
                messages[index].id = messageId
                messages[index].pending = false
                cacheNow()
            }

            // A Tether ask rides along detached: its failure must never touch
            // the send.
            Task.detached {
                await TetherService.shared.fireAskIfNeeded(messageId: messageId, content: content,
                                                           surface: surface, threadId: threadId,
                                                           userId: authorId)
            }
        } catch {
            // Without this the grey "sending" bubble stayed forever, looking
            // like a slow send rather than a refused one.
            messages.removeAll { $0.id == optimistic.id }
            sendError = Self.friendlySendError(error)
        }
    }

    // MARK: - Reactions

    func loadReactions() async {
        await loadReactions(for: messages.map(\.id), replacing: true)
    }

    /// Fetch reactions for some messages without refetching the whole history.
    /// Long conversations can contain thousands of ids; PostgREST puts an
    /// `in(...)` filter in the URL, so they go in chunks, fetched together.
    ///
    /// `replacing` swaps the whole map (a full refresh). Otherwise only the
    /// ids asked about change — including clearing one whose last reaction was
    /// removed, which a plain merge would have left showing.
    private func loadReactions(for ids: [String], replacing: Bool) async {
        guard !ids.isEmpty else {
            if replacing { reactions = [:] }
            return
        }
        let context = source.contextType
        let chunkSize = 100
        let chunks = stride(from: 0, to: ids.count, by: chunkSize).map {
            Array(ids[$0..<min($0 + chunkSize, ids.count)])
        }
        let all: [MessageReaction] = await withTaskGroup(of: [MessageReaction].self) { group in
            for chunk in chunks {
                group.addTask {
                    (try? await DatabaseService.reactions(context: context, messageIds: chunk)) ?? []
                }
            }
            var rows: [MessageReaction] = []
            for await part in group { rows.append(contentsOf: part) }
            return rows
        }

        let grouped = summarizeAll(all)
        if replacing {
            reactions = grouped
        } else {
            for id in ids { reactions[id] = grouped[id] }
        }
        cacheNow()
    }

    /// Delete a message (author-only, enforced by RLS) and drop it locally.
    func deleteMessage(_ message: DisplayMessage) async {
        do {
            switch source {
            case .channel: try await DatabaseService.deleteChannelMessage(id: message.id)
            case .dm: try await DatabaseService.deleteDmMessage(id: message.id)
            case .group: try await DatabaseService.deleteGroupMessage(id: message.id)
            }
            messages.removeAll { $0.id == message.id }
            cacheNow()
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// Flips the chip at once, then confirms with the server and re-reads
    /// just this message. It used to wait for the round trip and then reload
    /// the reactions of every message in memory.
    func toggleReaction(messageId: String, emoji: String) async {
        guard let uid = currentUserId else { return }
        var list = reactions[messageId] ?? []
        let reacted = list.first { $0.emoji == emoji }?.reacted ?? false

        if let i = list.firstIndex(where: { $0.emoji == emoji }) {
            if reacted {
                list[i].count -= 1
                list[i].reacted = false
                list[i].userIds.removeAll { $0 == uid }
                if list[i].count <= 0 { list.remove(at: i) }
            } else {
                list[i].count += 1
                list[i].reacted = true
                list[i].userIds.append(uid)
            }
        } else if !reacted {
            list.append(ReactionSummary(emoji: emoji, count: 1, reacted: true, userIds: [uid]))
        }
        reactions[messageId] = list.isEmpty ? nil : list

        try? await DatabaseService.toggleReaction(context: source.contextType, messageId: messageId,
                                                  userId: uid, emoji: emoji, currentlyReacted: reacted)
        await loadReactions(for: [messageId], replacing: false)
    }

    /// Every message's chips in one pass over the rows (this used to scan
    /// all rows once per message).
    private func summarizeAll(_ all: [MessageReaction]) -> [String: [ReactionSummary]] {
        var byMessage: [String: [String: (count: Int, reacted: Bool, userIds: [String])]] = [:]
        for r in all {
            var e = byMessage[r.messageId, default: [:]][r.emoji] ?? (0, false, [])
            e.count += 1
            e.userIds.append(r.userId)
            if r.userId == currentUserId { e.reacted = true }
            byMessage[r.messageId, default: [:]][r.emoji] = e
        }
        return byMessage.mapValues { map in
            map.map {
                ReactionSummary(emoji: $0.key, count: $0.value.count,
                                reacted: $0.value.reacted, userIds: $0.value.userIds)
            }
            // Ties broken by emoji so chips don't swap places on a refresh.
            .sorted { $0.count != $1.count ? $0.count > $1.count : $0.emoji < $1.emoji }
        }
    }

    private func subscribeDeletes() async {
        // No filter: see RealtimeService.observeDeletes. A filtered delete
        // subscription silently misses every event because the old row only
        // carries its primary key.
        let (ch, stream) = await RealtimeService.observeDeletes(
            table: source.realtimeTable, filter: nil
        )
        deleteChannel = ch
        deleteTask = Task { [weak self] in
            for await id in stream {
                await self?.handleDelete(id)
            }
        }
    }

    private func handleDelete(_ id: String) {
        guard messages.contains(where: { $0.id == id }) else { return }
        messages.removeAll { $0.id == id }
        reactions.removeValue(forKey: id)
        cacheNow()
    }

    private func subscribeReactions() async {
        let (ch, stream) = await RealtimeService.observeInserts(
            table: "message_reactions",
            filter: "context_type=eq.\(source.contextType)",
            as: MessageReaction.self)
        reactionChannel = ch
        reactionTask = Task { [weak self] in
            for await r in stream {
                guard let self else { continue }
                // Only the message that changed.
                if self.messages.contains(where: { $0.id == r.messageId }) {
                    await self.loadReactions(for: [r.messageId], replacing: false)
                }
            }
        }
    }

    // MARK: - Realtime

    private func subscribe() async {
        let (ch, stream) = await RealtimeService.observeInserts(
            table: source.realtimeTable,
            filter: source.realtimeFilter,
            as: RawMessageRow.self
        )
        channel = ch
        listenTask = Task { [weak self] in
            for await row in stream {
                await self?.handleInsert(row)
            }
        }
    }

    private func handleInsert(_ row: RawMessageRow) async {
        guard !messages.contains(where: { $0.id == row.id }) else { return }

        // Keep the server's read cursor level with what is on screen. It was
        // only advanced when the conversation opened, so a message arriving
        // while you sat reading still counted as unread — and unread is
        // recomputed from those cursors, so the badge came back for the very
        // thread you were looking at.
        if row.authorId != currentUserId {
            switch source {
            case .dm(let threadId, _):
                Task { try? await DatabaseService.markDmRead(threadId: threadId) }
            case .group(let groupId, _):
                // Group cursors advanced only when the chat opened too, so a
                // message read in place still came back as unread after the
                // next foreground reload.
                Task { try? await DatabaseService.markGroupRead(groupId: groupId) }
            case .channel:
                break
            }
        }

        let author = await resolveProfile(row.authorId)
        var message = DisplayMessage(
            id: row.id, authorId: row.authorId, author: author,
            content: row.content ?? "", attachmentUrl: row.attachmentUrl,
            attachmentType: row.attachmentType, replyToId: row.replyToId,
            createdAt: row.createdAt, editedAt: row.editedAt,
            mentions: row.mentions
        )
        message.embeds = row.embeds ?? []
        message.webhook = row.webhook
        // Already here under its real id — the send promoted it before the
        // echo arrived, which is the normal order. Refresh it rather than
        // appending a duplicate.
        if let idx = messages.firstIndex(where: { $0.id == message.id }) {
            messages[idx] = message
            cacheNow()
            return
        }
        // Echo beat the insert's reply: still an optimistic row to confirm.
        if let idx = messages.firstIndex(where: {
            $0.pending && $0.authorId == message.authorId && $0.content == message.content
                && ($0.attachmentUrl ?? "") == (message.attachmentUrl ?? "")
        }) {
            messages[idx] = message
            cacheNow()
            return
        }
        messages.append(message)
        cacheNow()
    }

    private func resolveProfile(_ id: String) async -> Profile? {
        if let cached = profileCache[id] { return cached }
        if let fetched = try? await DatabaseService.profile(id: id) {
            profileCache[id] = fetched
            return fetched
        }
        return nil
    }
}
