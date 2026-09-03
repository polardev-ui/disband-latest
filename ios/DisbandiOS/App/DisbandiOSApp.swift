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
        CallAudioSession.prepare()

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
