import Foundation
import Observation
import Realtime
import Supabase

/// Backs the Messages tab: loads DM threads (sorted by most recent activity)
/// plus group chats, and live-updates thread previews, ordering, and unread
/// counts as messages arrive over realtime.
@MainActor
@Observable
final class DirectMessagesViewModel {
    var threads: [DmThread] = []
    var groups: [GroupChat] = []
    var loading = true

    private var hasLoadedOnce = false
    private var channel: RealtimeChannelV2?
    private var messageTask: Task<Void, Never>?
    private var currentUserId: String?
    private var unreadStore: DmUnreadStore?

    func start(currentUserId: String?, unread: DmUnreadStore) async {
        self.currentUserId = currentUserId
        self.unreadStore = unread
        await load(currentUserId: currentUserId)
        await subscribeToMessages()
    }

    func stop() {
        messageTask?.cancel()
        messageTask = nil
        let ch = channel
        channel = nil
        Task { await ch?.unsubscribe() }
    }

    func leaveGroup(_ groupId: String) async {
        do {
            try await DatabaseService.leaveGroup(groupId: groupId)
            groups.removeAll { $0.id == groupId }
        } catch {
            // Surface transient failures gracefully.
        }
    }

    func load(currentUserId: String?) async {
        guard let uid = currentUserId else { return }
        // Only block the whole tab on the very first load. Re-entering the tab
        // used to flip back to the spinner and then repaint, which is what made
        // switching tabs flash a half-populated list.
        if !hasLoadedOnce { loading = true }
        defer {
            loading = false
            hasLoadedOnce = true
        }
        async let t = DatabaseService.myDmThreads(currentUserId: uid)
        async let g = DatabaseService.myGroups(currentUserId: uid)
        do {
            let (loadedThreads, loadedGroups) = try await (t, g)
            threads = sortByRecency(loadedThreads)
            groups = loadedGroups
        } catch {
            // Keep whatever is already on screen rather than blanking the list.
        }
    }

    // MARK: - Real-time updates

    private func subscribeToMessages() async {
        guard messageTask == nil else { return }
        let (channel, stream) = await RealtimeService.observeInserts(table: "dm_messages", as: DmMessage.self)
        self.channel = channel
        messageTask = Task { [weak self] in
            for await message in stream {
                await self?.handleIncoming(message)
            }
        }
    }

    private func handleIncoming(_ message: DmMessage) async {
        unreadStore?.increment(threadId: message.threadId,
                               senderId: message.authorId,
                               currentUserId: currentUserId)
        guard let idx = threads.firstIndex(where: { $0.id == message.threadId }) else { return }
        threads[idx].lastMessageAt = message.createdAt
        threads[idx].lastMessagePreview = Self.previewText(for: message)
        threads.sort { Self.recency($0) > Self.recency($1) }
    }

    // MARK: - Helpers

    /// Preview line for a thread row. Live messages carry attachment info;
    /// loaded rows fall back to the DB-cached preview column.
    nonisolated static func previewText(for message: DmMessage) -> String {
        if !message.content.isEmpty { return message.content }
        switch message.attachmentType {
        case .some(.image), .some(.gif): return "Photo"
        case .some(.video): return "Video"
        default: return "Attachment"
        }
    }

    static func preview(for thread: DmThread) -> String {
        guard let preview = thread.lastMessagePreview, !preview.isEmpty else {
            // A thread with no cached preview has nothing to show yet. It used
            // to claim "Attachment", which made every such row look like a file
            // had been sent.
            return thread.lastMessageAt == nil ? "No messages yet" : ""
        }
        return preview
    }

    /// Sort key for threads: most recent message (or thread creation) first.
    static func recency(_ thread: DmThread) -> Date {
        RelativeTime.date(from: thread.lastMessageAt ?? thread.createdAt) ?? .distantPast
    }

    private func sortByRecency(_ list: [DmThread]) -> [DmThread] {
        list.sorted { Self.recency($0) > Self.recency($1) }
    }
}
