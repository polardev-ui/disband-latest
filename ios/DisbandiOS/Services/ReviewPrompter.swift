import Foundation

/// Polite, strictly-capped App Store review prompts.
///
/// Apple's own throttle (roughly 3 prompts/year, and it may simply not show)
/// sits underneath this, but relying on it alone produces prompts at bad
/// moments. So this adds product gates on top: the account must be at least
/// a week old, the app opened a handful of times, no prompt in the last 120
/// days, at most 2 lifetime prompts, and a single "not really" silences it
/// forever. A declining user is a user with a complaint — they get the bug
/// report flow, not another popup.
///
/// State lives in UserDefaults (per device, not per account): reinstalling
/// resets it, which is the correct behavior for a new device.
final class ReviewPrompter: Sendable {
    static let shared = ReviewPrompter(store: .standard)

    /// Direct link to the review form, for the manual Settings row. The
    /// in-app popup uses StoreKit's requestReview instead (no app switch).
    static let writeReviewURL = URL(string: "https://apps.apple.com/app/id6783881800?action=write-review")!

    private let store: UserDefaults
    private let opensKey = "disband.review.opens"
    private let firstOpenKey = "disband.review.firstOpen"
    private let promptsKey = "disband.review.prompts"
    private let lastPromptKey = "disband.review.lastPrompt"
    private let declinedKey = "disband.review.declined"

    private let minOpens = 5
    private let minAccountDays = 7.0
    private let minDaysBetweenPrompts = 120.0
    private let maxLifetimePrompts = 2

    init(store: UserDefaults) {
        self.store = store
    }

    /// Record a foregrounding. Cheap and idempotent; call on every activation.
    func recordLaunch() {
        if store.object(forKey: firstOpenKey) == nil {
            store.set(Date().timeIntervalSince1970, forKey: firstOpenKey)
        }
        store.set(store.integer(forKey: opensKey) + 1, forKey: opensKey)
    }

    /// Whether the popup may appear right now. Signed-in check happens at
    /// the call site (it owns the user id); everything else is here.
    func shouldPrompt() -> Bool {
        guard !store.bool(forKey: declinedKey) else { return false }
        guard store.integer(forKey: opensKey) >= minOpens else { return false }
        let first = store.double(forKey: firstOpenKey)
        guard first > 0,
              Date().timeIntervalSince1970 - first >= minAccountDays * 86400 else { return false }
        guard store.integer(forKey: promptsKey) < maxLifetimePrompts else { return false }
        let last = store.double(forKey: lastPromptKey)
        if last > 0,
           Date().timeIntervalSince1970 - last < minDaysBetweenPrompts * 86400 { return false }
        return true
    }

    /// The popup was shown (whatever the user chose, except decline).
    func markPrompted() {
        store.set(store.integer(forKey: promptsKey) + 1, forKey: promptsKey)
        store.set(Date().timeIntervalSince1970, forKey: lastPromptKey)
    }

    /// "Not really" — never auto-ask again on this device.
    func markDeclined() {
        store.set(true, forKey: declinedKey)
    }
}
