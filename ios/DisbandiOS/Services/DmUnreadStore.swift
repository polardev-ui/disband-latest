import Foundation
import Observation

/// Per-conversation unread counts for the Messages tab (DMs and group chats).
///
/// Counts are incremented by a realtime listener while the user is not viewing
/// that chat and are persisted so they survive tab switches, backgrounding, and
/// relaunches. Opening a chat marks it read (locally here, and on the server so
/// the state is shared across devices).
@MainActor
@Observable
final class DmUnreadStore {
    private(set) var unread: [String: Int] = [:]
    private(set) var groupUnread: [String: Int] = [:]
    private(set) var activeThreadId: String?
    private(set) var activeGroupId: String?

    private static let dmKey = "dmUnreadCounts"
    private static let groupKey = "groupUnreadCounts"

    init() {
        unread = UserDefaults.standard.dictionary(forKey: Self.dmKey) as? [String: Int] ?? [:]
        groupUnread = UserDefaults.standard.dictionary(forKey: Self.groupKey) as? [String: Int] ?? [:]
    }

    /// The user opened `threadId` — zero its unread count and stop counting
    /// new messages there until they leave the chat.
    func markActive(threadId: String) {
        activeThreadId = threadId
        guard unread.removeValue(forKey: threadId) != nil else { return }
        persistDm()
    }

    func clearActive() {
        activeThreadId = nil
    }

    /// The user opened a group chat — zero its unread count.
    func markGroupActive(groupId: String) {
        activeGroupId = groupId
        guard groupUnread.removeValue(forKey: groupId) != nil else { return }
        persistGroup()
    }

    func clearGroupActive() {
        activeGroupId = nil
    }

    /// Bump the unread count for a thread (ignoring the user's own messages and
    /// messages in the chat they currently have open).
    func increment(threadId: String, senderId: String, currentUserId: String?) {
        guard senderId != currentUserId, threadId != activeThreadId else { return }
        unread[threadId, default: 0] += 1
        persistDm()
    }

    /// Bump the unread count for a group chat.
    func incrementGroup(groupId: String, senderId: String, currentUserId: String?) {
        guard senderId != currentUserId, groupId != activeGroupId else { return }
        groupUnread[groupId, default: 0] += 1
        persistGroup()
    }

    func count(for threadId: String) -> Int {
        unread[threadId] ?? 0
    }

    func countGroup(for groupId: String) -> Int {
        groupUnread[groupId] ?? 0
    }

    /// Replace DM counts with the server's authoritative values (used on load to
    /// recover messages that arrived while the app was closed).
    func seedUnread(_ counts: [String: Int]) {
        unread = counts
        persistDm()
    }

    /// Replace group counts with the server's authoritative values.
    func seedGroupUnread(_ counts: [String: Int]) {
        groupUnread = counts
        persistGroup()
    }

    private func persistDm() {
        UserDefaults.standard.set(unread, forKey: Self.dmKey)
    }

    private func persistGroup() {
        UserDefaults.standard.set(groupUnread, forKey: Self.groupKey)
    }
}
