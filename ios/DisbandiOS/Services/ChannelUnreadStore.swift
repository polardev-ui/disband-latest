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
    /// The channel on screen, which never counts as unread.
    private(set) var activeChannelId: String?

    private var started = false
    private var refreshTask: Task<Void, Never>?
    private var listenTasks: [Task<Void, Never>] = []
    private var channels: [RealtimeChannelV2] = []
    private var observers: [NSObjectProtocol] = []

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
    }

    func close(channelId: String) {
        guard activeChannelId == channelId else { return }
        // Anything that arrived while it was open has been seen.
        markRead(channelId)
        activeChannelId = nil
    }

    /// A message arrived in the open channel: keep the server's cursor level.
    func sawMessage(in channelId: String) {
        guard activeChannelId == channelId else { return }
        markRead(channelId)
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

    private func scheduleRefresh(after seconds: Double) {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            if seconds > 0 { try? await Task.sleep(for: .seconds(seconds)) }
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }

    private func refresh() async {
        guard let rows: [Row] = try? await SupabaseManager.client
            .rpc("my_channel_unreads")
            .execute()
            .value else { return }
        let active = activeChannelId
        let visible = rows.filter { $0.channelId != active }
        unreadChannels = Set(visible.map(\.channelId))
        unreadServers = Set(visible.map(\.serverId))
    }

    private func subscribe() async {
        // New messages anywhere you can see (RLS filters the rows), and your
        // own reads from other devices. Either way, ask the server again;
        // debounced so a busy channel costs one call a second at most.
        let (msgCh, msgs) = await RealtimeService.observeChanges(table: "messages")
        let (readCh, reads) = await RealtimeService.observeChanges(table: "channel_reads")
        channels = [msgCh, readCh]
        listenTasks = [
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
