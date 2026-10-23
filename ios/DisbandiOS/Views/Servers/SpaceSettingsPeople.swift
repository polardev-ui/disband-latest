import SwiftUI

/// The web's role permission groups (`PERM_GROUPS` in RoleManager.tsx),
/// with the same labels and hints so a role reads the same on both.
enum RolePermissionCatalogue {
    struct Permission: Identifiable {
        let key: String
        let label: String
        let hint: String
        var id: String { key }
    }

    struct Group: Identifiable {
        let title: String
        let permissions: [Permission]
        var id: String { title }
    }

    static let groups: [Group] = [
        Group(title: "Moderation", permissions: [
            Permission(key: "kick", label: "Kick members", hint: "Remove people from the space. They can come back with an invite."),
            Permission(key: "ban", label: "Ban members", hint: "Remove people for good and manage the ban list."),
            Permission(key: "timeout_members", label: "Time out members", hint: "Stop someone posting for a while."),
            Permission(key: "manage_messages", label: "Manage messages", hint: "Delete anyone's messages."),
            Permission(key: "pin_messages", label: "Pin messages", hint: "Pin messages to a channel."),
            Permission(key: "mention_everyone", label: "Mention @everyone", hint: "Ping the whole space with @everyone and @here."),
        ]),
        Group(title: "Messages", permissions: [
            Permission(key: "send_messages", label: "Send messages", hint: "Post in text channels."),
            Permission(key: "add_reactions", label: "Add reactions", hint: "React to messages."),
            Permission(key: "attach_files", label: "Attach files", hint: "Upload images and files."),
        ]),
        Group(title: "Management", permissions: [
            Permission(key: "manage_roles", label: "Manage roles", hint: "Create roles below their own and assign them."),
            Permission(key: "manage_channels", label: "Manage channels", hint: "Create, edit and delete channels."),
            Permission(key: "manage_server", label: "Manage space", hint: "Edit the space's settings and invites."),
            Permission(key: "create_invites", label: "Create invites", hint: "Share invite links."),
            Permission(key: "manage_emojis", label: "Manage emoji", hint: "Add and remove custom emoji and sounds."),
            Permission(key: "manage_webhooks", label: "Manage webhooks", hint: "Create, edit and delete webhooks."),
            Permission(key: "view_audit_log", label: "View audit log", hint: "See who did what."),
        ]),
    ]

    /// All @everyone may be given; the rest stay off it, as on the web.
    static let everyoneAllowed: Set<String> = ["send_messages", "add_reactions", "attach_files"]

    /// The web's `ROLE_COLORS`.
    static let colours = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245",
                          "#e67e22", "#9b59b6", "#1abc9c", "#95a5ba", "#ffffff"]
}

private extension View {
    func settingsListStyle() -> some View {
        listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Brand.background)
    }
}

// MARK: - Members

struct SpaceMembersAdminView: View {
    let server: Server
    let permissions: [String: Bool]

    @Environment(PresenceService.self) private var presence

    @State private var members: [ServerMember] = []
    @State private var results: [Profile]?
    @State private var query = ""
    @State private var loading = true

    private static let rank: [MemberRole: Int] = [.owner: 0, .admin: 1, .moderator: 2, .member: 3]

    private var sorted: [ServerMember] {
        members.sorted {
            let a = Self.rank[$0.role] ?? 3, b = Self.rank[$1.role] ?? 3
            if a != b { return a < b }
            return ($0.profile?.name ?? "").localizedCaseInsensitiveCompare($1.profile?.name ?? "") == .orderedAscending
        }
    }

    var body: some View {
        List {
            if let results {
                Section {
                    if results.isEmpty {
                        Text("No one matches \u{201C}\(query)\u{201D}.")
                            .foregroundStyle(Brand.textMuted)
                    }
                    ForEach(results) { profile in
                        memberLink(profile, role: members.first { $0.userId == profile.id }?.role)
                    }
                }
                .listRowBackground(Brand.surface)
            } else if loading {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else {
                Section("\(members.count) \(members.count == 1 ? "member" : "members")") {
                    ForEach(sorted) { member in
                        if let profile = member.profile { memberLink(profile, role: member.role) }
                    }
                }
                .listRowBackground(Brand.surface)
            }
        }
        .settingsListStyle()
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search members")
        .task { await load() }
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard !q.isEmpty else { results = nil; return }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let found = await ServerAdmin.searchMembers(serverId: server.id, query: q)
            if !Task.isCancelled { results = found }
        }
    }

    private func memberLink(_ profile: Profile, role: MemberRole?) -> some View {
        NavigationLink {
            MemberAdminView(server: server, profile: profile, permissions: permissions) {
                members.removeAll { $0.userId == profile.id }
                results?.removeAll { $0.id == profile.id }
            }
        } label: {
            HStack {
                FriendRow(profile: profile, status: presence.status(for: profile.id))
                Spacer(minLength: 8)
                if let role, role != .member {
                    Text(role.rawValue.capitalized)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background((role == .owner ? Brand.idle : Brand.accent).opacity(0.18), in: .capsule)
                        .foregroundStyle(role == .owner ? Brand.idle : Brand.accent)
                }
            }
        }
    }

    private func load() async {
        members = (try? await DatabaseService.members(serverId: server.id)) ?? members
        loading = false
    }
}

/// One member: their roles, and the moderation you're allowed to do to them.
struct MemberAdminView: View {
    let server: Server
    let profile: Profile
    let permissions: [String: Bool]
    /// Kicked or banned: the list should drop them.
    var onRemoved: () -> Void

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var memberRole: String?
    @State private var roles: [ServerAdmin.Role] = []
    @State private var roleIds: Set<String> = []
    @State private var timeoutEnds: Date?
    @State private var loading = true
    @State private var busy = false
    @State private var error: String?

    @State private var timeoutSeconds: Int?
    @State private var showTimeout = false
    @State private var confirmKick = false
    @State private var showBan = false
    @State private var reason = ""

    private var isOwnerRow: Bool { memberRole == "owner" || profile.id == server.ownerId }
    private var isSelf: Bool { profile.id == app.currentUserId }
    private var isOwner: Bool { server.ownerId == app.currentUserId }
    private func can(_ key: String) -> Bool { isOwner || permissions[key] == true }
    private var canAct: Bool { !isOwnerRow && !isSelf }

    private static let durations: [(label: String, seconds: Int)] = [
        ("60 seconds", 60), ("5 minutes", 300), ("10 minutes", 600),
        ("1 hour", 3600), ("1 day", 86_400), ("1 week", 604_800),
    ]

    private var assignable: [ServerAdmin.Role] { roles.filter { $0.isDefault != true } }

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    AvatarView(url: profile.avatarUrl, name: profile.name, size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(profile.name).font(.title3.weight(.semibold)).foregroundStyle(Brand.textPrimary)
                        Text("@\(profile.handle)").font(.subheadline).foregroundStyle(Brand.textMuted)
                    }
                }
                .padding(.vertical, 4)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            if can("manage_roles") && !assignable.isEmpty {
                Section {
                    ForEach(assignable) { role in
                        Toggle(isOn: Binding(
                            get: { roleIds.contains(role.id) },
                            set: { toggle(role.id, on: $0) }
                        )) {
                            HStack(spacing: 10) {
                                Circle().fill(Color(hexString: role.color) ?? Brand.textMuted)
                                    .frame(width: 12, height: 12)
                                Text(role.name).foregroundStyle(Brand.textPrimary)
                            }
                        }
                        .disabled(busy)
                    }
                } header: {
                    Text("Roles")
                } footer: {
                    Text("You can only hand out roles below your own highest role.")
                }
                .listRowBackground(Brand.surface)
            }

            if canAct && (can("timeout_members") || can("kick") || can("ban")) {
                Section("Moderation") {
                    if can("timeout_members") {
                        if let ends = timeoutEnds {
                            HStack {
                                SpaceSettingsRow(title: "Timed out", symbol: "timer")
                                Text("until \(ends.formatted(date: .abbreviated, time: .shortened))")
                                    .font(.subheadline)
                                    .foregroundStyle(Brand.textMuted)
                            }
                            Button("Remove Timeout") { run { try await ServerAdmin.removeTimeout(serverId: server.id, userId: profile.id); timeoutEnds = nil } }
                        } else {
                            Menu {
                                ForEach(Self.durations, id: \.seconds) { option in
                                    Button(option.label) {
                                        reason = ""
                                        timeoutSeconds = option.seconds
                                        showTimeout = true
                                    }
                                }
                            } label: {
                                SpaceSettingsRow(title: "Time Out", symbol: "timer", chevron: true)
                            }
                        }
                    }
                    if can("kick") {
                        Button(role: .destructive) { confirmKick = true } label: {
                            Label("Kick", systemImage: "person.fill.xmark").foregroundStyle(Brand.dnd)
                        }
                    }
                    if can("ban") {
                        Button(role: .destructive) { reason = ""; showBan = true } label: {
                            Label("Ban", systemImage: "nosign").foregroundStyle(Brand.dnd)
                        }
                    }
                }
                .listRowBackground(Brand.surface)
            } else if isOwnerRow && !loading {
                Section {
                    Text("The owner can't be moderated.").foregroundStyle(Brand.textMuted)
                }
                .listRowBackground(Brand.surface)
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(Brand.dnd)
                }
                .listRowBackground(Brand.surface)
            }
        }
        .settingsListStyle()
        .navigationTitle(profile.name)
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if busy { ProgressView().controlSize(.large) } }
        .task { await load() }
        .alert("Time out \(profile.name)?", isPresented: $showTimeout) {
            TextField("Reason (optional)", text: $reason)
            Button("Time Out", role: .destructive) {
                guard let seconds = timeoutSeconds else { return }
                run {
                    try await ServerAdmin.timeout(serverId: server.id, userId: profile.id,
                                                  seconds: seconds, reason: reason.trimmed)
                    timeoutEnds = Date().addingTimeInterval(TimeInterval(seconds))
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They can read but can't post, react or join voice until it ends.")
        }
        .confirmationDialog("Kick \(profile.name)?", isPresented: $confirmKick, titleVisibility: .visible) {
            Button("Kick", role: .destructive) {
                run {
                    try await ServerAdmin.kick(serverId: server.id, userId: profile.id)
                    onRemoved()
                    dismiss()
                }
            }
        } message: {
            Text("They can come back with an invite.")
        }
        .alert("Ban \(profile.name)?", isPresented: $showBan) {
            TextField("Reason (optional)", text: $reason)
            Button("Ban", role: .destructive) {
                run {
                    try await ServerAdmin.ban(serverId: server.id, userId: profile.id, reason: reason.trimmed)
                    onRemoved()
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They're removed and can't rejoin until you lift the ban. Only moderators see the reason.")
        }
    }

    private func load() async {
        async let detail = ServerAdmin.memberDetail(serverId: server.id, userId: profile.id)
        async let loadedRoles = try? ServerAdmin.roles(serverId: server.id)
        async let ends = ServerAdmin.timeoutEnds(serverId: server.id, userId: profile.id)
        let d = await detail
        memberRole = d?.role
        roleIds = Set(d?.roleIds ?? [])
        roles = await loadedRoles ?? []
        timeoutEnds = await ends
        loading = false
    }

    private func toggle(_ roleId: String, on: Bool) {
        let before = roleIds
        if on { roleIds.insert(roleId) } else { roleIds.remove(roleId) }
        let next = Array(roleIds)
        Task {
            do {
                try await ServerAdmin.setMemberRoles(serverId: server.id, userId: profile.id, roleIds: next)
                error = nil
            } catch {
                roleIds = before
                self.error = error.localizedDescription
            }
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            do {
                try await work()
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

private extension String {
    /// Trimmed, or nil when nothing is left.
    var trimmed: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}

// MARK: - Roles

struct RolesAdminView: View {
    let serverId: String

    @State private var roles: [ServerAdmin.Role] = []
    @State private var loading = true
    @State private var creating = false
    @State private var pendingDelete: ServerAdmin.Role?
    @State private var error: String?

    /// Highest first, without @everyone.
    private var custom: [ServerAdmin.Role] { roles.filter { $0.isDefault != true } }
    private var everyone: ServerAdmin.Role? { roles.first { $0.isDefault == true } }

    var body: some View {
        List {
            if loading && roles.isEmpty {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else {
                Section {
                    if custom.isEmpty {
                        Text("No roles yet. Add one to give people a colour and permissions.")
                            .foregroundStyle(Brand.textMuted)
                    }
                    ForEach(custom) { role in
                        NavigationLink {
                            RoleEditorView(role: role) { await load() }
                        } label: {
                            roleRow(role)
                        }
                    }
                    .onMove(perform: move)
                    .onDelete { offsets in
                        if let i = offsets.first { pendingDelete = custom[i] }
                    }
                } header: {
                    Text("Roles")
                } footer: {
                    Text("Higher roles outrank lower ones. Tap Edit to drag them into order.")
                }
                .listRowBackground(Brand.surface)

                if let everyone {
                    Section {
                        NavigationLink {
                            RoleEditorView(role: everyone) { await load() }
                        } label: {
                            roleRow(everyone)
                        }
                    } footer: {
                        Text("Everyone in the space has this role.")
                    }
                    .listRowBackground(Brand.surface)
                }
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(Brand.dnd)
                }
                .listRowBackground(Brand.surface)
            }
        }
        .settingsListStyle()
        .navigationTitle("Roles")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if !custom.isEmpty { EditButton() }
                Button(action: createRole) {
                    if creating { ProgressView() } else { Image(systemName: "plus") }
                }
                .disabled(creating)
                .accessibilityLabel("New role")
            }
        }
        .task { await load() }
        .confirmationDialog(
            "Delete \(pendingDelete?.name ?? "role")?",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Role", role: .destructive) {
                guard let role = pendingDelete else { return }
                Task {
                    do {
                        try await ServerAdmin.deleteRole(roleId: role.id)
                        roles.removeAll { $0.id == role.id }
                        error = nil
                    } catch { self.error = error.localizedDescription }
                    await load()
                }
            }
        } message: {
            Text("Everyone who has it loses it.")
        }
    }

    private func roleRow(_ role: ServerAdmin.Role) -> some View {
        HStack(spacing: 12) {
            Image(systemName: role.isDefault == true ? "person.3" : "shield.fill")
                .foregroundStyle(role.isDefault == true ? Brand.textSecondary
                                 : (Color(hexString: role.color) ?? Brand.textSecondary))
                .frame(width: 24)
            Text(role.isDefault == true ? "@everyone" : role.name)
                .foregroundStyle(Brand.textPrimary)
                .lineLimit(1)
        }
    }

    private func load() async {
        do {
            roles = try await ServerAdmin.roles(serverId: serverId)
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func createRole() {
        creating = true
        Task {
            do {
                try await ServerAdmin.createRole(serverId: serverId, name: "new role",
                                                 color: "#99aab5", position: roles.count)
                error = nil
            } catch { self.error = error.localizedDescription }
            await load()
            creating = false
        }
    }

    /// The list runs highest first; `move_role` takes the position counted
    /// up from @everyone (0), so the top of the list is `custom.count`.
    private func move(from source: IndexSet, to destination: Int) {
        guard let from = source.first else { return }
        let moved = custom[from]
        var reordered = custom
        reordered.move(fromOffsets: source, toOffset: destination)
        guard let index = reordered.firstIndex(where: { $0.id == moved.id }) else { return }
        let position = reordered.count - index
        roles = reordered + (everyone.map { [$0] } ?? [])
        Task {
            do {
                try await ServerAdmin.moveRole(roleId: moved.id, to: position)
                error = nil
            } catch { self.error = error.localizedDescription }
            await load()
        }
    }
}

struct RoleEditorView: View {
    let original: ServerAdmin.Role
    var onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var role: ServerAdmin.Role
    @State private var busy = false
    @State private var error: String?
    @State private var confirmDelete = false

    init(role: ServerAdmin.Role, onSaved: @escaping () async -> Void) {
        original = role
        self.onSaved = onSaved
        _role = State(initialValue: role)
    }

    private var isEveryone: Bool { role.isDefault == true }
    private var dirty: Bool { role != original }
    private var canSave: Bool {
        dirty && !busy && !role.name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        List {
            if !isEveryone {
                Section("Name") {
                    TextField("Role name", text: $role.name)
                }
                .listRowBackground(Brand.surface)

                Section("Colour") {
                    colourPicker
                }
                .listRowBackground(Brand.surface)
            }

            ForEach(RolePermissionCatalogue.groups) { group in
                Section(group.title) {
                    ForEach(group.permissions) { permission in
                        let locked = isEveryone && !RolePermissionCatalogue.everyoneAllowed.contains(permission.key)
                        Toggle(isOn: Binding(
                            get: { role.permissions[permission.key] == true },
                            set: { role.permissions[permission.key] = $0 }
                        )) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(permission.label).foregroundStyle(Brand.textPrimary)
                                Text(locked ? "Not available on @everyone." : permission.hint)
                                    .font(.footnote)
                                    .foregroundStyle(Brand.textMuted)
                            }
                        }
                        .disabled(locked)
                    }
                }
                .listRowBackground(Brand.surface)
            }

            if !isEveryone {
                Section {
                    Button("Delete Role", role: .destructive) { confirmDelete = true }
                }
                .listRowBackground(Brand.surface)
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(Brand.dnd)
                }
                .listRowBackground(Brand.surface)
            }
        }
        .settingsListStyle()
        .navigationTitle(isEveryone ? "@everyone" : (original.name.isEmpty ? "Role" : original.name))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if busy { ProgressView() } else {
                    Button("Save", action: save).disabled(!canSave)
                }
            }
        }
        .confirmationDialog("Delete \(original.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete Role", role: .destructive, action: delete)
        } message: {
            Text("Everyone who has it loses it.")
        }
    }

    private var colourPicker: some View {
        HStack(spacing: 0) {
            ForEach(RolePermissionCatalogue.colours, id: \.self) { hex in
                let selected = role.color.lowercased() == hex
                Button { role.color = hex } label: {
                    Circle()
                        .fill(Color(hexString: hex) ?? .gray)
                        .frame(width: 24, height: 24)
                        .overlay(Circle().strokeBorder(Brand.textPrimary, lineWidth: selected ? 2 : 0).padding(-4))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Colour \(hex)")
            }
            ColorPicker("Custom colour", selection: Binding(
                get: { Color(hexString: role.color) ?? .gray },
                set: { role.color = $0.hexString }
            ), supportsOpacity: false)
            .labelsHidden()
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 6)
    }

    private func save() {
        busy = true
        var patch = role
        patch.name = role.name.trimmingCharacters(in: .whitespaces)
        Task {
            do {
                try await ServerAdmin.updateRole(patch)
                await onSaved()
                dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func delete() {
        busy = true
        Task {
            do {
                try await ServerAdmin.deleteRole(roleId: role.id)
                await onSaved()
                dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

private extension Color {
    /// "#rrggbb", the form roles are stored in.
    var hexString: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(self).getRed(&r, green: &g, blue: &b, alpha: &a)
        func byte(_ v: CGFloat) -> Int { Int((min(max(v, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(r), byte(g), byte(b))
    }
}

// MARK: - Bans

struct BansAdminView: View {
    let serverId: String

    @State private var bans: [ServerAdmin.Ban] = []
    @State private var loading = true
    @State private var pending: ServerAdmin.Ban?
    @State private var error: String?

    var body: some View {
        List {
            if loading && bans.isEmpty {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if bans.isEmpty {
                Section {
                    VStack(spacing: 8) {
                        Image(systemName: "nosign").font(.title2).foregroundStyle(Brand.textMuted)
                        Text("No one is banned").font(.headline).foregroundStyle(Brand.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                }
                .listRowBackground(Brand.surface)
            } else {
                Section {
                    ForEach(bans) { ban in
                        Button { pending = ban } label: { banRow(ban) }
                            .swipeActions {
                                Button("Lift Ban") { pending = ban }.tint(Brand.accent)
                            }
                    }
                } footer: {
                    Text("Banned people can't rejoin until you lift their ban.")
                }
                .listRowBackground(Brand.surface)
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(Brand.dnd)
                }
                .listRowBackground(Brand.surface)
            }
        }
        .settingsListStyle()
        .navigationTitle("Bans")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .confirmationDialog(
            "Lift the ban on \(pending?.profile?.name ?? "this person")?",
            isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
            titleVisibility: .visible
        ) {
            Button("Lift Ban") {
                guard let ban = pending else { return }
                Task {
                    do {
                        try await ServerAdmin.unban(serverId: serverId, userId: ban.userId)
                        bans.removeAll { $0.userId == ban.userId }
                        error = nil
                    } catch { self.error = error.localizedDescription }
                }
            }
        } message: {
            Text("They'll be able to join again with an invite.")
        }
    }

    private func banRow(_ ban: ServerAdmin.Ban) -> some View {
        HStack(spacing: 12) {
            AvatarView(url: ban.profile?.avatarUrl, name: ban.profile?.name ?? "?", size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(ban.profile?.name ?? "Unknown user")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Brand.textPrimary)
                    .lineLimit(1)
                Text(ban.reason?.isEmpty == false ? ban.reason! : "No reason given")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textMuted)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Text(RelativeTime.compact(ban.createdAt))
                .font(.caption)
                .foregroundStyle(Brand.textMuted)
        }
        .contentShape(Rectangle())
    }

    private func load() async {
        do {
            bans = try await ServerAdmin.bans(serverId: serverId)
            error = nil
        } catch { self.error = error.localizedDescription }
        loading = false
    }
}
