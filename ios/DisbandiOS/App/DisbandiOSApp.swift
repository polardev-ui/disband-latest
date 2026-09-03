import SwiftUI

@main
struct DisbandiOSApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var appState: AppState
    @State private var call: CallManager
    @State private var dmUnread: DmUnreadStore
    @State private var subscriptions: SubscriptionService
    @State private var notes: NotesService
    @State private var directMessages: DirectMessagesViewModel
    @State private var themeManager: ThemeManager

    init() {
        CallAudioSession.prepare()

        let appState = AppState()
        _appState = State(initialValue: appState)
        _call = State(initialValue: CallManager(app: appState))
        _dmUnread = State(initialValue: DmUnreadStore())
        _subscriptions = State(initialValue: SubscriptionService())
        _notes = State(initialValue: NotesService())
        _directMessages = State(initialValue: DirectMessagesViewModel())
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
                .environment(directMessages)
                .environment(themeManager)
                .preferredColorScheme(themeManager.palette.colorScheme)
                .tint(themeManager.palette.accent)
                .task(id: appState.currentUserId) {
                    await subscriptions.start(userId: appState.currentUserId)
                }
                .task(id: appState.currentUserId) {
                    await call.start(userId: appState.currentUserId)
                    // Relay credentials in hand before the first call, not
                    // during the dial.
                    if appState.currentUserId != nil { await TurnService.shared.prewarm() }
                }
                // Warm the Messages tab while the user is still looking at
                // whatever they opened first. A TabView builds a tab's content
                // lazily, so this work used to start on the tap that opened the
                // tab — which is exactly when it is most visible.
                .task(id: appState.currentUserId) {
                    guard appState.currentUserId != nil else { return }
                    await directMessages.start(currentUserId: appState.currentUserId,
                                               unread: dmUnread)
                }
                .onChange(of: appState.profile?.theme) { _, _ in
                    themeManager.adopt(from: appState.profile)
                }
        }
    }
}
