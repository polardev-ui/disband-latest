import SwiftUI

/**
 The badge row beside a name.

 Badges are loaded from the database rather than read off four booleans on the
 profile, so the app shows whatever has actually been awarded — including
 badges that did not exist when the build shipped.
 */
struct UserBadgesView: View {
    let profile: Profile
    var size: CGFloat = 13

    @State private var badges: [AwardedBadge] = []
    @State private var entitlement: Entitlement?
    @State private var showTiers = false

    var body: some View {
        // Wraps rather than running off the edge: a profile that has earned a
        // dozen badges showed only the first few, and the rest were simply cut
        // off by the screen.
        FlowLayout(spacing: 4, lineSpacing: 4) {
            if let ent = entitlement, ent.plan != "free",
               let tier = SubscriptionTier.forMonths(ent.months) {
                Button { showTiers = true } label: {
                    SubscriptionMedallionView(tier: tier, topTier: SubscriptionPlan(normalizing: ent.plan).isPaid,
                                              size: size + 7)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Aero subscriber, \(tier.label)")
            }

            ForEach(badges) { badge in
                Image(systemName: BadgeService.symbol(for: badge.def.key))
                    .font(.system(size: size))
                    .foregroundStyle(badge.def.color)
                    .accessibilityLabel(badge.def.name)
            }
        }
        .task(id: profile.id) {
            badges = await BadgeService.shared.badges(for: profile.id)
            entitlement = await EntitlementService.shared.entitlement(for: profile.id)
        }
        .sheet(isPresented: $showTiers) {
            if let ent = entitlement, ent.plan != "free" {
                SubscriptionTiersSheet(plan: ent.plan, months: ent.months, since: ent.since)
            }
        }
    }
}

/// The expanded list, for the profile sheet.
struct UserBadgeList: View {
    let profile: Profile

    @State private var badges: [AwardedBadge] = []

    var body: some View {
        Group {
            if !badges.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Badges")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Brand.textMuted)
                    ForEach(badges) { badge in
                        HStack(spacing: 10) {
                            Image(systemName: BadgeService.symbol(for: badge.def.key))
                                .font(.system(size: 15))
                                .foregroundStyle(badge.def.color)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(badge.def.name)
                                    .font(.subheadline)
                                    .foregroundStyle(Brand.textPrimary)
                                Text(badge.detail ?? badge.def.description)
                                    .font(.caption)
                                    .foregroundStyle(Brand.textMuted)
                            }
                        }
                    }
                }
            }
        }
        .task(id: profile.id) {
            badges = await BadgeService.shared.badges(for: profile.id)
        }
    }
}
