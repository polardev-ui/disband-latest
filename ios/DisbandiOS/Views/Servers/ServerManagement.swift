import SwiftUI
import PhotosUI

// MARK: - Members

struct ServerMembersView: View {
    let server: Server
    @Environment(AppState.self) private var app
    @State private var members: [ServerMember] = []
    @State private var loading = true
    @State private var openProfile: Profile?

    private var isOwner: Bool { server.ownerId == app.currentUserId }

    var body: some View {
        Group {
            if loading {
                StateView(kind: .loading)
            } else {
                List {
                    Section("Members — \(members.count)") {
                        ForEach(members) { member in
                            Button { openProfile = member.profile } label: {
                                HStack {
                                    FriendRow(profile: member.profile)
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
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Brand.background)
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $openProfile) { ProfileDetailView(profile: $0) }
        .task { await load() }
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
        members = (try? await DatabaseService.members(serverId: server.id)) ?? []
        loading = false
    }

    private func kick(_ userId: String) {
        Task { try? await DatabaseService.kickMember(serverId: server.id, userId: userId); await load() }
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
        "\(AppConfig.webAppURL.absoluteString)/server/\(server.inviteCode ?? "")"
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
                    Text("No invite code available for this server.")
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

struct ServerSettingsSheet: View {
    let server: Server
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
    @State private var busy = false
    @State private var error: String?

    private var iconUrl: String? { newIconUrl ?? server.iconUrl }
    private var bannerUrl: String? { newBannerUrl ?? server.bannerUrl }
    private var shownName: String { name.isEmpty ? server.name : name }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    identityCard
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                } footer: {
                    Text("Tap the banner or icon to change them.")
                }

                Section("Server name") {
                    TextField("Server name", text: $name)
                }
                Section {
                    TextField("What's this server about?", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Text("Description")
                } footer: {
                    Text("Shown to people who find this server through discovery.")
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(Brand.dnd)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Server Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(busy || !canSave)
                }
            }
            .onAppear { name = server.name; description = server.description ?? "" }
            .onChange(of: iconItem) { _, item in
                if let item { Task { await upload(item, banner: false) } }
            }
            .onChange(of: bannerItem) { _, item in
                if let item { Task { await upload(item, banner: true) } }
            }
        }
        .presentationDetents([.large])
    }

    /// Banner with the icon overlapping its lower edge, so the server is
    /// edited as it will actually appear rather than as a list of fields.
    private var identityCard: some View {
        VStack(spacing: 0) {
            PhotosPicker(selection: $bannerItem, matching: .images) {
                ZStack {
                    RemoteImage(url: bannerUrl, contentMode: .fill) {
                        LinearGradient(
                            colors: [Color(seed: server.id), Color(seed: server.id + "2")],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    }
                    .frame(height: 112)
                    .frame(maxWidth: .infinity)
                    .clipped()

                    if uploadingBanner {
                        Color.black.opacity(0.35)
                        ProgressView().tint(.white)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    pip(systemImage: "photo").padding(10)
                }
            }
            .buttonStyle(.plain)

            HStack(alignment: .bottom, spacing: 12) {
                PhotosPicker(selection: $iconItem, matching: .images) {
                    AvatarView(url: iconUrl, name: shownName, size: 72)
                        .background(Circle().fill(Brand.surface).padding(-4))
                        .overlay(alignment: .bottomTrailing) {
                            if uploadingIcon {
                                ProgressView().controlSize(.small)
                            } else {
                                pip(systemImage: "camera.fill")
                            }
                        }
                }
                .buttonStyle(.plain)

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
