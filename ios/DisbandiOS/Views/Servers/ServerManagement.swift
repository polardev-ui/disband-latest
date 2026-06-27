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
        "\(AppConfig.webAppURL.absoluteString)/invite/\(server.inviteCode ?? "")"
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
    @State private var newIconUrl: String?
    @State private var uploading = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        PhotosPicker(selection: $iconItem, matching: .images) {
                            AvatarView(url: newIconUrl ?? server.iconUrl, name: name.isEmpty ? server.name : name, size: 84)
                                .overlay(alignment: .bottomTrailing) {
                                    Image(systemName: uploading ? "arrow.triangle.2.circlepath" : "pencil.circle.fill")
                                        .font(.title3).foregroundStyle(Brand.accent)
                                        .background(Circle().fill(Brand.background))
                                }
                        }
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                }
                Section("Server name") { TextField("Server name", text: $name) }
                Section("Description") {
                    TextField("What's this server about?", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                }
                if let error { Text(error).foregroundStyle(Brand.dnd) }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Server Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save", action: save).disabled(busy) }
            }
            .onAppear { name = server.name; description = server.description ?? "" }
            .onChange(of: iconItem) { _, item in if let item { Task { await uploadIcon(item) } } }
        }
        .presentationDetents([.large])
    }

    private func uploadIcon(_ item: PhotosPickerItem) async {
        uploading = true; defer { uploading = false }
        if let data = try? await item.loadTransferable(type: Data.self),
           let result = try? await MediaService.uploadImage(data) {
            newIconUrl = result.url
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
                    iconUrl: newIconUrl)
                await onSaved()
                dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}
