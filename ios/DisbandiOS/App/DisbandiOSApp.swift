import SwiftUI

@main
struct DisbandiOSApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var appState: AppState
    @State private var call: CallManager
    @State private var dmUnread: DmUnreadStore
    @State private var subscriptions: SubscriptionService
    @State private var notes: NotesService
    @State private var themeManager: ThemeManager

    init() {
        let appState = AppState()
        _appState = State(initialValue: appState)
        _call = State(initialValue: CallManager(app: appState))
        _dmUnread = State(initialValue: DmUnreadStore())
        _subscriptions = State(initialValue: SubscriptionService())
        _notes = State(initialValue: NotesService())
        _themeManager = State(initialValue: ThemeManager.shared)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .environment(call)
                .environment(dmUnread)
                .environment(subscriptions)
                .environment(notes)
                .environment(themeManager)
                .preferredColorScheme(themeManager.palette.colorScheme)
                .tint(themeManager.palette.accent)
                // Follows sign-in/sign-out so perks bought on the web apply
                // here without a restart.
                .task(id: appState.currentUserId) {
                    await subscriptions.start(userId: appState.currentUserId)
                }
                .task(id: appState.currentUserId) {
                    await call.start(userId: appState.currentUserId)
                }
                .onChange(of: appState.profile?.theme) { _, _ in
                    themeManager.adopt(from: appState.profile)
                }
        }
    }
}
