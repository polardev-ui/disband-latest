import SwiftUI
import UIKit

/// The eight 12×12 pixel icons from the web's `GuildTag` component. Keeping
/// the grids identical means a tag looks the same in a browser and on a phone,
/// rather than becoming a generic SF Symbol on one platform.
enum GuildTagPixels {
    static let icons: [GuildTagIcon: [String]] = [
        .star: [
            ".....++.....",
            ".....##.....",
            "....+##+....",
            "....####....",
            "+##########+",
            ".+########+.",
            "..+######+..",
            "...######...",
            "..+######+..",
            "..###++###..",
            ".+##+..+##+.",
            ".##......##.",
        ],
        .heart: [
            "............",
            ".+##+..+##+.",
            "+####++####+",
            "##.#########",
            "#.##########",
            "############",
            "+##########+",
            ".+########+.",
            "..+######+..",
            "...+####+...",
            "....+##+....",
            ".....++.....",
        ],
        .bolt: [
            "......####..",
            ".....####...",
            "....####....",
            "...####.....",
            "..#########.",
            ".#########..",
            ".....####...",
            "....####....",
            "....###.....",
            "...###......",
            "...##.......",
            "..#.........",
        ],
        .crown: [
            "............",
            "+....++....+",
            "#+..+##+..+#",
            "##+.####.+##",
            "###+####+###",
            "############",
            "############",
            "##.##..##.##",
            "############",
            "############",
            "+##########+",
            "............",
        ],
        .skull: [
            "...+####+...",
            ".+########+.",
            ".##########.",
            "############",
            "##+..##..+##",
            "##...##...##",
            "###+####+###",
            "+####..####+",
            ".+########+.",
            "..########..",
            "..##.##.##..",
            "...+####+...",
        ],
        .moon: [
            "....+###+...",
            "..+###+.....",
            ".+###.......",
            ".###........",
            "####........",
            "####........",
            "####.......+",
            "####+.....+#",
            "+####+...+##",
            ".+#########+",
            "..+#######+.",
            "....+###+...",
        ],
        .leaf: [
            ".........###",
            ".......#####",
            ".....######+",
            "....#####.##",
            "...####.###+",
            "..####.####.",
            "..###.####..",
            "..##.####...",
            "..+.####....",
            ".+.+##+.....",
            ".#..........",
            "#...........",
        ],
        .flame: [
            "......#.....",
            ".....##.....",
            ".....###....",
            "....+###....",
            "...+####+...",
            "..+###+##+..",
            "..####.###..",
            ".####..+###.",
            ".###+...###.",
            ".###....+##.",
            "..###..###..",
            "...+####+...",
        ],
    ]
}

struct PixelGuildIcon: View {
    let icon: GuildTagIcon
    let color: Color
    var size: CGFloat = 12

    var body: some View {
        Canvas { context, canvasSize in
            let rows = GuildTagPixels.icons[icon] ?? GuildTagPixels.icons[.star] ?? []
            let cell = min(canvasSize.width, canvasSize.height) / 12
            for (y, row) in rows.enumerated() {
                for (x, character) in row.enumerated() where character != "." {
                    let rect = CGRect(x: CGFloat(x) * cell, y: CGFloat(y) * cell,
                                      width: cell, height: cell)
                    context.fill(
                        Path(rect),
                        with: .color(color.opacity(character == "+" ? 0.5 : 1))
                    )
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

enum GuildTagBadgeSize {
    case small, medium

    var height: CGFloat { self == .small ? 16 : 18 }
    var icon: CGFloat { self == .small ? 11 : 12 }
    var fontSize: CGFloat { self == .small ? 10 : 11 }
    var horizontalPadding: CGFloat { self == .small ? 4 : 5 }
}

struct GuildTagBadge: View {
    let tag: GuildTag
    var size: GuildTagBadgeSize = .small
    var onTap: (() -> Void)? = nil

    private var badge: some View {
        HStack(spacing: 3) {
            PixelGuildIcon(icon: tag.icon, color: tag.foreground, size: size.icon)
            Text(tag.tag.uppercased())
                .font(.system(size: size.fontSize, weight: .bold))
                .tracking(0.2)
                .lineLimit(1)
        }
        .foregroundStyle(tag.foreground)
        .padding(.horizontal, size.horizontalPadding)
        .frame(height: size.height)
        .background(tag.backgroundColor, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .stroke(.white.opacity(0.1), lineWidth: 0.5)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Guild tag \(tag.tag)")
        .accessibilityHint(onTap == nil ? "" : "Shows the space behind this tag")
    }

    var body: some View {
        if let onTap {
            Button(action: onTap) { badge }
                .buttonStyle(.plain)
        } else {
            badge
        }
    }
}

private struct GuildTagSpaceTarget: Identifiable {
    let id: String
}

/// A tag next to a name. The tag store batches profile reads, so this is safe
/// to place on every row. Tapping the badge opens the space card, matching the
/// web's "a tag is a doorway" behaviour.
struct GuildTagView: View {
    let userId: String?
    var size: GuildTagBadgeSize = .small

    @State private var store = GuildTagStore.shared
    @State private var space: GuildTagSpaceTarget?

    var body: some View {
        Group {
            if let tag = store.tag(for: userId) {
                GuildTagBadge(tag: tag, size: size) {
                    space = GuildTagSpaceTarget(id: tag.serverId)
                }
            }
        }
        .task(id: userId) { store.ensureLoaded(userId) }
        .sheet(item: $space) { target in
            GuildTagSpaceView(serverId: target.id)
        }
    }
}

/// The card behind a worn tag. Private spaces reveal only that they are
/// private; discoverable spaces can be joined; invite-only spaces can still
/// show their public profile without a door.
struct GuildTagSpaceView: View {
    let serverId: String

    @Environment(\.dismiss) private var dismiss
    @State private var space: GuildTagSpace?
    @State private var loading = true
    @State private var error: String?
    @State private var joining = false
    @State private var joinError: String?

    private var joined: Bool { space?.joined == true }

    private var title: String {
        if space?.isPrivateSpace == true { return "Private space" }
        return space?.name ?? "Space"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if loading {
                        ProgressView().frame(maxWidth: .infinity, minHeight: 180)
                    } else if let error {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(Brand.dnd)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 14))
                    } else if space?.isPrivateSpace == true {
                        privateSpace
                    } else if let space {
                        spaceCard(space)
                    }
                }
                .padding(20)
            }
            .background(Brand.background)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await load() }
    }

    private var privateSpace: some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.fill")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(Brand.textMuted)
                .frame(width: 56, height: 56)
                .background(Brand.elevated, in: Circle())
            Text("This space keeps its identity private. The tag is real, but the people wearing it have chosen not to reveal where it comes from.")
                .font(.subheadline)
                .foregroundStyle(Brand.textMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    private func spaceCard(_ space: GuildTagSpace) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                BannerImage(url: space.bannerUrl, height: 112) {
                    LinearGradient(colors: [Brand.accent, Brand.accentSoft],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
                AvatarView(url: space.iconUrl, name: space.name ?? "Space", size: 52)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Brand.background).padding(-4))
                    .padding(.leading, 14)
                    .offset(y: 24)
            }
            .padding(.bottom, 30)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Text(space.name ?? "Space")
                        .font(.headline)
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    if space.verified == true {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.subheadline)
                            .foregroundStyle(Brand.verified)
                    } else if space.partner == true {
                        Text("PARTNER")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Brand.accent)
                            .padding(.horizontal, 5).padding(.vertical, 2)
                            .background(Brand.accent.opacity(0.16), in: Capsule())
                    }
                }
                Text(space.description?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                     ? space.description! : "No description yet.")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 16) {
                    Label("\(space.onlineCount ?? 0) online", systemImage: "circle.fill")
                        .font(.caption)
                        .foregroundStyle(Brand.online)
                    Label("\(space.memberCount ?? 0) \(space.memberCount == 1 ? "member" : "members")",
                          systemImage: "person.2.fill")
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                }

                if space.discoverable != true && !joined {
                    Text("This space isn't discoverable. Ask someone inside for an invite to join.")
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 10))
                }

                if let joinError {
                    Text(joinError).font(.caption).foregroundStyle(Brand.dnd)
                }

                if joined {
                    Label("You're a member", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.online)
                } else if space.discoverable == true {
                    Button {
                        Task { await join() }
                    } label: {
                        HStack {
                            if joining { ProgressView().controlSize(.small) }
                            Text(joining ? "Joining…" : "Join Space")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(Brand.accent, in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                    .disabled(joining)
                }
            }
            .padding(16)
        }
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func load() async {
        loading = true
        error = nil
        do {
            space = try await DatabaseService.guildTagSpace(serverId: serverId)
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func join() async {
        joining = true
        joinError = nil
        do {
            try await DatabaseService.joinServerById(serverId: serverId)
            NotificationCenter.default.post(name: .serversChanged, object: nil)
            dismiss()
        } catch {
            joinError = error.localizedDescription
        }
        joining = false
    }
}

extension Notification.Name {
    /// A space was joined or left from somewhere that is not the rail; the
    /// rail listens so the new space appears without a relaunch.
    static let serversChanged = Notification.Name("DisbandServersChanged")
}

extension Color {
    /// `#rrggbb` for the colour picker. UIColor bridges colour spaces for us.
    var guildTagHex: String? {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        return String(format: "#%02x%02x%02x",
                      Int((red * 255).rounded()),
                      Int((green * 255).rounded()),
                      Int((blue * 255).rounded()))
    }
}
