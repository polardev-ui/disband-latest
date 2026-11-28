import Foundation
import Observation
import Realtime
import Supabase

/**
 The newest copy of every profile the app has seen, kept current live.

 Profiles used to be copied into whatever loaded them (a page of messages, a
 member list, the friends list) and never touched again, so a changed custom
 status, name or avatar only showed after that screen was reloaded — your own
 new status included, in the member list and the profile sheet.

 Mirrors the web (`watchedProfileIdsKey` in `AppContext.tsx`): one channel of
 `profiles` UPDATEs filtered to the people on screen, in chunks of 50 ids
 (Realtime rejects bigger `in` filters). Views read through `fresh(_:)`.
 */
@MainActor
@Observable
final class ProfileLive {
    static let shared = ProfileLive()

    /// Newest known row per user id.
    private(set) var latest: [String: Profile] = [:]

    @ObservationIgnored private var watched: [String] = []
    @ObservationIgnored private var watchedSet: Set<String> = []
    @ObservationIgnored private var subscribedKey = ""
    @ObservationIgnored private var channel: RealtimeChannelV2?
    @ObservationIgnored private var listenTasks: [Task<Void, Never>] = []
    @ObservationIgnored private var resubscribe: Task<Void, Never>?
    @ObservationIgnored private var ownerId: String?

    /// Most people watched at once: the web's per-screen set is about this size.
    private static let cap = 300
    private static let chunk = 50

    /// The newest copy of `profile`, or `profile` itself.
    func fresh(_ profile: Profile?) -> Profile? {
        guard let profile else { return nil }
        return latest[profile.id] ?? profile
    }

    func fresh(_ profile: Profile) -> Profile {
        latest[profile.id] ?? profile
    }

    /// Record a copy just loaded or saved. Fields only some queries carry
    /// (live music and game) are kept from the copy already held.
    func put(_ profile: Profile?) {
        guard var profile else { return }
        if let held = latest[profile.id] {
            if profile.listening == nil { profile.listening = held.listening }
            if profile.activity == nil { profile.activity = held.activity }
            if held == profile { return }
        }
        latest[profile.id] = profile
    }

    /// Newer copies of people already held (from a page of messages, say).
    /// Nobody new is added, so loading a page doesn't redraw every row.
    func refresh<S: Sequence>(_ profiles: S) where S.Element == Profile {
        for profile in profiles where latest[profile.id] != nil { put(profile) }
    }

    func start(userId: String?) {
        guard ownerId != userId else { return }
        ownerId = userId
        latest = [:]
        watched = []
        watchedSet = []
        subscribedKey = ""
        teardown()
        if let userId { watch([userId]) }
    }

    /// Follow these people's profile changes. Newest requests win when the
    /// set is full.
    func watch<S: Sequence>(_ ids: S) where S.Element == String {
        guard ownerId != nil else { return }
        var changed = false
        for id in ids where !id.isEmpty && !watchedSet.contains(id) {
            watched.append(id)
            watchedSet.insert(id)
            changed = true
        }
        guard changed else { return }
        if watched.count > Self.cap {
            // Keep yourself, drop the oldest others.
            let me = ownerId
            var trimmed = watched.filter { $0 != me }.suffix(Self.cap - 1).map { $0 }
            if let me { trimmed.insert(me, at: 0) }
            watched = trimmed
            watchedSet = Set(trimmed)
        }
        // Debounced: lists load in pages and would churn the channel.
        resubscribe?.cancel()
        resubscribe = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            await self?.subscribe()
        }
    }

    private func teardown() {
        listenTasks.forEach { $0.cancel() }
        listenTasks = []
        if let channel {
            let client = SupabaseManager.client
            Task { await client.removeChannel(channel) }
        }
        channel = nil
    }

    private func subscribe() async {
        guard let ownerId else { return }
        let ids = watched.sorted()
        let key = ids.joined(separator: ",")
        guard key != subscribedKey, !ids.isEmpty else { return }
        subscribedKey = key
        teardown()

        let ch = SupabaseManager.client.channel("watched-profiles:\(ownerId):\(UUID().uuidString.prefix(8))")
        var streams: [AsyncStream<UpdateAction>] = []
        for start in stride(from: 0, to: ids.count, by: Self.chunk) {
            let slice = ids[start ..< min(start + Self.chunk, ids.count)]
            streams.append(ch.postgresChange(
                UpdateAction.self, schema: "public", table: "profiles",
                filter: "id=in.(\(slice.joined(separator: ",")))"))
        }
        channel = ch
        for stream in streams {
            listenTasks.append(Task { [weak self] in
                let decoder = JSONDecoder()
                for await change in stream {
                    guard let row = try? change.decodeRecord(as: Profile.self, decoder: decoder) else { continue }
                    await MainActor.run { self?.put(row) }
                }
            })
        }
        await ch.subscribe()
    }
}
