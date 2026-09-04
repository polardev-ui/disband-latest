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
    private var startedForUserId: String?
    private var channel: RealtimeChannelV2?
    private var messageTask: Task<Void, Never>?
    private var groupChannel: RealtimeChannelV2?
    private var groupTask: Task<Void, Never>?
    private var currentUserId: String?
    private var unreadStore: DmUnreadStore?

    /// Idempotent: the app starts this at sign-in to warm the tab, and the tab
    /// calls it again when it first appears. The second call must not open a
    /// second realtime subscription or re-block the list on a spinner.
    func start(currentUserId: String?, unread: DmUnreadStore) async {
        self.unreadStore = unread

        if startedForUserId == currentUserId, hasLoadedOnce {
            // Already live for this user; just refresh quietly in place.
            await load(currentUserId: currentUserId)
            return
        }

        if startedForUserId != currentUserId { stop() }
        self.currentUserId = currentUserId
        self.startedForUserId = currentUserId
        await load(currentUserId: currentUserId)
        await subscribeToMessages()
    }

    func stop() {
        startedForUserId = nil
        messageTask?.cancel()
        messageTask = nil
        groupTask?.cancel()
        groupTask = nil
        let ch = channel
        channel = nil
        let gch = groupChannel
        groupChannel = nil
        Task {
            await ch?.unsubscribe()
            await gch?.unsubscribe()
        }
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
        async let dmU = DatabaseService.unreadDmCounts()
        async let grpU = DatabaseService.unreadGroupCounts()
        do {
            let (loadedThreads, loadedGroups, dmUnread, grpUnread) = try await (t, g, dmU, grpU)
            threads = sortByRecency(loadedThreads)
            groups = loadedGroups
            // Reconcile from server so messages received while the app was
            // closed (which realtime never delivered) still show as unread.
            unreadStore?.seedUnread(Dictionary(uniqueKeysWithValues: dmUnread.map { ($0.threadId, $0.unreadCount) }))
            unreadStore?.seedGroupUnread(Dictionary(uniqueKeysWithValues: grpUnread.map { ($0.groupId, $0.unreadCount) }))
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

        // Second subscription for group messages → unread badge counts.
        let (gchannel, gstream) = await RealtimeService.observeInserts(table: "group_messages", as: GroupMessage.self)
        self.groupChannel = gchannel
        groupTask = Task { [weak self] in
            for await message in gstream {
                self?.handleGroupIncoming(message)
            }
        }
    }

    private func handleGroupIncoming(_ message: GroupMessage) {
        unreadStore?.incrementGroup(groupId: message.groupId,
                                    senderId: message.authorId,
                                    currentUserId: currentUserId)
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
