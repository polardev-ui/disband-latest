import Foundation
import Observation

/// Per-thread unread DM counts for the Messages tab.
///
/// Counts are incremented by a realtime listener while the user is not viewing
/// that chat and are persisted so they survive tab switches, backgrounding, and
/// relaunches. Opening a chat marks its thread read.
@MainActor
@Observable
final class DmUnreadStore {
    private(set) var unread: [String: Int] = [:]
    private(set) var activeThreadId: String?

    private static let key = "dmUnreadCounts"

    init() {
        unread = UserDefaults.standard.dictionary(forKey: Self.key) as? [String: Int] ?? [:]
    }

    /// The user opened `threadId` — zero its unread count and stop counting
    /// new messages there until they leave the chat.
    func markActive(threadId: String) {
        activeThreadId = threadId
        guard unread.removeValue(forKey: threadId) != nil else { return }
        persist()
    }

    func clearActive() {
        activeThreadId = nil
    }

    /// Bump the unread count for a thread (ignoring the user's own messages and
    /// messages in the chat they currently have open).
    func increment(threadId: String, senderId: String, currentUserId: String?) {
        guard senderId != currentUserId, threadId != activeThreadId else { return }
        unread[threadId, default: 0] += 1
        persist()
    }

    func count(for threadId: String) -> Int {
        unread[threadId] ?? 0
    }

    private func persist() {
        UserDefaults.standard.set(unread, forKey: Self.key)
    }
}
