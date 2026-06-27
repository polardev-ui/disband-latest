import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var app

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
    }
}
