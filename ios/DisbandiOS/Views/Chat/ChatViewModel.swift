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
    /// A send that the server refused. Shown above the composer; `loadError`
    /// only appears in an empty conversation, so a rejected send in a busy
    /// channel used to fail with no sign at all.
    var sendError: String?
    var currentUserId: String?
    var currentUserProfile: Profile?

    private var profileCache: [String: Profile] = [:]
    private var channel: RealtimeChannelV2?
    private var listenTask: Task<Void, Never>?
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
        await load()
        await loadReactions()
        await subscribe()
        await subscribeReactions()
        await detectSelfDm()
        await subscribeTyping()
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
        Task {
            await TypingService.send(topic: topic, userId: me, name: displayName)
        }
    }

    private func cacheNow() {
        ChatCache.shared.store(source.cacheKey, messages: messages, reactions: reactions)
    }

    func stop() {
        listenTask?.cancel()
        reactionTask?.cancel()
        typingTask?.cancel()
        for task in typingTimers.values { task.cancel() }
        typingTimers = [:]
        let ch = channel, rc = reactionChannel, tc = typingChannel
        channel = nil; reactionChannel = nil; typingChannel = nil
        Task { await ch?.unsubscribe(); await rc?.unsubscribe(); await tc?.unsubscribe() }
    }

    /// Resolve a replied-to message from the loaded set (for inline previews).
    func repliedMessage(for message: DisplayMessage) -> DisplayMessage? {
        guard let id = message.replyToId else { return nil }
        return messages.first { $0.id == id }
    }

    // MARK: - Loading

    func load() async {
        loading = messages.isEmpty   // only spin when there's nothing to show
        loadError = nil
        do {
            let loaded: [DisplayMessage]
            switch source {
            case .channel(let id, _):
                loaded = try await DatabaseService.messages(channelId: id).map(DisplayMessage.init)
            case .dm(let threadId, _):
                loaded = try await DatabaseService.dmMessages(threadId: threadId).map(DisplayMessage.init)
            case .group(let id, _):
                loaded = try await DatabaseService.groupMessages(groupId: id).map(DisplayMessage.init)
            }
            for m in loaded { if let a = m.author { profileCache[a.id] = a } }
            // Keep any optimistic rows the server hasn't echoed back yet.
            let stillPending = messages.filter { opt in
                opt.pending && !loaded.contains { matches(opt, $0) }
            }
            messages = loaded + stillPending
            cacheNow()
        } catch {
            loadError = error.localizedDescription
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
            switch source {
            case .channel(let id, _):
                try await DatabaseService.sendMessage(channelId: id, authorId: authorId,
                                                      content: content, attachment: attachment,
                                                      replyToId: replyToId)
            case .dm(let threadId, _):
                try await DatabaseService.sendDmMessage(threadId: threadId, authorId: authorId,
                                                        content: content, attachment: attachment,
                                                        replyToId: replyToId)
            case .group(let id, _):
                try await DatabaseService.sendGroupMessage(groupId: id, authorId: authorId,
                                                           content: content, attachment: attachment,
                                                           replyToId: replyToId)
            }
            // The realtime INSERT echoes the row back and appends it.
        } catch {
            // Without this the grey "sending" bubble stayed forever, looking
            // like a slow send rather than a refused one.
            messages.removeAll { $0.id == optimistic.id }
            sendError = Self.friendlySendError(error)
        }
    }

    // MARK: - Reactions

    func loadReactions() async {
        let ids = messages.map(\.id)
        guard !ids.isEmpty else { reactions = [:]; return }
        let all = (try? await DatabaseService.reactions(context: source.contextType, messageIds: ids)) ?? []
        var grouped: [String: [ReactionSummary]] = [:]
        for id in ids {
            let s = summarize(all, messageId: id)
            if !s.isEmpty { grouped[id] = s }
        }
        reactions = grouped
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

    func toggleReaction(messageId: String, emoji: String) async {
        guard let uid = currentUserId else { return }
        let reacted = reactions[messageId]?.first { $0.emoji == emoji }?.reacted ?? false
        try? await DatabaseService.toggleReaction(context: source.contextType, messageId: messageId,
                                                  userId: uid, emoji: emoji, currentlyReacted: reacted)
        await loadReactions()
    }

    private func summarize(_ all: [MessageReaction], messageId: String) -> [ReactionSummary] {
        var map: [String: (count: Int, reacted: Bool, userIds: [String])] = [:]
        for r in all where r.messageId == messageId {
            var e = map[r.emoji] ?? (0, false, [])
            e.count += 1
            e.userIds.append(r.userId)
            if r.userId == currentUserId { e.reacted = true }
            map[r.emoji] = e
        }
        return map.map {
            ReactionSummary(emoji: $0.key, count: $0.value.count,
                            reacted: $0.value.reacted, userIds: $0.value.userIds)
        }
        .sorted { $0.count > $1.count }
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
                if self.messages.contains(where: { $0.id == r.messageId }) {
                    await self.loadReactions()
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
        if row.authorId != currentUserId, case .dm(let threadId, _) = source {
            Task { try? await DatabaseService.markDmRead(threadId: threadId) }
        }

        let author = await resolveProfile(row.authorId)
        let message = DisplayMessage(
            id: row.id, authorId: row.authorId, author: author,
            content: row.content ?? "", attachmentUrl: row.attachmentUrl,
            attachmentType: row.attachmentType, replyToId: row.replyToId,
            createdAt: row.createdAt, editedAt: row.editedAt,
            mentions: row.mentions
        )
        // If this confirms one of our optimistic rows, swap it in place (gray → white).
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
