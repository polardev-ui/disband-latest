import SwiftUI

// MARK: - Members

/// Everyone in a space, split into Online and Offline from live presence the
/// way Discord lists a server, owner and staff first within each.
struct ServerMembersView: View {
    let server: Server
    @Environment(AppState.self) private var app
    @Environment(PresenceService.self) private var presence
    @State private var members: [ServerMember] = []
    @State private var loading = true
    @State private var openProfile: Profile?
    @State private var query = ""

    private var isOwner: Bool { server.ownerId == app.currentUserId }

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

    private func roleRank(_ role: MemberRole) -> Int {
        switch role {
        case .owner: return 4
        case .admin: return 3
        case .moderator: return 2
        case .member: return 1
        }
    }

    /// Highest base role first; inside a role, name order. User id is the
    /// final tiebreaker so equal names cannot swap places between refreshes.
    private func ordered(_ list: [ServerMember]) -> [ServerMember] {
        list.sorted { a, b in
            if roleRank(a.role) != roleRank(b.role) {
                return roleRank(a.role) > roleRank(b.role)
            }
            let an = a.profile?.name ?? ""
            let bn = b.profile?.name ?? ""
            let comparison = an.localizedCaseInsensitiveCompare(bn)
            if comparison != .orderedSame { return comparison == .orderedAscending }
            return a.userId < b.userId
        }
    }

    private var filtered: [ServerMember] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return members }
        return members.filter {
            ($0.profile?.name.lowercased().contains(q) ?? false)
                || ($0.profile?.username?.lowercased().contains(q) ?? false)
        }
    }

    private var onlineMembers: [ServerMember] {
        ordered(filtered.filter { liveStatus(for: $0) != .offline })
    }

    private var offlineMembers: [ServerMember] {
        ordered(filtered.filter { liveStatus(for: $0) == .offline })
    }

    var body: some View {
        Group {
            if loading {
                StateView(kind: .loading)
            } else {
                List {
                    if !onlineMembers.isEmpty {
                        Section("Online — \(onlineMembers.count)") {
                            ForEach(onlineMembers) { memberRow($0) }
                        }
                    }
                    if !offlineMembers.isEmpty {
                        Section("Offline — \(offlineMembers.count)") {
                            ForEach(offlineMembers) { memberRow($0).opacity(0.6) }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .searchable(text: $query, prompt: "Search members")
                .refreshable { await load() }
            }
        }
        .background(Brand.background)
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $openProfile) { ProfileDetailView(profile: $0) }
        .task { await load() }
    }

    @ViewBuilder private func memberRow(_ member: ServerMember) -> some View {
        Button { openProfile = member.profile } label: {
            HStack {
                FriendRow(profile: member.profile, status: liveStatus(for: member))
                Spacer()
                roleBadge(member.role)
            }
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

    @ViewBuilder private func roleBadge(_ role: MemberRole) -> some View {
        if role != .member {
            Text(role.rawValue.capitalized)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(role == .owner ? Brand.idle.opacity(0.2) : Brand.accent.opacity(0.2),
                            in: .capsule)
                .foregroundStyle(role == .owner ? Brand.idle : Brand.accent)
        }
    }

    private func load() async {
        if members.isEmpty { loading = true }
        let loaded = try? await DatabaseService.members(serverId: server.id)
        if let loaded { members = loaded }
        loading = false
    }

    private func kick(_ userId: String) {
        Task { try? await ServerAdmin.kick(serverId: server.id, userId: userId); await load() }
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
