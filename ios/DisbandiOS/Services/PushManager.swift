import UIKit
import UserNotifications
import Supabase

/// Handles APNs registration, permission, token storage, and incoming
/// notification presentation. Wired in via `@UIApplicationDelegateAdaptor`.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // VoIP pushes never ask for permission and don't need the APNs
        // registration dance — starting the registry is all they take, and a
        // VoIP-push cold start depends on it being alive before anything else.
        Task { @MainActor in
            // Before PushKit: whether VoIP pushes may be requested at all
            // depends on the storefront, and the cached answer is available
            // immediately even on a cold start.
            CallKitAvailability.start()
            // Build the CXProvider now rather than inside the PushKit
            // callback. It is only milliseconds, but those milliseconds are
            // spent on the one code path that has a hard deadline, and a cold
            // start woken by a call is exactly when nothing else is warm.
            _ = CallKitProvider.shared
            VoipPushService.shared.start()
            // Before any await that could miss one: `Transaction.updates`
            // delivers renewals, refunds, and purchases made on another
            // device, and anything it emits before the listener exists is
            // gone. It is unrelated to push, but this is the earliest
            // reliable point in the launch.
            StoreService.shared.start()
        }
        return true
    }

    /// APNs handed us a device token — persist it for the signed-in user.
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        PushManager.shared.storeToken(token)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed: \(error.localizedDescription)")
    }

    /// Show banners in the foreground — except for the conversation already on
    /// screen. Being interrupted by a banner for the message you are watching
    /// arrive is pure noise; the badge still updates so nothing is lost.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async
        -> UNNotificationPresentationOptions {
        let source = notification.request.content.userInfo["source"] as? String
        if ActiveChat.shared.isShowing(source) { return [] }
        return [.banner, .sound, .badge]
    }

    /// The notification was tapped. Without this the app simply came forward
    /// wherever it had been left — almost always the home screen, showing
    /// every conversation except the one that was being pointed at.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse) async {
        // Only an actual open. Dismissing a notification is not a request to
        // go anywhere.
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
        let source = response.notification.request.content.userInfo["source"] as? String
        NotificationRouter.shared.handleTap(source: source)
    }
}

@MainActor
final class PushManager {
    static let shared = PushManager()
    private var pendingToken: String?

    private var client: SupabaseClient { SupabaseManager.client }

    /// Ask for permission (once) and register with APNs. Call after sign-in.
    func registerIfAuthorized() {
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            switch settings.authorizationStatus {
            case .notDetermined:
                let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
                if granted { await registerForRemote() }
            case .authorized, .provisional, .ephemeral:
                await registerForRemote()
            default:
                break
            }
        }
    }

    private func registerForRemote() async {
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// Called from AppDelegate once APNs returns a token.
    nonisolated func storeToken(_ token: String) {
        Task { @MainActor in
            self.pendingToken = token
            await self.flushToken()
        }
    }

    /// Persist the pending token if a user is signed in (RPC enforces ownership).
    func flushToken() async {
        guard let token = pendingToken,
              client.auth.currentUser != nil else { return }
        do {
            try await client.rpc("register_device_token",
                                 params: [
                                    "p_token": token,
                                    "p_platform": "ios",
                                    // Which build a token came from is the
                                    // difference between "old app" and
                                    // "registration is broken", and those are
                                    // fixed in different places.
                                    "p_app_version": Bundle.main.appVersionDisplay,
                                 ]).execute()
            pendingToken = nil
        } catch {
            print("storeToken error: \(error)")
        }
    }
}
