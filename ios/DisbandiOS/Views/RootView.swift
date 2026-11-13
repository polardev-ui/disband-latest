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
                AppShell()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: app.phase)
        .overlay { callOverlay }
        .animation(.easeInOut(duration: 0.25), value: call.phase)
        .animation(.spring(response: 0.4, dampingFraction: 0.86), value: call.minimized)
        .animation(.spring(response: 0.4, dampingFraction: 0.86), value: call.callNotice)
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
                    // Grows in from slightly smaller and fades, rather than
                    // cutting straight to black.
                    FaceTimeCallView(call: call)
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.94)),
                            removal: .opacity.combined(with: .scale(scale: 0.96))))
                }
            case .idle:
                // How the last call ended ("declined", "No answer",
                // "Call dropped"), for a few seconds.
                if let notice = call.callNotice {
                    VStack {
                        CallNoticeToast(text: notice)
                            .padding(.top, 6)
                        Spacer()
                    }
                    .allowsHitTesting(false)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
    }
}
