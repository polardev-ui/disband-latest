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

    private var client: SupabaseClient { SupabaseManager.client }
    private var channel: RealtimeChannelV2?
    private var listenTask: Task<Void, Never>?
    private var ownUserId: String?

    /// Join the shared channel and publish our own status. Call on sign-in with the
    /// current user id and their existing (or default) status.
    func start(userId: String?, status: UserStatus) async {
        stop()
        guard let userId else { return }
        ownUserId = userId

        let channel = client.channel("presence:global")
        self.channel = channel

        let changes = channel.presenceChange()
        listenTask = Task { [weak self] in
            for await action in changes {
                await self?.apply(action)
            }
        }

        await channel.subscribe()
        try? await channel.track(PresencePayload(userId: userId, status: status))
    }

    /// Publish a new status for the current user (e.g. from the status picker, or a
    /// transition to idle while backgrounded). Kept in our map too, so the sender's
    /// own UI reflects the change immediately.
    func update(_ status: UserStatus) async {
        guard let ownUserId else { return }
        statuses[ownUserId] = status
        try? await channel?.track(PresencePayload(userId: ownUserId, status: status))
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
        if let joins = try? action.decodeJoins(as: PresencePayload.self, decoder: decoder) {
            for entry in joins {
                statuses[entry.userId] = entry.status
            }
        }
        // When a client's presence is dropped (app closed / offline), remove it so a
        // friend's live status reads as offline rather than a stale cached one.
        if let leaves = try? action.decodeLeaves(as: PresencePayload.self, decoder: decoder) {
            for entry in leaves {
                if entry.userId != ownUserId {
                    statuses.removeValue(forKey: entry.userId)
                }
            }
        }
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
        statuses = [:]
    }
}
