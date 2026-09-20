import SwiftUI

/// Home: the rail of spaces on the left, and a raised panel beside it showing
/// either the inbox or the selected server's channels. Conversations push
/// over the whole thing at full width.
struct SpacesView: View {
    @Environment(AppState.self) private var app
    @Environment(DmUnreadStore.self) private var unreadStore
    @Environment(DirectMessagesViewModel.self) private var vm
    @Environment(VoiceSession.self) private var voice

    @State private var servers: [Server] = []
    @State private var selection: SpaceSelection = .inbox
    @State private var path = NavigationPath()
    @State private var showJoin = false
    @State private var showCreate = false
    @State private var showDiscover = false

    @AppStorage("disband.lastSpace") private var lastSpace = ""

    var body: some View {
        NavigationStack(path: $path) {
            HStack(spacing: 0) {
                ServerRail(
                    servers: servers,
                    selection: $selection,
                    inboxUnread: inboxUnread,
                    voiceServerId: voiceServerId,
                    onJoin: { showJoin = true },
                    onCreate: { showCreate = true },
                    onDiscover: { showDiscover = true }
                )

                panel
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Brand.surface)
                    // The panel is a card laid over the rail, rounded only on
                    // its leading top corner — the one detail that tells you
                    // it slides independently of the rail.
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, style: .continuous))
                    .ignoresSafeArea(edges: .bottom)
            }
            .background(Brand.background)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: SpacesRoute.self) { route in
                switch route {
                case .chat(let source, let peer, let canModerate, let lockedReason):
                    ChatView(source: source, callPeer: peer, canModerate: canModerate,
                             composerLockedReason: lockedReason)
                case .members(let server):
                    ServerMembersView(server: server)
                }
            }
        }
        .task { await loadServers() }
        .onChange(of: selection) { _, next in
            if case .server(let id) = next { lastSpace = id } else { lastSpace = "" }
        }
        .sheet(isPresented: $showJoin) { JoinServerSheet { await loadServers() } }
        .sheet(isPresented: $showCreate) { CreateServerSheet { await loadServers() } }
        .sheet(isPresented: $showDiscover) {
            DiscoverServersSheet(joinedIds: Set(servers.map(\.id)),
                                 onOpen: { selection = .server($0) }) { await loadServers() }
        }
    }

    @ViewBuilder private var panel: some View {
        switch selection {
        case .inbox:
            InboxPanel()
                .transition(.opacity)
        case .server(let id):
            if let server = servers.first(where: { $0.id == id }) {
                ChannelPanel(server: server,
                             onChanged: { await loadServers() },
                             onLeft: { selection = .inbox })
                    .id(server.id)
                    .transition(.opacity)
            } else {
                InboxPanel()
            }
        }
    }

    private var inboxUnread: Int {
        vm.threads.reduce(0) { $0 + unreadStore.count(for: $1.id) }
            + vm.groups.reduce(0) { $0 + unreadStore.countGroup(for: $1.id) }
    }

    private var voiceServerId: String? {
        if case .channel(_, _, let serverId, _, _) = voice.room { return serverId }
        return nil
    }

    private func loadServers() async {
        guard let uid = app.currentUserId else { return }
        servers = (try? await DatabaseService.myServers(currentUserId: uid)) ?? servers
        // Reopen where you left off, once, if that space still exists.
        if selection == .inbox, !lastSpace.isEmpty, servers.contains(where: { $0.id == lastSpace }) {
            selection = .server(lastSpace)
        }
        if case .server(let id) = selection, !servers.contains(where: { $0.id == id }) {
            selection = .inbox
        }
    }
}
