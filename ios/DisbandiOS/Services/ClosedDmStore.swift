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
