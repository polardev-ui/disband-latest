import Foundation
import Observation
import Realtime
import Supabase

/// A single entry in the shared `presence:global` channel.
/// Field names must match the web app's `PresencePayload` (`src/lib/presence.ts`)
/// so both platforms see the same live status for every user.
struct PresencePayload: Codable, Sendable {
    let userId: String
    let status: UserStatus
    /// What this device says is playing, from `MusicPresenceService`. Sent as
    /// null when nothing is, which web reads as "present, not playing".
    var listening: Listening? = nil

    init(userId: String, status: UserStatus, listening: Listening? = nil) {
        self.userId = userId
        self.status = status
        self.listening = listening
    }

    private enum CodingKeys: String, CodingKey {
        case userId
        case status
        case listening
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(userId, forKey: .userId)
        try container.encode(status, forKey: .status)
        try container.encode(listening, forKey: .listening)
    }

    /// Web treats a missing status as online, and an unknown future status must
    /// not make the whole entry disappear. A strict enum decode did exactly
    /// that: one client publishing a status this build has never heard of made
    /// the person look offline everywhere on iOS.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userId = try container.decode(String.self, forKey: .userId)
        let raw = try container.decodeIfPresent(String.self, forKey: .status)
        status = raw.flatMap(UserStatus.init(rawValue:)) ?? .online
        listening = try? container.decodeIfPresent(Listening.self, forKey: .listening)
    }
}

/// Live presence for the signed-in user.
///
/// Mirrors the web app (`src/lib/presence.ts`): every online client joins a shared
/// Realtime presence channel and tracks its own `{ userId, status }`. When the app
/// closes or the socket dies, the Realtime server drops that presence automatically,
/// so stale "online" rows can never persist — which is what the old behaviour
/// (reading a static `profiles.status` column) got wrong: friends showed stale or
/// invisible statuses and iOS never broadcast its own status to anyone.
@MainActor
@Observable
final class PresenceService {
    /// Live status per user id, sourced from the presence channel.
    private(set) var statuses: [String: UserStatus] = [:]

    /// Every live client entry, keyed by the server's presence reference.
    /// A person can be signed in on more than one device or tab; keeping the
    /// refs separately means one session leaving (or being invisible) cannot
    /// erase another session that is still online.
    private var presenceRefs: [String: PresencePayload] = [:]

    private var client: SupabaseClient { SupabaseManager.client }
    private var channel: RealtimeChannelV2?
    private var listenTask: Task<Void, Never>?
    private var ownUserId: String?
    private(set) var ownStatus: UserStatus?
    private var ownListening: Listening?

    /// Join the shared channel and publish our own status. Call on sign-in with the
    /// current user id and their existing (or default) status.
    func start(userId: String?, status: UserStatus) async {
        stop()
        guard let userId else { return }
        ownUserId = userId
        ownStatus = status
        statuses[userId] = status

        let channel = client.channel("presence:global")
        self.channel = channel

        let changes = channel.presenceChange()
        listenTask = Task { [weak self] in
            for await action in changes {
                await self?.apply(action)
            }
        }

        await channel.subscribe()
        try? await channel.track(PresencePayload(userId: userId, status: status, listening: ownListening))
    }

    /// Publish a new status for the current user (e.g. from the status picker, or a
    /// transition to idle while backgrounded). Kept in our map too, so the sender's
    /// own UI reflects the change immediately.
    func update(_ status: UserStatus) async {
        guard let ownUserId else { return }
        ownStatus = status
        statuses[ownUserId] = status
        try? await channel?.track(PresencePayload(userId: ownUserId, status: status, listening: ownListening))
    }

    /// Publish what this device's Spotify connection says is playing.
    func updateListening(_ listening: Listening?) async {
        ownListening = listening
        guard let ownUserId, let ownStatus else { return }
        try? await channel?.track(PresencePayload(userId: ownUserId, status: ownStatus, listening: listening))
    }

    /// How a given user is currently showing. Returns `fallback` (default `.offline`)
    /// when they are not in the live presence set. This mirrors the web's
    /// `presenceStatusFor`, which deliberately returns offline — not a stale
    /// `profiles.status` — when a user has no live connection.
    func status(for userId: String, fallback: UserStatus = .offline) -> UserStatus {
        statuses[userId] ?? fallback
    }

    private func apply(_ action: any PresenceAction) async {
        let decoder = JSONDecoder()
        var changed = false

        for entry in action.joins.values {
            guard let payload = try? entry.decodeState(as: PresencePayload.self, decoder: decoder) else {
                continue
            }
            presenceRefs[entry.ref] = payload
            changed = true
        }

        // A leave is for one presence ref, not necessarily the person's only
        // session. Remove just that ref and rebuild from what remains.
        for entry in action.leaves.values {
            if presenceRefs.removeValue(forKey: entry.ref) != nil {
                changed = true
            }
        }

        if changed { rebuildStatuses() }
    }

    private static func rank(_ status: UserStatus) -> Int {
        switch status {
        case .dnd: return 4
        case .online: return 3
        case .idle: return 2
        case .offline: return 0
        }
    }

    private func rebuildStatuses() {
        var next: [String: UserStatus] = [:]
        for payload in presenceRefs.values {
            // Several live sessions (phone + desktop): the most present one
            // wins, whatever order they synced in, same as the web.
            if let current = next[payload.userId], Self.rank(current) >= Self.rank(payload.status) { continue }
            next[payload.userId] = payload.status
        }
        // Our own entry can arrive without a decodable state payload, so keep
        // the status this client knows it published.
        if let ownUserId, let ownStatus {
            next[ownUserId] = ownStatus
        }
        statuses = next
    }

    func stop() {
        listenTask?.cancel()
        listenTask = nil
        let channel = self.channel
        self.channel = nil
        Task {
            await channel?.untrack()
            await channel?.unsubscribe()
        }
        presenceRefs = [:]
        ownStatus = nil
        ownListening = nil
        statuses = [:]
    }
}
