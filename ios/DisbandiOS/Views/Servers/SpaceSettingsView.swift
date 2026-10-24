import PhotosUI
import SwiftUI

/**
 Space Settings: the phone's version of the web's settings modal. Each page
 appears only when the person holds the permission the web asks for, so a
 moderator sees Members and Bans, a channel manager sees Channels, and only
 the owner can edit the space's identity or delete it.
 */
struct SpaceSettingsView: View {
    let server: Server
    var onChanged: () async -> Void
    /// The space is gone (deleted); the caller should leave it.
    var onDeleted: () -> Void

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var permissions: [String: Bool] = [:]
    @State private var showInvite = false
    @State private var showCatalysts = false
    @State private var confirmDelete = false
    @State private var deleteName = ""
    @State private var deleting = false
    @State private var error: String?

    private var isOwner: Bool { server.ownerId == app.currentUserId }
    private func can(_ key: String) -> Bool { isOwner || permissions[key] == true }

    private var canSeeMembers: Bool {
        can("manage_roles") || can("kick") || can("ban") || can("timeout_members")
    }

    var body: some View {
        NavigationStack {
            List {
                Section { header }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)

                Section("Space") {
                    NavigationLink {
                        SpaceOverviewView(server: server, editable: isOwner, onSaved: onChanged)
                    } label: {
                        SpaceSettingsRow(title: "Overview", symbol: "info.circle")
                    }
                    Button { showInvite = true } label: {
                        SpaceSettingsRow(title: "Invites", symbol: "link", chevron: true)
                    }
                    Button { showCatalysts = true } label: {
                        SpaceSettingsRow(title: "Catalysts", symbol: "bolt", chevron: true)
                    }
                }
                .listRowBackground(Brand.surface)

                if canSeeMembers || can("ban") {
                    Section("People") {
                        if canSeeMembers {
                            NavigationLink {
                                SpaceMembersAdminView(server: server, permissions: permissions)
                            } label: {
                                SpaceSettingsRow(title: "Members", symbol: "person.2")
                            }
                        }
                        if can("manage_roles") {
                            NavigationLink {
                                RolesAdminView(serverId: server.id)
                            } label: {
                                SpaceSettingsRow(title: "Roles", symbol: "shield")
                            }
                        }
                        if can("ban") {
                            NavigationLink {
                                BansAdminView(serverId: server.id)
                            } label: {
                                SpaceSettingsRow(title: "Bans", symbol: "nosign")
                            }
                        }
                    }
                    .listRowBackground(Brand.surface)
                }

                if can("manage_channels") {
                    Section("Content") {
                        NavigationLink {
                            ChannelsAdminView(server: server, onChanged: onChanged)
                        } label: {
                            SpaceSettingsRow(title: "Channels", symbol: "number")
                        }
                    }
                    .listRowBackground(Brand.surface)
                }

                if can("view_audit_log") {
                    Section("Moderation") {
                        NavigationLink {
                            AuditLogView(serverId: server.id)
                        } label: {
                            SpaceSettingsRow(title: "Audit Log", symbol: "list.bullet.rectangle")
                        }
                    }
                    .listRowBackground(Brand.surface)
                }

                if isOwner {
                    Section {
                        Button(role: .destructive) {
                            deleteName = ""
                            confirmDelete = true
                        } label: {
                            HStack {
                                Text("Delete Space")
                                Spacer()
                                if deleting { ProgressView() }
                            }
                        }
                        .disabled(deleting)
                    } footer: {
                        if let error {
                            Text(error).foregroundStyle(Brand.dnd)
                        } else {
                            Text("Removes every channel and message for everyone. This can't be undone.")
                        }
                    }
                    .listRowBackground(Brand.surface)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Space Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task { permissions = await ServerAdmin.permissions(serverId: server.id) }
            .sheet(isPresented: $showInvite) { InviteSheet(server: server) }
            .sheet(isPresented: $showCatalysts) {
                CatalystSheet(serverId: server.id, serverName: server.name)
            }
            .alert("Delete \(server.name)?", isPresented: $confirmDelete) {
                TextField("Space name", text: $deleteName)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Delete", role: .destructive, action: deleteSpace)
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Type the space's name to confirm. Every channel and message goes with it.")
            }
        }
        .tint(Brand.accent)
    }

    private var header: some View {
        HStack(spacing: 14) {
            AvatarView(url: server.iconUrl, name: server.name, size: 52)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(server.name)
                        .font(.headline)
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    if server.verified == true {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.subheadline)
                            .foregroundStyle(Brand.verified)
                    }
                }
                Text(isOwner ? "You own this space" : "You can manage parts of this space")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
    }

    private func deleteSpace() {
        guard deleteName.trimmingCharacters(in: .whitespaces) == server.name else {
            error = "The name didn't match, so nothing was deleted."
            return
        }
        deleting = true
        error = nil
        Task {
            do {
                try await ServerAdmin.deleteServer(serverId: server.id)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                dismiss()
                onDeleted()
            } catch {
                self.error = error.localizedDescription
            }
            deleting = false
        }
    }
}

/// An icon and title for a settings row; `chevron` draws the disclosure
/// arrow on rows that open a sheet rather than push.
struct SpaceSettingsRow: View {
    let title: String
    let symbol: String
    var detail: String? = nil
    var chevron = false

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Brand.textSecondary)
                .frame(width: 24)
            Text(title).foregroundStyle(Brand.textPrimary)
            Spacer(minLength: 8)
            if let detail {
                Text(detail).foregroundStyle(Brand.textMuted)
            }
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Brand.textMuted.opacity(0.7))
            }
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Overview

/**
 Name, description, icon, banner and discoverability. Everyone who can open
 Space Settings sees it; only the owner can change it, as on the web.
 */
struct SpaceOverviewView: View {
    let server: Server
    var editable: Bool
    var onSaved: () async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var description = ""
    @State private var iconItem: PhotosPickerItem?
    @State private var bannerItem: PhotosPickerItem?
    @State private var newIconUrl: String?
    @State private var newBannerUrl: String?
    @State private var uploadingIcon = false
    @State private var uploadingBanner = false
    @State private var discoverable = false
    @State private var discoverableLoaded = false
    @State private var busy = false
    @State private var error: String?

    private var iconUrl: String? { newIconUrl ?? server.iconUrl }
    private var bannerUrl: String? { newBannerUrl ?? server.bannerUrl }
    private var shownName: String { name.isEmpty ? server.name : name }

    private var dirty: Bool {
        name.trimmingCharacters(in: .whitespaces) != server.name
            || description.trimmingCharacters(in: .whitespaces) != (server.description ?? "")
            || newIconUrl != nil || newBannerUrl != nil
    }

    private var canSave: Bool {
        editable && dirty && !busy && !uploadingIcon && !uploadingBanner
            && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        Form {
            Section {
                identityCard
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            } footer: {
                if editable { Text("Tap the banner or icon to change them.") }
            }

            Section("Name") {
                TextField("Space name", text: $name)
                    .disabled(!editable)
            }
            .listRowBackground(Brand.surface)

            Section {
                TextField("What's this space about?", text: $description, axis: .vertical)
                    .lineLimit(3...6)
                    .disabled(!editable)
            } header: {
                Text("Description")
            } footer: {
                Text("Shown to people who find this space through Discover.")
            }
            .listRowBackground(Brand.surface)

            Section {
                Toggle("Show in Discover", isOn: Binding(
                    get: { discoverable },
                    set: { setDiscoverable($0) }
                ))
                .disabled(!editable || !discoverableLoaded)
            } footer: {
                Text(editable
                     ? "Anyone can find and join a space that's in Discover."
                     : "Only the owner can change these.")
            }
            .listRowBackground(Brand.surface)

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Brand.dnd)
                }
                .listRowBackground(Brand.surface)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Overview")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if editable {
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Save", action: save).disabled(!canSave)
                    }
                }
            }
        }
        .onAppear {
            if name.isEmpty { name = server.name; description = server.description ?? "" }
        }
        .task {
            discoverable = await ServerAdmin.isDiscoverable(serverId: server.id)
            discoverableLoaded = true
        }
        .onChange(of: iconItem) { _, item in
            if let item { Task { await upload(item, banner: false) } }
        }
        .onChange(of: bannerItem) { _, item in
            if let item { Task { await upload(item, banner: true) } }
        }
    }

    /// Banner with the icon overlapping its lower edge, so the space is
    /// edited as it will actually appear rather than as a list of fields.
    private var identityCard: some View {
        VStack(spacing: 0) {
            PhotosPicker(selection: $bannerItem, matching: .images) {
                ZStack {
                    BannerImage(url: bannerUrl, height: 112) {
                        LinearGradient(
                            colors: [Color(seed: server.id), Color(seed: server.id + "2")],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    }
                    if uploadingBanner {
                        Color.black.opacity(0.35)
                        ProgressView().tint(.white)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if editable { pip(systemImage: "photo").padding(10) }
                }
            }
            .buttonStyle(.plain)
            .disabled(!editable)

            HStack(alignment: .bottom, spacing: 12) {
                PhotosPicker(selection: $iconItem, matching: .images) {
                    AvatarView(url: iconUrl, name: shownName, size: 72)
                        .background(Circle().fill(Brand.surface).padding(-4))
                        .overlay(alignment: .bottomTrailing) {
                            if uploadingIcon {
                                ProgressView().controlSize(.small)
                            } else if editable {
                                pip(systemImage: "camera.fill")
                            }
                        }
                }
                .buttonStyle(.plain)
                .disabled(!editable)

                VStack(alignment: .leading, spacing: 2) {
                    Text(shownName)
                        .font(.headline)
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    Text(description.isEmpty ? "No description yet" : description)
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                        .lineLimit(2)
                }
                .padding(.bottom, 4)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.top, -30)
            .padding(.bottom, 14)
        }
        .background(Brand.surface)
        .clipShape(.rect(cornerRadius: 16))
        .padding(.vertical, 8)
    }

    private func pip(systemImage: String) -> some View {
        Image(systemName: systemImage)
            .font(.caption2)
            .padding(6)
            .background(Brand.accent, in: .circle)
            .foregroundStyle(.white)
    }

    private func upload(_ item: PhotosPickerItem, banner: Bool) async {
        if banner { uploadingBanner = true } else { uploadingIcon = true }
        defer {
            if banner { uploadingBanner = false } else { uploadingIcon = false }
        }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let result = try? await MediaService.uploadImage(data) else {
            error = "That image couldn't be uploaded. Try another."
            return
        }
        error = nil
        if banner { newBannerUrl = result.url } else { newIconUrl = result.url }
    }

    private func setDiscoverable(_ on: Bool) {
        let before = discoverable
        discoverable = on
        Task {
            do {
                try await ServerAdmin.setDiscoverable(serverId: server.id, on)
            } catch {
                discoverable = before
                self.error = error.localizedDescription
            }
        }
    }

    private func save() {
        busy = true
        Task {
            do {
                try await DatabaseService.updateServer(
                    serverId: server.id,
                    name: name.trimmingCharacters(in: .whitespaces),
                    description: description.trimmingCharacters(in: .whitespaces),
                    iconUrl: newIconUrl,
                    bannerUrl: newBannerUrl)
                await onSaved()
                dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}
