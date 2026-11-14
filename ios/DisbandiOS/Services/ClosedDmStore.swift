import Foundation
import Observation

/// DMs the user closed from the Messages list.
///
/// Closing hides the row; a new message from that friend — or opening the
/// conversation again from anywhere (notification, Friends tab) — brings the
/// row and its history back. Persisted per account under the same
/// `disband:closed-dms:` key the web client uses, so the behaviour reads the
/// same on both platforms.
@MainActor
@Observable
final class ClosedDmStore {
    private(set) var closedFriendIds: Set<String> = []
    private var userId: String?

    private static func key(_ uid: String) -> String { "disband:closed-dms:\(uid)" }

    /// Called whenever the signed-in account changes; reloads the set so one
    /// account's closed list never leaks into another's.
    func activate(currentUserId: String?) {
        guard userId != currentUserId else { return }
        userId = currentUserId
        guard let uid = currentUserId else {
            closedFriendIds = []
            return
        }
        let raw = UserDefaults.standard.stringArray(forKey: Self.key(uid)) ?? []
        closedFriendIds = Set(raw)
    }

    func isClosed(_ friendId: String?) -> Bool {
        guard let friendId else { return false }
        return closedFriendIds.contains(friendId)
    }

    func close(_ friendId: String) {
        guard !closedFriendIds.contains(friendId) else { return }
        closedFriendIds.insert(friendId)
        persist()
    }

    func unhide(_ friendId: String?) {
        guard let friendId, closedFriendIds.contains(friendId) else { return }
        closedFriendIds.remove(friendId)
        persist()
    }

    private func persist() {
        guard let uid = userId else { return }
        UserDefaults.standard.set(Array(closedFriendIds), forKey: Self.key(uid))
    }
}

/// DMs and group chats pinned to the top of the Messages list (hold a row,
/// then Pin to Top). Stored server-side in `pinned_conversations`, the same
/// table the web and desktop apps use, so a pin shows up everywhere.
@MainActor
@Observable
final class PinnedConversationStore {
    static let shared = PinnedConversationStore()

    enum Kind: String { case dm, group }

    /// "kind:id" → when it was pinned.
    private(set) var pins: [String: Date] = [:]
    private var userId: String?

    private static func key(_ kind: Kind, _ id: String) -> String { "\(kind.rawValue):\(id)" }

    private struct Row: Codable {
        let kind: String
        let conversation_id: String
        let pinned_at: String?
    }

    private struct NewRow: Encodable {
        let user_id: String
        let kind: String
        let conversation_id: String
    }

    func load(currentUserId: String?) async {
        if userId != currentUserId { pins = [:] }
        userId = currentUserId
        guard let uid = currentUserId else { return }
        guard let rows: [Row] = try? await SupabaseManager.client
            .from("pinned_conversations")
            .select("kind, conversation_id, pinned_at")
            .eq("user_id", value: uid)
            .execute()
            .value, userId == uid else { return }
        var next: [String: Date] = [:]
        for row in rows {
            next["\(row.kind):\(row.conversation_id)"] = RelativeTime.date(from: row.pinned_at) ?? .distantPast
        }
        pins = next
    }

    func pinnedAt(_ kind: Kind, _ id: String) -> Date? { pins[Self.key(kind, id)] }

    func toggle(_ kind: Kind, _ id: String) {
        guard let uid = userId else { return }
        let key = Self.key(kind, id)
        if pins[key] != nil {
            let before = pins[key]
            pins[key] = nil
            Task {
                do {
                    try await SupabaseManager.client.from("pinned_conversations").delete()
                        .eq("user_id", value: uid).eq("kind", value: kind.rawValue)
                        .eq("conversation_id", value: id).execute()
                } catch {
                    if userId == uid { pins[key] = before }
                }
            }
        } else {
            pins[key] = Date()
            Task {
                do {
                    try await SupabaseManager.client.from("pinned_conversations")
                        .insert(NewRow(user_id: uid, kind: kind.rawValue, conversation_id: id)).execute()
                } catch {
                    // Already pinned on another device is still pinned.
                    if userId == uid, !"\(error)".contains("23505") { pins[key] = nil }
                }
            }
        }
    }
}
