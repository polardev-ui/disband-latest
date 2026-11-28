import Foundation
import Observation
import Realtime
import UIKit

/// Which server channels have messages you haven't read, shared with every
/// other device through `channel_reads` (migration 0229).
///
/// The server decides: `my_channel_unreads()` lists channels whose newest
/// message is newer than your last read. A new message anywhere, or a read
/// on another device, refreshes that list, so reading a channel on desktop
/// clears it here and a message sent while the app was closed still shows.
@MainActor
@Observable
final class ChannelUnreadStore {
    static let shared = ChannelUnreadStore()

    private(set) var unreadChannels: Set<String> = []
    private(set) var unreadServers: Set<String> = []
    /// Unread mentions per channel and per space: the red counts. From
    /// `get_channel_mention_unread()` (the web's `refreshMentionUnread`),
    /// counted from your unread mention notifications, so reading them on
    /// any device clears them everywhere.
    private(set) var mentionCounts: [String: Int] = [:]
    private(set) var serverMentionCounts: [String: Int] = [:]
    /// The channel on screen, which never counts as unread.
    private(set) var activeChannelId: String?

    private var started = false
    private var refreshTask: Task<Void, Never>?
    private var listenTasks: [Task<Void, Never>] = []
    private var channels: [RealtimeChannelV2] = []
    private var observers: [NSObjectProtocol] = []

    private struct MentionRow: Decodable, Sendable {
        let channelId: String
        let serverId: String?
        let mentionCount: Int
        enum CodingKeys: String, CodingKey {
            case channelId = "channel_id"
            case serverId = "server_id"
            case mentionCount = "mention_count"
        }
    }

    private struct Row: Decodable, Sendable {
        let channelId: String
        let serverId: String
        enum CodingKeys: String, CodingKey {
            case channelId = "channel_id"
            case serverId = "server_id"
        }
    }

    func isUnread(channelId: String) -> Bool {
        unreadChannels.contains(channelId) && channelId != activeChannelId
    }

    func hasUnread(serverId: String) -> Bool { unreadServers.contains(serverId) }

    func mentions(channelId: String) -> Int {
        channelId == activeChannelId ? 0 : mentionCounts[channelId] ?? 0
    }

    func mentions(serverId: String) -> Int { serverMentionCounts[serverId] ?? 0 }

    /// Posted whenever the mention counts change, so the app icon can follow.
    static let mentionsChanged = Notification.Name("ChannelUnreadStore.mentionsChanged")

    /// Begin listening. Safe to call repeatedly.
    func start() {
        guard !started else { return }
        started = true
        scheduleRefresh(after: 0)
        Task { await subscribe() }
        // The socket is dropped while backgrounded and nothing missed is
        // replayed, so re-read and re-join on the way back.
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                await self.resubscribe()
                self.scheduleRefresh(after: 0)
            }
        })
    }

    /// Signing out: forget the previous account's dots.
    func reset() {
        unreadChannels = []
        unreadServers = []
        mentionCounts = [:]
        serverMentionCounts = [:]
        activeChannelId = nil
        refreshTask?.cancel()
        Task { await unsubscribe() }
        for o in observers { NotificationCenter.default.removeObserver(o) }
        observers = []
        started = false
    }

    /// The reader opened a channel: clear it here at once and record the read
    /// on the server so other devices clear too.
    func open(channelId: String) {
        activeChannelId = channelId
        clearLocally(channelId)
        markRead(channelId)
        markMentionsRead(channelId)
    }

    /// "Mark as read" on a space: every channel's cursor and every mention
    /// in it, on the server (`mark_server_read`), as the web's menu does.
    func markServerRead(_ serverId: String) {
        unreadServers.remove(serverId)
        let channels = mentionChannels(in: serverId)
        for id in channels { mentionCounts[id] = nil }
        serverMentionCounts[serverId] = nil
        NotificationCenter.default.post(name: Self.mentionsChanged, object: nil)
        Task {
            _ = try? await SupabaseManager.client
                .rpc("mark_server_read", params: ["p_server_id": serverId])
                .execute()
            scheduleRefresh(after: 0.3)
        }
    }

    private var channelServer: [String: String] = [:]

    private func mentionChannels(in serverId: String) -> [String] {
        channelServer.filter { $0.value == serverId }.map(\.key)
    }

    func close(channelId: String) {
        guard activeChannelId == channelId else { return }
        // Anything that arrived while it was open has been seen.
        markRead(channelId)
        activeChannelId = nil
    }

    /// A message arrived in the open channel: keep the server's cursor level.
    func sawMessage(in channelId: String, mentionsMe: Bool = false) {
        guard activeChannelId == channelId else { return }
        markRead(channelId)
        // A ping in the channel you're reading is read, not a red badge
        // (the web marks it at once too).
        if mentionsMe { markMentionsRead(channelId, after: 1.5) }
    }

    /// `mark_channel_mentions_read`: the red count here, and the mention in
    /// the web's inbox, both clear.
    private func markMentionsRead(_ channelId: String, after delay: Double = 0) {
        if mentionCounts.removeValue(forKey: channelId) != nil, let server = channelServer[channelId] {
            recountServer(server)
            NotificationCenter.default.post(name: Self.mentionsChanged, object: nil)
        }
        Task {
            // The notification row is written by a trigger just after the
            // message; asking too early would leave it behind.
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            _ = try? await SupabaseManager.client
                .rpc("mark_channel_mentions_read", params: ["p_channel_id": channelId])
                .execute()
            NotificationCenter.default.post(name: Self.mentionsChanged, object: nil)
        }
    }

    private func recountServer(_ serverId: String) {
        let total = mentionChannels(in: serverId).reduce(0) { $0 + (mentionCounts[$1] ?? 0) }
        serverMentionCounts[serverId] = total > 0 ? total : nil
    }

    private func markRead(_ channelId: String) {
        Task {
            _ = try? await SupabaseManager.client
                .rpc("mark_channel_read", params: ["p_channel_id": channelId])
                .execute()
        }
    }

    private func clearLocally(_ channelId: String) {
        guard unreadChannels.remove(channelId) != nil else { return }
        // The server's dot clears with its last unread channel; the next
        // refresh settles which servers still have one.
        scheduleRefresh(after: 0.4)
    }

    /// Re-read dots and pings shortly (after a space's mute changed, say).
    func refreshSoon() { scheduleRefresh(after: 0.3) }

    private func scheduleRefresh(after seconds: Double) {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            if seconds > 0 { try? await Task.sleep(for: .seconds(seconds)) }
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }

    private func refresh() async {
        // Both at once: neither depends on the other.
        async let unreadCall: [Row]? = try? SupabaseManager.client
            .rpc("my_channel_unreads")
            .execute()
            .value
        async let mentionCall: [MentionRow]? = try? SupabaseManager.client
            .rpc("get_channel_mention_unread")
            .execute()
            .value
        let (rows, mentionRows) = await (unreadCall, mentionCall)
        let active = activeChannelId
        if let rows {
            let visible = rows.filter { $0.channelId != active }
            unreadChannels = Set(visible.map(\.channelId))
            unreadServers = Set(visible.map(\.serverId))
            for row in rows { channelServer[row.channelId] = row.serverId }
        }
        if let mentionRows {
            var channels: [String: Int] = [:]
            var servers: [String: Int] = [:]
            var activeHasMentions = false
            for row in mentionRows where row.mentionCount > 0 {
                if let server = row.serverId { channelServer[row.channelId] = server }
                if row.channelId == active {
                    activeHasMentions = true
                    continue
                }
                channels[row.channelId] = row.mentionCount
                if let server = row.serverId { servers[server, default: 0] += row.mentionCount }
            }
            let changed = channels != mentionCounts || servers != serverMentionCounts
            mentionCounts = channels
            serverMentionCounts = servers
            if let active, activeHasMentions { markMentionsRead(active) }
            if changed { NotificationCenter.default.post(name: Self.mentionsChanged, object: nil) }
        }
    }

    private func subscribe() async {
        // New messages anywhere you can see (RLS filters the rows), and your
        // own reads from other devices. Either way, ask the server again;
        // debounced so a busy channel costs one call a second at most.
        let (msgCh, msgs) = await RealtimeService.observeChanges(table: "messages")
        let (readCh, reads) = await RealtimeService.observeChanges(table: "channel_reads")
        // Your notifications (RLS delivers only your own rows): a new ping,
        // or one read on another device, moves the red counts.
        let (noteCh, notes) = await RealtimeService.observeChanges(table: "notifications")
        channels = [msgCh, readCh, noteCh]
        listenTasks = [
            Task { [weak self] in
                for await _ in notes { await self?.scheduleRefresh(after: 0.5) }
            },
            Task { [weak self] in
                for await _ in msgs { await self?.scheduleRefresh(after: 1) }
            },
            Task { [weak self] in
                for await _ in reads { await self?.scheduleRefresh(after: 0.3) }
            },
        ]
    }

    private func unsubscribe() async {
        for t in listenTasks { t.cancel() }
        listenTasks = []
        let old = channels
        channels = []
        for ch in old { await ch.unsubscribe() }
    }

    private func resubscribe() async {
        guard started else { return }
        await unsubscribe()
        await subscribe()
    }
}
