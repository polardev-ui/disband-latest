import SwiftUI

/// Theme picker. Locked themes stay visible but unselectable, so it is obvious
/// what a plan unlocks rather than hiding it entirely.
struct AppearanceView: View {
    @Environment(ThemeManager.self) private var themeManager
    @Environment(SubscriptionService.self) private var subscriptions

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ForEach(Themes.all) { theme in
                    let unlocked = Themes.isUnlocked(theme, plan: subscriptions.plan)
                    Button {
                        guard unlocked else { return }
                        themeManager.set(theme.id)
                    } label: {
                        row(theme, unlocked: unlocked)
                    }
                    .buttonStyle(.plain)
                    .disabled(!unlocked)
                }

                Text("Your theme is saved to your account and applies on the web too.")
                    .font(.caption)
                    .foregroundStyle(Brand.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 6)
            }
            .padding(16)
        }
        .background(Brand.background)
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ theme: ThemeDefinition, unlocked: Bool) -> some View {
        let selected = themeManager.themeId == theme.id

        return HStack(spacing: 12) {
            // Swatch strip mirrors the desktop theme preview.
            HStack(spacing: 0) {
                ForEach(Array(theme.swatch.enumerated()), id: \.offset) { _, color in
                    Rectangle().fill(color)
                }
            }
            .frame(width: 56, height: 44)
            .clipShape(.rect(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(theme.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                    if let plan = theme.requiredPlan {
                        Text(plan.label.uppercased())
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Brand.accent.opacity(0.18), in: .capsule)
                            .foregroundStyle(Brand.accent)
                    }
                }
                Text(theme.detail)
                    .font(.caption)
                    .foregroundStyle(Brand.textMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if !unlocked {
                Image(systemName: "lock.fill")
                    .font(.caption)
                    .foregroundStyle(Brand.textMuted)
            } else if selected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Brand.accent)
            }
        }
        .padding(12)
        .background(Brand.surface, in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(selected ? Brand.accent : .clear, lineWidth: 2)
        }
        .opacity(unlocked ? 1 : 0.55)
    }
}
