import Foundation
import Supabase
import Realtime
import Observation

@MainActor
@Observable
final class ChatViewModel {
    let source: ChatSource

    var messages: [DisplayMessage] = []
    var reactions: [String: [ReactionSummary]] = [:]   // messageId -> summaries
    var loading = true
    var loadError: String?
    var currentUserId: String?
    var currentUserProfile: Profile?

    private var profileCache: [String: Profile] = [:]
    private var channel: RealtimeChannelV2?
    private var listenTask: Task<Void, Never>?
    private var reactionChannel: RealtimeChannelV2?
    private var reactionTask: Task<Void, Never>?

    init(source: ChatSource) {
        self.source = source
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
    }

    private func cacheNow() {
        ChatCache.shared.store(source.cacheKey, messages: messages, reactions: reactions)
    }

    func stop() {
        listenTask?.cancel()
        reactionTask?.cancel()
        let ch = channel, rc = reactionChannel
        channel = nil; reactionChannel = nil
        Task { await ch?.unsubscribe(); await rc?.unsubscribe() }
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
            loadError = error.localizedDescription
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
        var map: [String: (count: Int, reacted: Bool)] = [:]
        for r in all where r.messageId == messageId {
            var e = map[r.emoji] ?? (0, false)
            e.count += 1
            if r.userId == currentUserId { e.reacted = true }
            map[r.emoji] = e
        }
        return map.map { ReactionSummary(emoji: $0.key, count: $0.value.count, reacted: $0.value.reacted) }
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
        let author = await resolveProfile(row.authorId)
        let message = DisplayMessage(
            id: row.id, authorId: row.authorId, author: author,
            content: row.content ?? "", attachmentUrl: row.attachmentUrl,
            attachmentType: row.attachmentType, replyToId: row.replyToId,
            createdAt: row.createdAt, editedAt: row.editedAt
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
