import SwiftUI

/// The bottom navigation: a solid, full-width bar that takes its own space,
/// so nothing scrolls underneath it. (It was a floating glass capsule drawn
/// over the content, which covered the last channel and the last row of
/// every list.) Icon over label, the current place in white, unread counts
/// as red badges, a small spring on selection.
struct FloatingDock: View {
    @Binding var selection: ShellDestination
    var badges: [ShellDestination: Int] = [:]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(ShellDestination.allCases) { destination in
                item(destination)
            }
        }
        .padding(.top, 6)
        .padding(.bottom, 2)
        .background {
            Brand.surface
                .overlay(alignment: .top) { Rectangle().fill(Brand.divider).frame(height: 0.5) }
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private func item(_ destination: ShellDestination) -> some View {
        let active = destination == selection
        return Button {
            guard !active else { return }
            Haptics.select()
            // Instant, like the system tab bar: a crossfade animated every
            // kept-alive screen at once and made switching feel slow.
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { selection = destination }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: destination.symbol)
                    .font(.system(size: 20, weight: active ? .semibold : .regular))
                    .symbolEffect(.bounce, value: active)
                    .frame(height: 24)
                    .overlay(alignment: .topTrailing) { badge(for: destination) }
                Text(destination.title)
                    .font(.system(size: 11, weight: active ? .semibold : .medium))
            }
            .foregroundStyle(active ? Brand.textPrimary : Brand.textMuted)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(scale: 0.92))
        .accessibilityLabel(destination.title)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    @ViewBuilder private func badge(for destination: ShellDestination) -> some View {
        if let count = badges[destination], count > 0 {
            Text(count > 99 ? "99+" : "\(count)")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .frame(minWidth: 16, minHeight: 16)
                .background(Brand.dnd, in: Capsule())
                .overlay(Capsule().strokeBorder(Brand.surface, lineWidth: 2))
                .offset(x: 12, y: -6)
        }
    }
}
