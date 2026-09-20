import SwiftUI

/// The app's four top-level places. Servers and direct messages share Home:
/// the rail on its left edge switches between your inbox and each server,
/// exactly as it does on desktop.
enum ShellDestination: String, CaseIterable, Identifiable {
    case home, friends, notes, you

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .friends: return "Friends"
        case .notes: return "Notes"
        case .you: return "You"
        }
    }

    var symbol: String {
        switch self {
        case .home: return "bubble.left.and.bubble.right.fill"
        case .friends: return "person.2.fill"
        case .notes: return "note.text"
        case .you: return "person.crop.circle.fill"
        }
    }
}

/// Shared shell state: which destination is showing, and whether anything
/// on screen wants the dock out of the way.
@MainActor
@Observable
final class ShellChrome {
    var destination: ShellDestination = .home
    /// Screens that hide the dock while visible. A set of per-appearance
    /// tokens rather than a counter, so an appear without a matching
    /// disappear can never leave the dock hidden (or shown) for good.
    private var dockHiders: Set<UUID> = []
    /// The software keyboard is on screen. The dock would otherwise ride up on
    /// top of it and cover whatever you're typing into.
    var keyboardVisible = false

    var dockVisible: Bool { dockHiders.isEmpty && !keyboardVisible }

    func hideDock(_ token: UUID) { dockHiders.insert(token) }
    func showDock(_ token: UUID) { dockHiders.remove(token) }
}

private struct HidesDock: ViewModifier {
    @Environment(ShellChrome.self) private var chrome
    @State private var token = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { withAnimation(.snappy(duration: 0.28)) { chrome.hideDock(token) } }
            .onDisappear { withAnimation(.snappy(duration: 0.28)) { chrome.showDock(token) } }
    }
}

extension View {
    /// Conversations take the full height; the dock steps aside for them.
    func hidesDock() -> some View { modifier(HidesDock()) }
}
