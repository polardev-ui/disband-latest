import Foundation
import UserNotifications

/**
 The number on the app icon.

 iOS only draws a badge if the user granted the `.badge` authorization, which
 `PushManager` asks for alongside alerts. Without it `setBadgeCount` succeeds
 and shows nothing, so there is no separate permission to check here.

 Two things feed it and they must not fight:
   - the app itself, from unread DMs and group messages plus unread mentions,
     which is what `apply` writes; and
   - APNs, which carries a `badge` in its payload so the number is right while
     the app is not running at all.

 Both compute the same total server-side and client-side, so whichever lands
 last is still correct. The one rule is that the app always writes on becoming
 active, so a push that arrived with a stale count is corrected as soon as the
 user looks.
 */
@MainActor
enum AppIconBadge {
    private static var lastWritten: Int = -1

    /// Set the icon badge. Repeated calls with the same value are dropped —
    /// this is driven from observable state that changes far more often than
    /// the total does.
    static func apply(_ count: Int) {
        let value = max(0, count)
        guard value != lastWritten else { return }
        lastWritten = value
        UNUserNotificationCenter.current().setBadgeCount(value) { error in
            if let error {
                // Not fatal: the badge is a convenience, and it will be
                // rewritten on the next change or the next foreground.
                print("[badge] could not set \(value): \(error.localizedDescription)")
            }
        }
    }

    /// Sign-out and account switches; the next person's count is not this one's.
    static func clear() {
        apply(0)
    }
}
