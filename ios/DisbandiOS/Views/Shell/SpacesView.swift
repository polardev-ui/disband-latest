import SwiftUI

/// Home: the rail of spaces on the left, and a raised panel beside it showing
/// either the inbox or the selected server's channels. Conversations push
/// over the whole thing at full width.
struct SpacesView: View {
    @Environment(AppState.self) private var app
    @Environment(DmUnreadStore.self) private var unreadStore
    @Environment(DirectMessagesViewModel.self) private var vm
    @Environment(VoiceSession.self) private var voice
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var servers: [Server] = []
    @State private var selection: SpaceSelection = .inbox
    @State private var path = NavigationPath()
    @State private var showJoin = false
    @State private var showCreate = false
    @State private var showDiscover = false

    private var router: NotificationRouter { NotificationRouter.shared }

    @AppStorage("disband.lastSpace") private var lastSpace = ""

    var body: some View {
        Group {
            if sizeClass == .regular { splitLayout } else { stackLayout }
        }
        .task { await loadServers() }
        .task(id: app.currentUserId) {
            if app.currentUserId == nil { ChannelUnreadStore.shared.reset() } else { ChannelUnreadStore.shared.start() }
        }
        // A tapped notification lands here: this view owns the navigation
        // path, so it is the only place that can actually open the thing the
        // notification was about.
        .onChange(of: router.target) { _, _ in openPendingNotification() }
        .onAppear { openPendingNotification() }
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

    /// iPhone, and iPad in a narrow window: conversations push over
    /// everything at full width.
    private var stackLayout: some View {
        NavigationStack(path: $path) {
            HStack(spacing: 0) {
                rail
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
            .navigationDestination(for: SpacesRoute.self, destination: destination)
        }
    }

    /// iPad: rail and channels stay on the left and the conversation opens
    /// beside them, so moving between channels is one tap rather than back
    /// and forward through full-screen pushes.
    private var splitLayout: some View {
        // Apple's split container rather than a hand-built HStack: a bare
        // NavigationStack laid beside the list left its UIKit host on top of
        // the dock and, until the window first resized, swallowed every tap.
        NavigationSplitView(columnVisibility: .constant(.all)) {
            HStack(spacing: 0) {
                rail
                panel
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Brand.surface)
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, style: .continuous))
                    .ignoresSafeArea(edges: .bottom)
            }
            .background(Brand.background)
            .environment(\.openSpacesRoute) { route in
                // Replace the open conversation in one step, without the
                // push animation, so picking another chat never needs Back.
                var swap = Transaction()
                swap.disablesAnimations = true
                withTransaction(swap) {
                    var next = NavigationPath()
                    next.append(route)
                    path = next
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .toolbar(removing: .sidebarToggle)
            .navigationSplitViewColumnWidth(420)
        } detail: {
            NavigationStack(path: $path) {
                ContentUnavailableView("Pick a conversation", systemImage: "bubble.left.and.bubble.right",
                                       description: Text("Choose a channel or a direct message to start chatting."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Brand.background)
                    .toolbar(.hidden, for: .navigationBar)
                    .navigationDestination(for: SpacesRoute.self) { route in
                        // A fresh view per conversation, so switching never
                        // keeps the last chat's state.
                        destination(route).id(route)
                    }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .background(Brand.background)
    }

    private var rail: some View {
        ServerRail(
            servers: servers,
            selection: $selection,
            inboxUnread: inboxUnread,
            unreadConversations: unreadConversations,
            voiceServerId: voiceServerId,
            unreadServerIds: ChannelUnreadStore.shared.unreadServers,
            onJoin: { showJoin = true },
            onCreate: { showCreate = true },
            onDiscover: { showDiscover = true }
        )
    }

    @ViewBuilder private func destination(_ route: SpacesRoute) -> some View {
        switch route {
        case .chat(let source, let peer, let canModerate, let lockedReason):
            ChatView(source: source, callPeer: peer, canModerate: canModerate,
                     composerLockedReason: lockedReason)
        case .members(let server):
            ServerMembersView(server: server)
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

    private var unreadConversations: [RailConversation] {
        let dms = vm.threads.compactMap { thread -> RailConversation? in
            let count = unreadStore.count(for: thread.id)
            guard count > 0, let friend = thread.friend else { return nil }
            return RailConversation(id: thread.id, name: friend.name, avatarUrl: friend.avatarUrl, unread: count) {
                path = NavigationPath()
                path.append(SpacesRoute.chat(.dm(threadId: thread.id, title: friend.name),
                                             callPeer: friend, canModerate: false))
            }
        }
        let groups = vm.groups.compactMap { group -> RailConversation? in
            let count = unreadStore.countGroup(for: group.id)
            guard count > 0 else { return nil }
            return RailConversation(id: group.id, name: group.name, avatarUrl: group.iconUrl, unread: count) {
                path = NavigationPath()
                path.append(SpacesRoute.chat(.group(id: group.id, name: group.name),
                                             callPeer: nil, canModerate: false))
            }
        }
        return Array((dms + groups).prefix(8))
    }

    private var voiceServerId: String? {
        if case .channel(_, _, let serverId, _, _) = voice.room { return serverId }
        return nil
    }

    /**
     Open whatever a tapped notification pointed at.

     The path is reset first. Tapping a notification while already reading a
     different conversation would otherwise stack one chat on top of another,
     and backing out would walk through screens the reader never chose to
     visit.

     A DM's title comes from the cached thread list when it is there and falls
     back to a neutral one when it is not — a notification can arrive for a
     conversation this device has never listed, and waiting on a name before
     opening the chat would be a worse trade than a plain title for a moment.
     */
    private func openPendingNotification() {
        guard let target = router.take() else { return }

        path = NavigationPath()

        switch target {
        case .dm(let threadId):
            selection = .inbox
            let title = vm.threads.first { $0.id == threadId }?.friend?.name ?? "Direct Message"
            let peer = vm.threads.first { $0.id == threadId }?.friend
            path.append(SpacesRoute.chat(.dm(threadId: threadId, title: title),
                                         callPeer: peer, canModerate: false))

        case .group(let id, let name):
            selection = .inbox
            path.append(SpacesRoute.chat(.group(id: id, name: name),
                                         callPeer: nil, canModerate: false))

        case .channel(let serverId, let channelId, let name):
            // Switching the rail to the server first means backing out of the
            // channel leaves you in that space, which is where you were sent.
            selection = .server(serverId)
            path.append(SpacesRoute.chat(.channel(id: channelId, name: name),
                                         callPeer: nil, canModerate: false))

        case .friends:
            // Not this view's to handle; the shell moves tabs for it.
            break
        }
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
