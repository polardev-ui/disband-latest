import SwiftUI

/// The bottom navigation: a floating pill.
///
/// The current place grows into a brand-coloured capsule with its name that
/// slides from tab to tab; the others are icons only. "You" is your own
/// avatar with its status dot rather than a generic person glyph. Unread
/// counts sit on the icons as red badges.
///
/// It looks like it floats, but it takes its own space below the content
/// (the shell stacks it under the screens), so nothing ever scrolls behind
/// it — that is what the old glass capsule got wrong. A short fade above it
/// lets lists run into it softly instead of stopping at a hard edge.
struct FloatingDock: View {
    @Binding var selection: ShellDestination
    var badges: [ShellDestination: Int] = [:]
    /// The tab you're already on was tapped again: go back to its start.
    var onReselect: (ShellDestination) -> Void = { _ in }

    @Environment(AppState.self) private var app
    @Environment(PresenceService.self) private var presence
    @Namespace private var pill
    /// The highlighted tab, animated on its own: the screens switch
    /// instantly, while the pill springs across.
    @State private var highlighted: ShellDestination?

    private var current: ShellDestination { highlighted ?? selection }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(ShellDestination.allCases) { destination in
                item(destination)
            }
        }
        .padding(6)
        .background {
            // Lifted with the raised colour: on AMOLED the plain surface is
            // a hair off the black background and the pill disappeared.
            Capsule(style: .continuous)
                .fill(Brand.surface)
                .overlay(Capsule(style: .continuous).fill(Brand.elevated.opacity(0.55)))
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(
                            LinearGradient(colors: [Color.white.opacity(0.14), Color.white.opacity(0.03)],
                                           startPoint: .top, endPoint: .bottom),
                            lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.45), radius: 18, y: 8)
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        // Sit down into the home-indicator strip a little, as floating
        // docks do, rather than a full safe-area height above the edge.
        .padding(.bottom, -12)
        .frame(maxWidth: .infinity)
        .background(alignment: .top) {
            LinearGradient(colors: [Brand.background.opacity(0), Brand.background],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: 28)
                .offset(y: -28)
                .allowsHitTesting(false)
        }
        .background(Brand.background.ignoresSafeArea(edges: .bottom))
        .onAppear { highlighted = selection }
        .onChange(of: selection) { _, next in
            guard next != highlighted else { return }
            withAnimation(Motion.pop) { highlighted = next }
        }
    }

    private func item(_ destination: ShellDestination) -> some View {
        let active = destination == current
        return Button {
            guard destination != selection else {
                Haptics.soft()
                onReselect(destination)
                return
            }
            Haptics.select()
            withAnimation(.spring(response: 0.36, dampingFraction: 0.78)) { highlighted = destination }
            // Instant, like the system tab bar: animating the switch made
            // every kept-alive screen crossfade at once.
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { selection = destination }
        } label: {
            HStack(spacing: 7) {
                icon(destination, active: active)
                    .overlay(alignment: .topTrailing) { badge(for: destination) }
                if active {
                    Text(destination.title)
                        .font(.system(size: 14, weight: .bold))
                        .lineLimit(1)
                        .fixedSize()
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.85, anchor: .leading)),
                            removal: .opacity))
                }
            }
            .foregroundStyle(active ? Color.white : Brand.textMuted)
            .padding(.horizontal, active ? 16 : 0)
            .frame(height: 46)
            .frame(maxWidth: active ? nil : .infinity)
            .background {
                if active {
                    Capsule(style: .continuous)
                        .fill(LinearGradient(colors: [Brand.accent, Brand.accentSoft],
                                             startPoint: .topLeading, endPoint: .bottomTrailing))
                        .overlay(Capsule(style: .continuous).strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
                        .shadow(color: Brand.accent.opacity(0.45), radius: 10, y: 3)
                        .matchedGeometryEffect(id: "pill", in: pill)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(scale: 0.9))
        .layoutPriority(active ? 1 : 0)
        .accessibilityLabel(destination.title)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    @ViewBuilder private func icon(_ destination: ShellDestination, active: Bool) -> some View {
        if destination == .you, let profile = app.profile {
            AvatarView(url: profile.avatarUrl, name: profile.name, size: 26,
                       status: presence.status(for: profile.id, fallback: profile.status))
                .overlay(Circle().strokeBorder(active ? Color.white.opacity(0.9) : .clear, lineWidth: 1.5))
                .frame(width: 26, height: 26)
                .scaleEffect(active ? 1.06 : 1)
        } else {
            Image(systemName: destination.symbol)
                .font(.system(size: 19, weight: active ? .bold : .semibold))
                .symbolEffect(.bounce.down, value: active)
                .frame(width: 26, height: 26)
        }
    }

    @ViewBuilder private func badge(for destination: ShellDestination) -> some View {
        if let count = badges[destination], count > 0 {
            Text(count > 99 ? "99+" : "\(count)")
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .frame(minWidth: 17, minHeight: 17)
                .background(Brand.dnd, in: Capsule())
                .overlay(Capsule().strokeBorder(Brand.surface, lineWidth: 2))
                .offset(x: 10, y: -7)
                .transition(.scale.combined(with: .opacity))
        }
    }
}
