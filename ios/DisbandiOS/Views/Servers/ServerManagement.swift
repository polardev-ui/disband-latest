import SwiftUI

// MARK: - Members

/// Everyone in a space, as the web's member list (`MemberList.tsx`): online
/// people grouped under their top role (every role hoists), the owner and
/// admins first, then roles by position; then everyone offline. Names take
/// their top role's colour (or gradient) unless they picked their own.
struct ServerMembersView: View {
    let server: Server
    @Environment(AppState.self) private var app
    @Environment(PresenceService.self) private var presence
    @State private var members: [ServerMember] = []
    @State private var roles: SpaceRoles?
    @State private var loading = true
    /// More pages are still coming in behind the first.
    @State private var loadingMore = false
    @State private var openProfile: Profile?
    @State private var query = ""

    private var isOwner: Bool { server.ownerId == app.currentUserId }

    private struct Group: Identifiable {
        let label: String
        var members: [ServerMember]
        var id: String { label }
    }

    /// Live status, not the stale `profiles.status` column. The signed-in
    /// member falls back to their profile while the presence channel is still
    /// connecting, so opening this screen immediately never hides yourself.
    private func liveStatus(for member: ServerMember) -> UserStatus {
        let live = presence.status(for: member.userId)
        if live == .offline && member.userId == app.currentUserId {
            return member.profile?.status ?? .offline
        }
        return live
    }

    /// `servers.owner_id` decides, over a stale `server_members.role`.
    private func role(of member: ServerMember) -> MemberRole {
        if member.userId == server.ownerId { return .owner }
        return member.role == .owner ? .member : member.role
    }

    private func topRole(_ member: ServerMember) -> ServerAdmin.Role? {
        roles?.topRole(of: member.userId, legacyRoleId: member.roleId)
    }

    private func label(for member: ServerMember) -> String {
        if role(of: member) == .owner { return "Owner" }
        if let top = topRole(member) { return top.name }
        return role(of: member) == .admin ? "Admin" : "Online"
    }

    private func name(_ member: ServerMember) -> String {
        ProfileLive.shared.fresh(member.profile)?.name ?? ""
    }

    private func byName(_ a: ServerMember, _ b: ServerMember) -> Bool {
        let comparison = name(a).localizedCompare(name(b))
        if comparison != .orderedSame { return comparison == .orderedAscending }
        return a.userId < b.userId
    }

    private var filtered: [ServerMember] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return members }
        return members.filter {
            name($0).lowercased().contains(q)
                || ($0.profile?.username?.lowercased().contains(q) ?? false)
        }
    }

    private var groups: [Group] {
        var grouped: [String: [ServerMember]] = [:]
        var offline: [ServerMember] = []
        for member in filtered {
            if liveStatus(for: member) == .offline {
                offline.append(member)
            } else {
                grouped[label(for: member), default: []].append(member)
            }
        }
        func priority(_ label: String) -> Int {
            if label == "Owner" { return .max }
            if label == "Admin" { return .max - 1 }
            return grouped[label]?.reduce(-1) { max($0, topRole($1)?.position ?? -1) } ?? -1
        }
        var out = grouped.keys
            .sorted { priority($0) != priority($1) ? priority($0) > priority($1) : $0 < $1 }
            .map { Group(label: $0, members: grouped[$0]!.sorted(by: byName)) }
        if !offline.isEmpty { out.append(Group(label: "Offline", members: offline.sorted(by: byName))) }
        return out
    }

    var body: some View {
        SwiftUI.Group {
            if loading {
                StateView(kind: .loading)
            } else {
                List {
                    ForEach(groups) { group in
                        Section("\(group.label) — \(group.members.count)") {
                            ForEach(group.members) { member in
                                memberRow(member).opacity(group.label == "Offline" ? 0.6 : 1)
                            }
                        }
                    }
                    if loadingMore {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("Loading more members\u{2026}")
                                .font(.footnote).foregroundStyle(Brand.textMuted)
                        }
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .searchable(text: $query, prompt: "Search members")
                .refreshable { await load(force: true) }
            }
        }
        .background(Brand.background)
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $openProfile) {
            ProfileDetailView(profile: $0, viewerId: app.currentUserId, presence: presence,
                              serverId: server.id)
        }
        .task { await load() }
    }

    @ViewBuilder private func memberRow(_ member: ServerMember) -> some View {
        Button { openProfile = ProfileLive.shared.fresh(member.profile) } label: {
            MemberRow(profile: member.profile, status: liveStatus(for: member),
                      topRole: topRole(member),
                      iconRole: roles?.iconRole(of: member.userId, legacyRoleId: member.roleId),
                      baseRole: role(of: member))
        }
        .listRowBackground(Brand.surface)
        .swipeActions {
            if isOwner && member.userId != app.currentUserId {
                Button(role: .destructive) { kick(member.userId) } label: {
                    Label("Kick", systemImage: "person.fill.xmark")
                }
            }
        }
    }

    /// The first page shows as soon as it arrives; the rest load behind it.
    /// Roles load alongside the first page rather than after it.
    private func load(force: Bool = false) async {
        if members.isEmpty { loading = true }
        async let rolesLoad = SpaceRoles.load(serverId: server.id, force: force)
        let pageSize = 500
        var all: [ServerMember] = []
        var seen = Set<String>()
        var page = 1
        while page <= 30, !Task.isCancelled {
            guard let rows = try? await DatabaseService.membersPage(serverId: server.id, page: page, pageSize: pageSize) else { break }
            for row in rows where seen.insert(row.userId).inserted { all.append(row) }
            members = all
            if page == 1 {
                roles = await rolesLoad
                loading = false
                loadingMore = rows.count >= pageSize
                // Live custom statuses and names for the people on screen:
                // everyone online, then the first of the rest.
                let online = all.filter { presence.status(for: $0.userId) != .offline }.map(\.userId)
                ProfileLive.shared.watch(online + all.prefix(150).map(\.userId))
            }
            if rows.count < pageSize { break }
            page += 1
        }
        if roles == nil { roles = await rolesLoad }
        loading = false
        loadingMore = false
    }

    private func kick(_ userId: String) {
        Task { try? await ServerAdmin.kick(serverId: server.id, userId: userId); await load() }
    }
}

/// One person in a space's member list: name in their top role's colour (a
/// personal Aero colour wins), the role icon, a crown for the owner and a
/// shield for admins, and their custom status underneath.
struct MemberRow: View {
    let profile: Profile?
    let status: UserStatus
    var topRole: ServerAdmin.Role?
    var iconRole: ServerAdmin.Role?
    var baseRole: MemberRole = .member

    private var shown: Profile? { ProfileLive.shared.fresh(profile) }

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: shown?.avatarUrl, name: shown?.name ?? "?", size: 40, status: status,
                       decoration: shown?.equippedRingEffect)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    if let shown {
                        StyledName(shown, size: UIFont.preferredFont(forTextStyle: .body).pointSize,
                                   fallbackColor: topRole?.swiftColor,
                                   fallbackGradient: topRole?.nameGradient)
                            .lineLimit(1)
                    } else {
                        Text("Unknown").font(.body.weight(.semibold)).foregroundStyle(Brand.textPrimary)
                    }
                    if shown?.isBot == true { AppTag() }
                    if let icon = iconRole?.icon, !icon.isEmpty { RoleIconView(icon: icon, size: 15) }
                    if baseRole == .owner {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(Color(red: 0xF0 / 255, green: 0xB2 / 255, blue: 0x32 / 255))
                            .accessibilityLabel("Owner")
                    } else if baseRole == .admin {
                        Image(systemName: "shield.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.textMuted)
                            .accessibilityLabel("Admin")
                    }
                }
                if let note = shown?.activeStatusNote {
                    Text(note)
                        .font(.subheadline)
                        .foregroundStyle(Brand.textSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Invite

struct InviteSheet: View {
    let server: Server
    @Environment(\.dismiss) private var dismiss
    @State private var copied = false

    private var inviteLink: String {
        // /server/<code>, not /invite/<code>: the latter has no route and
        // 404s, so every invite shared from the phone was a dead link that
        // neither client recognised as an invite either.
        server.inviteURL ?? ""
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "person.2.wave.2.fill")
                    .font(.system(size: 44)).foregroundStyle(Brand.accent)
                Text("Invite friends to \(server.name)")
                    .font(.headline).foregroundStyle(Brand.textPrimary)
                    .multilineTextAlignment(.center)

                if let code = server.inviteCode, !code.isEmpty {
                    VStack(spacing: 6) {
                        Text("INVITE CODE").font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted)
                        Text(code)
                            .font(.system(.title2, design: .monospaced).weight(.bold))
                            .foregroundStyle(Brand.textPrimary)
                    }
                    .padding().frame(maxWidth: .infinity)
                    .background(Brand.surface, in: .rect(cornerRadius: 14))

                    Button {
                        UIPasteboard.general.string = code
                        copied = true
                    } label: {
                        Label(copied ? "Copied!" : "Copy Invite Code", systemImage: copied ? "checkmark" : "doc.on.doc")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Brand.accent, in: .rect(cornerRadius: 12)).foregroundStyle(.white)
                    }

                    ShareLink(item: inviteLink) {
                        Label("Share Invite Link", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Brand.surface, in: .rect(cornerRadius: 12))
                            .foregroundStyle(Brand.textPrimary)
                    }
                } else {
                    Text("No invite code available for this space.")
                        .foregroundStyle(Brand.textMuted)
                }
                Spacer()
            }
            .padding()
            .background(Brand.background)
            .navigationTitle("Invite People")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Owner settings

/// The owner's identity editor on its own, for the older Servers tab. The
/// spaces shell opens the full `SpaceSettingsView` instead.
struct ServerSettingsSheet: View {
    let server: Server
    var onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            SpaceOverviewView(server: server, editable: true, onSaved: onSaved)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
        }
        .presentationDetents([.large])
    }
}
