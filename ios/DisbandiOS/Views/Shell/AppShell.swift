import SwiftUI

/// The signed-in app: four destinations under a floating dock, with voice
/// layered above everything so a call survives any navigation.
struct AppShell: View {
    @Environment(CallManager.self) private var call
    @Environment(VoiceSession.self) private var voice
    @Environment(DmUnreadStore.self) private var unreadStore
    @Environment(DirectMessagesViewModel.self) private var vm

    @State private var chrome = ShellChrome()
    /// Destinations are built on first visit and then kept, so each keeps its
    /// scroll position and navigation stack — what a tab bar did before.
    @State private var visited: Set<ShellDestination> = [.home]

    var body: some View {
        ZStack(alignment: .bottom) {
            ZStack {
                ForEach(ShellDestination.allCases) { destination in
                    if visited.contains(destination) {
                        content(for: destination)
                            .opacity(chrome.destination == destination ? 1 : 0)
                            .allowsHitTesting(chrome.destination == destination)
                            .accessibilityHidden(chrome.destination != destination)
                    }
                }
            }

            if chrome.dockVisible {
                FloatingDock(selection: Bindable(chrome).destination,
                             badges: [.home: inboxUnread])
                    .padding(.bottom, 6)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .background(Brand.background.ignoresSafeArea())
        .environment(chrome)
        // The minimised call sits above everything, like the system's own
        // in-call indicator, instead of competing with the dock or composer.
        .safeAreaInset(edge: .top, spacing: 0) {
            if voice.isActive && voice.minimized {
                VoicePill()
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .overlay {
            if voice.isActive && !voice.minimized {
                VoiceStageView()
                    .transition(.move(edge: .bottom))
                    .zIndex(2)
            }
        }
        .overlay(alignment: .top) {
            if let ring = voice.incomingRing {
                GroupRingBanner(ring: ring)
                    .padding(.horizontal, 12)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(3)
            }
        }
        .animation(.snappy(duration: 0.32), value: voice.isActive)
        .animation(.snappy(duration: 0.32), value: voice.minimized)
        .animation(.snappy(duration: 0.3), value: voice.incomingRing)
        .onChange(of: chrome.destination) { _, next in visited.insert(next) }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            withAnimation(.snappy(duration: 0.25)) { chrome.keyboardVisible = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            withAnimation(.snappy(duration: 0.25)) { chrome.keyboardVisible = false }
        }
        .onAppear { voice.isDirectCallActive = { [call] in call.phase != .idle } }
        // A 1:1 call owns the audio session through CallKit; voice yields.
        .onChange(of: call.phase) { _, phase in
            if phase == .active, voice.isActive { Task { await voice.leave() } }
        }
        .alert("Voice", isPresented: Binding(
            get: { voice.error != nil },
            set: { if !$0 { voice.error = nil } }
        )) {
            Button("OK", role: .cancel) { voice.error = nil }
        } message: {
            Text(voice.error ?? "")
        }
    }

    @ViewBuilder private func content(for destination: ShellDestination) -> some View {
        switch destination {
        case .home:
            SpacesView()
        case .friends:
            FriendsTab().contentMargins(.bottom, dockMargin, for: .scrollContent)
        case .notes:
            // Notes lifts its own composer above the dock.
            NotesTab()
        case .you:
            ProfileTab().contentMargins(.bottom, dockMargin, for: .scrollContent)
        }
    }

    /// Lets lists scroll their last rows clear of the floating dock — and
    /// drops to zero when a pushed conversation has hidden it.
    private var dockMargin: CGFloat { chrome.dockVisible ? 84 : 0 }

    private var inboxUnread: Int {
        vm.threads.reduce(0) { $0 + unreadStore.count(for: $1.id) }
            + vm.groups.reduce(0) { $0 + unreadStore.countGroup(for: $1.id) }
    }
}
