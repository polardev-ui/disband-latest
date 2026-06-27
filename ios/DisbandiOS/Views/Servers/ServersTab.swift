import SwiftUI

struct ServersTab: View {
    @State private var servers: [Server] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showJoin = false
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    StateView(kind: .loading)
                } else if let error {
                    StateView(kind: .error, title: error)
                } else if servers.isEmpty {
                    StateView(kind: .empty, title: "You're not in any servers yet.\nJoin or create one to get started.",
                              systemImage: "server.rack")
                } else {
                    List(servers) { server in
                        NavigationLink(value: server) {
                            ServerRow(server: server)
                        }
                        .listRowBackground(Brand.surface)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Brand.background)
            .navigationTitle("Servers")
            .navigationDestination(for: Server.self) { srv in
                ChannelListView(server: srv, onChanged: { await load() })
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { showJoin = true } label: { Label("Join with Invite", systemImage: "link") }
                        Button { showCreate = true } label: { Label("Create Server", systemImage: "plus") }
                    } label: { Image(systemName: "plus") }
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .sheet(isPresented: $showJoin) {
                JoinServerSheet { await load() }
            }
            .sheet(isPresented: $showCreate) {
                CreateServerSheet { await load() }
            }
        }
    }

    private func load() async {
        do {
            servers = try await DatabaseService.myServers()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

private struct ServerRow: View {
    let server: Server
    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: server.iconUrl, name: server.name, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(server.name).font(.headline).foregroundStyle(Brand.textPrimary)
                if let desc = server.description, !desc.isEmpty {
                    Text(desc).font(.caption).foregroundStyle(Brand.textMuted).lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct ChannelListView: View {
    let server: Server
    var onChanged: () async -> Void = {}

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var channels: [Channel] = []
    @State private var loading = true
    @State private var showInvite = false
    @State private var showSettings = false
    @State private var showLeaveConfirm = false

    private var textChannels: [Channel] { channels.filter { $0.type == .text } }
    private var voiceChannels: [Channel] { channels.filter { $0.type == .voice } }
    private var isOwner: Bool { server.ownerId == app.currentUserId }

    var body: some View {
        Group {
            if loading {
                StateView(kind: .loading)
            } else {
                List {
                    if !textChannels.isEmpty {
                        Section("Text Channels") {
                            ForEach(textChannels) { channel in
                                NavigationLink {
                                    ChatView(source: .channel(id: channel.id, name: channel.name))
                                } label: {
                                    Label("#  \(channel.name)", systemImage: "number")
                                        .foregroundStyle(Brand.textSecondary)
                                }
                                .listRowBackground(Brand.surface)
                            }
                        }
                    }
                    if !voiceChannels.isEmpty {
                        Section("Voice Channels") {
                            ForEach(voiceChannels) { channel in
                                NavigationLink {
                                    VoiceChannelView(channel: channel)
                                } label: {
                                    Label(channel.name, systemImage: "speaker.wave.2.fill")
                                        .foregroundStyle(Brand.textSecondary)
                                }
                                .listRowBackground(Brand.surface)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Brand.background)
        .navigationTitle(server.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showInvite = true } label: { Label("Invite People", systemImage: "person.badge.plus") }
                    NavigationLink { ServerMembersView(server: server) } label: { Label("Members", systemImage: "person.2") }
                    if isOwner {
                        Button { showSettings = true } label: { Label("Server Settings", systemImage: "gearshape") }
                    }
                    Divider()
                    if !isOwner {
                        Button(role: .destructive) { showLeaveConfirm = true } label: {
                            Label("Leave Server", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .sheet(isPresented: $showInvite) { InviteSheet(server: server) }
        .sheet(isPresented: $showSettings) { ServerSettingsSheet(server: server) { await onChanged() } }
        .confirmationDialog("Leave \(server.name)?", isPresented: $showLeaveConfirm, titleVisibility: .visible) {
            Button("Leave Server", role: .destructive) { leave() }
        }
        .task { await load() }
    }

    private func load() async {
        channels = (try? await DatabaseService.channels(serverId: server.id)) ?? []
        loading = false
    }

    private func leave() {
        guard let uid = app.currentUserId else { return }
        Task {
            try? await DatabaseService.leaveServer(serverId: server.id, userId: uid)
            await onChanged()
            dismiss()
        }
    }
}
