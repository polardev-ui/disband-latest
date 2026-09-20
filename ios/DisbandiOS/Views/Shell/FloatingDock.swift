import SwiftUI

/// The bottom navigation: a floating glass capsule, not a system tab bar.
///
/// Only the current destination shows its name — it grows into a filled
/// accent pill that slides between icons — so the dock stays compact and the
/// active place is unmistakable at a glance.
struct FloatingDock: View {
    @Binding var selection: ShellDestination
    var badges: [ShellDestination: Int] = [:]
    @Namespace private var pill

    var body: some View {
        HStack(spacing: 4) {
            ForEach(ShellDestination.allCases) { destination in
                item(destination)
            }
        }
        .padding(6)
        .background {
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Brand.surface.opacity(0.55)))
                .overlay(Capsule().strokeBorder(Color.white.opacity(0.08), lineWidth: 1))
                .shadow(color: .black.opacity(0.35), radius: 18, y: 8)
        }
        .animation(.snappy(duration: 0.32), value: selection)
    }

    private func item(_ destination: ShellDestination) -> some View {
        let active = destination == selection
        return Button {
            guard !active else { return }
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            selection = destination
        } label: {
            HStack(spacing: 7) {
                Image(systemName: destination.symbol)
                    .font(.system(size: 17, weight: .semibold))
                    .overlay(alignment: .topTrailing) { badge(for: destination) }
                if active {
                    Text(destination.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .fixedSize()
                        .transition(.opacity.combined(with: .scale(scale: 0.85, anchor: .leading)))
                }
            }
            .foregroundStyle(active ? Color.white : Brand.textMuted)
            .padding(.horizontal, active ? 16 : 14)
            .frame(height: 46)
            .background {
                if active {
                    Capsule()
                        .fill(Brand.accent.gradient)
                        .matchedGeometryEffect(id: "pill", in: pill)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
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
                .offset(x: 10, y: -8)
        }
    }
}
