import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(CallManager.self) private var call

    var body: some View {
        ZStack {
            Brand.background.ignoresSafeArea()
            switch app.phase {
            case .loading:
                ProgressView()
                    .controlSize(.large)
                    .tint(Brand.accent)
            case .signedOut:
                AuthView()
            case .mfaRequired:
                MfaChallengeView()
            case .signedIn:
                MainTabView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: app.phase)
        .overlay { callOverlay }
        .animation(.easeInOut(duration: 0.25), value: call.phase)
    }

    /// Global call UI layered above the whole app (incoming ring, then the
    /// full-screen outgoing/active call), so calls survive navigation.
    ///
    /// While minimised only a pill is shown, leaving the tab bar and every
    /// screen underneath fully interactive.
    @ViewBuilder private var callOverlay: some View {
        if app.phase == .signedIn {
            switch call.phase {
            case .incoming:
                if call.incoming != nil {
                    IncomingCallOverlay(call: call)
                        .transition(.opacity)
                }
            case .outgoing, .active:
                if call.minimized {
                    VStack {
                        MinimisedCallBar(call: call)
                        Spacer()
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                } else {
                    FaceTimeCallView(call: call)
                        .transition(.opacity)
                }
            case .idle:
                EmptyView()
            }
        }
    }
}
