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
    /// Unread mentions from servers, which this store does not own — the
    /// notifications list sets it. Kept here so one place decides the badge.
    private(set) var mentionCount: Int = 0

    private static let dmKey = "dmUnreadCounts"
    private static let groupKey = "groupUnreadCounts"
    private static let mentionKey = "unreadMentionCount"

    init() {
        unread = UserDefaults.standard.dictionary(forKey: Self.dmKey) as? [String: Int] ?? [:]
        groupUnread = UserDefaults.standard.dictionary(forKey: Self.groupKey) as? [String: Int] ?? [:]
        mentionCount = UserDefaults.standard.integer(forKey: Self.mentionKey)
        syncBadge()
    }

    /// Everything the app icon should be counting.
    var badgeTotal: Int {
        unread.values.reduce(0, +) + groupUnread.values.reduce(0, +) + mentionCount
    }

    /// How many server mentions are outstanding, from the notifications list.
    func setMentionCount(_ count: Int) {
        let value = max(0, count)
        guard value != mentionCount else { return }
        mentionCount = value
        UserDefaults.standard.set(value, forKey: Self.mentionKey)
        syncBadge()
    }

    /// Signing out must not leave the previous account's number on the icon.
    func reset() {
        unread = [:]
        groupUnread = [:]
        mentionCount = 0
        persistDm()
        persistGroup()
        UserDefaults.standard.set(0, forKey: Self.mentionKey)
        syncBadge()
    }

    private func syncBadge() {
        AppIconBadge.apply(badgeTotal)
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

    // Every mutation above persists, so the badge is refreshed from here
    // rather than from each call site — one of which will otherwise be missed.
    private func persistDm() {
        UserDefaults.standard.set(unread, forKey: Self.dmKey)
        syncBadge()
    }

    private func persistGroup() {
        UserDefaults.standard.set(groupUnread, forKey: Self.groupKey)
        syncBadge()
    }
}
