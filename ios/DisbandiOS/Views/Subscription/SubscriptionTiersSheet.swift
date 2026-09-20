import SwiftUI

/**
 What the subscription badge means, opened by tapping it.

 Shows the plan, every tier with the one reached raised out of the row, and
 how far the next one is. The badge alone can only say "Silver", which does
 not say what Silver is or what follows it.
 */
struct SubscriptionTiersSheet: View {
    let plan: String
    let months: Int
    let since: Date?

    @Environment(\.dismiss) private var dismiss

    private var isAero: Bool { SubscriptionPlan(normalizing: plan).isPaid }
    private var accent: Color { SubscriptionPlan.aeroGold }
    private var planName: String { "Disband Aero" }
    private var current: SubscriptionTier? { SubscriptionTier.forMonths(months) }
    private var next: SubscriptionTier? { SubscriptionTier.next(after: months) }

    private let columns = [GridItem(.adaptive(minimum: 92), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VStack(spacing: 6) {
                        Text(planName)
                            .font(.title2.weight(.heavy))
                            .foregroundStyle(Brand.textPrimary)
                        Text("The badge changes as the months add up.")
                            .font(.subheadline)
                            .foregroundStyle(Brand.textMuted)
                    }
                    .padding(.top, 8)

                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(SubscriptionTier.all) { tier in
                            let reached = months >= tier.months
                            VStack(spacing: 5) {
                                SubscriptionMedallionView(tier: tier, topTier: isAero, size: 54)
                                    .opacity(reached ? 1 : 0.3)
                                    .saturation(reached ? 1 : 0)
                                Text(tier.label)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Brand.textPrimary)
                                Text(tier.durationLabel)
                                    .font(.caption2)
                                    .foregroundStyle(Brand.textMuted)
                                if current?.key == tier.key, let since {
                                    Text("Since \(since.formatted(date: .numeric, time: .omitted))")
                                        .font(.caption2)
                                        .foregroundStyle(Brand.textMuted)
                                        .multilineTextAlignment(.center)
                                }
                            }
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity)
                            .background(current?.key == tier.key ? Brand.elevated : .clear,
                                        in: .rect(cornerRadius: 12))
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        if let next, let current {
                            HStack {
                                Text("\(next.months - months) month\(next.months - months == 1 ? "" : "s") until \(next.label)")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Brand.textPrimary)
                                Spacer()
                                Text("\(months) / \(next.months)")
                                    .font(.caption)
                                    .foregroundStyle(Brand.textMuted)
                            }
                            ProgressView(
                                value: Double(max(0, months - current.months)),
                                total: Double(max(1, next.months - current.months))
                            )
                            .tint(accent)
                        } else {
                            Text("Every tier unlocked — \(months) months subscribed.")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Brand.textPrimary)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(14)
                    .background(Brand.elevated, in: .rect(cornerRadius: 14))
                }
                .padding(16)
            }
            .background(Brand.surface)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
