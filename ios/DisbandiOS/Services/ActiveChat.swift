import Foundation

/// Which conversation is on screen right now.
///
/// A push carries the id of the conversation it is about, and the phone should
/// not interrupt you with a banner for the chat you are already reading. This
/// is the one piece of state that answers "are they looking at it?".
///
/// Deliberately not `@Observable`: nothing renders from it, and it is read from
/// the notification-centre delegate on a non-UI path.
final class ActiveChat: @unchecked Sendable {
    static let shared = ActiveChat()

    private let lock = NSLock()
    private var identifier: String?

    /// The channel, DM thread or group currently open, or nil for none.
    var current: String? {
        lock.lock()
        defer { lock.unlock() }
        return identifier
    }

    func open(_ id: String) {
        lock.lock()
        identifier = id
        lock.unlock()
    }

    /// Clears only if `id` is still the open one, so a fast switch between two
    /// conversations cannot have the outgoing screen clear the incoming one.
    func close(_ id: String) {
        lock.lock()
        if identifier == id { identifier = nil }
        lock.unlock()
    }

    /// True when a notification about `source` should stay silent.
    func isShowing(_ source: String?) -> Bool {
        guard let source, !source.isEmpty else { return false }
        return current == source
    }
}
