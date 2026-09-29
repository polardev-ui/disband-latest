import Foundation
import Observation
import Supabase

/**
 Where a tapped notification should take you.

 Tapping a notification used to do nothing but bring the app forward,
 wherever it happened to be — usually the home screen, looking at a list of
 every conversation except the one the notification was about. iOS delivers
 the tap through `didReceive response`, and nothing was listening.

 The push carries a bare id in `source` with no clue what kind of thing it
 is. Prefixing it server-side would have been simpler but would break every
 app build already installed: those compare the bare id to decide whether a
 banner is about the chat on screen, so a prefixed source would start
 interrupting people in the conversation they are reading. The kind is
 resolved from the id instead, by `resolve_notification_source`, which is
 SECURITY INVOKER — a source the signed-in user cannot see comes back as
 `unknown` and is dropped rather than opened.

 Taps can arrive before the UI is ready to act on them: a notification that
 launches the app from cold is delivered while the shell is still being
 built, and before any session has been restored. So the destination is
 parked here and whoever can navigate picks it up when it can, rather than
 being told to navigate at a moment when it cannot.
 */
@MainActor
@Observable
final class NotificationRouter {
    static let shared = NotificationRouter()

    /// A conversation or screen waiting to be opened. Cleared by the consumer.
    enum Target: Equatable {
        case dm(threadId: String)
        case group(id: String, name: String)
        case channel(serverId: String, channelId: String, name: String)
        case friends
    }

    private(set) var target: Target?

    /// The raw source id from a tap that has not been resolved yet, kept so a
    /// cold start can resolve it once a session exists.
    private var unresolved: String?

    private init() {}

    /// Called from the notification-centre delegate. Cheap and synchronous —
    /// the lookup happens on `resolvePending`.
    nonisolated func handleTap(source: String?) {
        guard let source, !source.isEmpty else { return }
        Task { @MainActor in
            self.unresolved = source
            await self.resolvePending()
        }
    }

    /// Resolve a parked tap, if there is one and there is a session to resolve
    /// it with. Safe to call repeatedly; called again after sign-in so a
    /// cold-start tap is not lost.
    func resolvePending() async {
        guard let source = unresolved else { return }
        let client = SupabaseManager.client
        guard client.auth.currentUser != nil else { return }

        struct Resolved: Decodable {
            let kind: String
            let id: String?
            let name: String?
            let server_id: String?
        }

        do {
            let resolved: Resolved = try await client
                .rpc("resolve_notification_source", params: ["p_id": source])
                .execute()
                .value

            switch resolved.kind {
            case "dm":
                if let id = resolved.id { target = .dm(threadId: id) }
            case "group":
                if let id = resolved.id {
                    target = .group(id: id, name: resolved.name ?? "Group")
                }
            case "channel":
                if let id = resolved.id, let server = resolved.server_id {
                    target = .channel(serverId: server, channelId: id,
                                      name: resolved.name ?? "channel")
                }
            case "friend":
                // A friend request has no conversation to open yet; the
                // Friends tab is where it can be accepted.
                target = .friends
            default:
                break
            }
            unresolved = nil
        } catch {
            // Left parked: a tap that failed on a flaky connection is retried
            // the next time the app reaches a point where it would navigate.
            print("notification route failed: \(error)")
        }
    }

    /// Consume the destination. The consumer owns it from here.
    func take() -> Target? {
        defer { target = nil }
        return target
    }
}
