import SwiftUI

/// Platform badges, wire-compatible with the desktop app's `PLATFORM_BADGES`.
///
/// These are awarded by Disband and locked server-side (the profile update
/// trigger reverts any client attempt to set them), so this is display only.
struct UserBadge: Identifiable, Hashable {
    let key: String
    let systemImage: String
    let color: Color
    let title: String
    let subtitle: String

    var id: String { key }
}

enum PlatformBadges {
    static let owner = UserBadge(
        key: "owner",
        systemImage: "crown.fill",
        color: Color(hex: 0xFAA61A),
        title: "Disband Owner",
        subtitle: "Owner and Founder of Disband"
    )
    static let staff = UserBadge(
        key: "staff",
        systemImage: "hammer.fill",
        color: Color(hex: 0x8EA1E1),
        title: "Disband Staff",
        subtitle: "Member of the Disband staff team"
    )
    static let og = UserBadge(
        key: "og",
        systemImage: "sparkles",
        color: Color(hex: 0xF04747),
        title: "OG",
        subtitle: "Joined Disband during its early days"
    )
    static let bounty = UserBadge(
        key: "bounty",
        systemImage: "ladybug.fill",
        color: Color(hex: 0x43B581),
        title: "Bug Bounty Hunter",
        subtitle: "Helped find and report bugs in Disband"
    )

    /// Ordered to match the desktop badge row.
    static func forProfile(_ profile: Profile) -> [UserBadge] {
        var badges: [UserBadge] = []
        if profile.showOwnerBadge == true { badges.append(owner) }
        if profile.showStaffBadge == true { badges.append(staff) }
        if profile.showOgBadge == true { badges.append(og) }
        if profile.showBountyBadge == true { badges.append(bounty) }
        return badges
    }
}

/// Compact inline badge row, for next to a username.
struct UserBadgesView: View {
    let profile: Profile
    var size: CGFloat = 13

    var body: some View {
        let badges = PlatformBadges.forProfile(profile)
        if !badges.isEmpty {
            HStack(spacing: 4) {
                ForEach(badges) { badge in
                    Image(systemName: badge.systemImage)
                        .font(.system(size: size))
                        .foregroundStyle(badge.color)
                        .accessibilityLabel(badge.title)
                }
            }
        }
    }
}

/// Expanded badge list with titles, for the profile detail sheet.
struct UserBadgeList: View {
    let profile: Profile

    var body: some View {
        let badges = PlatformBadges.forProfile(profile)
        if !badges.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Badges")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.textMuted)
                ForEach(badges) { badge in
                    HStack(spacing: 10) {
                        Image(systemName: badge.systemImage)
                            .font(.system(size: 15))
                            .foregroundStyle(badge.color)
                            .frame(width: 22)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(badge.title)
                                .font(.subheadline)
                                .foregroundStyle(Brand.textPrimary)
                            Text(badge.subtitle)
                                .font(.caption)
                                .foregroundStyle(Brand.textMuted)
                        }
                    }
                }
            }
        }
    }
}
