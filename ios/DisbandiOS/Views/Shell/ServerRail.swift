import SwiftUI

/// What the Home panel is showing: the inbox, or one server.
enum SpaceSelection: Hashable {
    case inbox
    case server(String)
}

/// A DM or group with unread messages, shown on the rail like the desktop.
struct RailConversation: Identifiable {
    let id: String
    let name: String
    let avatarUrl: String?
    let unread: Int
    let open: () -> Void
}

/// The vertical strip of spaces on Home's left edge — the same model as the
/// desktop rail. Inbox on top, then servers, then create / discover.
struct ServerRail: View {
    let servers: [Server]
    @Binding var selection: SpaceSelection
    var inboxUnread: Int
    /// Conversations with new messages, under the inbox button.
    var unreadConversations: [RailConversation] = []
    /// The server whose voice channel you're connected to, if any.
    var voiceServerId: String?
    /// Servers with a channel you haven't read: the small white pill.
    var unreadServerIds: Set<String> = []
    /// Unread mentions per space: the red count, as on desktop.
    var serverMentions: [String: Int] = [:]
    var onJoin: () -> Void
    var onCreate: () -> Void
    var onDiscover: () -> Void

    /// Live Catalysts per space, for the level seal in each icon's corner.
    @State private var catalysts: [String: Int] = [:]
    /// Folders and the order of spaces, as arranged on the desktop.
    @State private var folders: [ServerFolders.Folder] = []
    @State private var listState: [ServerFolders.Slot] = []
    @State private var openFolders: Set<String> = []

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                railButton(selected: selection == .inbox, label: "Messages") {
                    selection = .inbox
                } icon: {
                    ZStack {
                        Rectangle().fill(Brand.accent.gradient)
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                } badge: {
                    UnreadDot(count: inboxUnread)
                }

                // Each conversation with something new, as its own picture,
                // one tap from opening it — as on desktop.
                ForEach(unreadConversations) { convo in
                    railButton(selected: false, label: "\(convo.name), \(convo.unread) unread") {
                        convo.open()
                    } icon: {
                        RemoteImage(url: convo.avatarUrl, contentMode: .fill) {
                            ZStack {
                                Color(seed: convo.id)
                                Text(Self.initials(convo.name))
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }
                    } badge: {
                        UnreadDot(count: convo.unread)
                    }
                    .transition(.scale.combined(with: .opacity))
                }

                Capsule()
                    .fill(Brand.divider)
                    .frame(width: 26, height: 2)
                    .padding(.vertical, 2)

                ForEach(layout.top) { server in serverButton(server) }
                ForEach(layout.folders, id: \.folder.id) { entry in
                    folderView(entry.folder, entry.servers)
                }

                Menu {
                    Button(action: onJoin) { Label("Join with Invite", systemImage: "link") }
                    Button(action: onCreate) { Label("Create a Space", systemImage: "plus") }
                } label: {
                    utilityIcon("plus", tint: Brand.online)
                }
                .accessibilityLabel("Add a space")

                Button(action: onDiscover) { utilityIcon("safari.fill", tint: Brand.accent) }
                    .accessibilityLabel("Discover spaces")
            }
            .padding(.vertical, 12)
            .animation(.snappy, value: unreadConversations.map(\.id))
            // Room for the floating dock to sit over the end of the list.
            .padding(.bottom, 90)
        }
        .frame(width: 72)
        .task(id: servers.map(\.id)) {
            if let loaded = await ServerFolders.load() {
                folders = loaded.folders
                listState = loaded.slots
            }
        }
        .task(id: servers.map(\.id)) {
            if let counts = try? await DatabaseService.catalystCounts(serverIds: servers.map(\.id)) {
                catalysts = counts
            }
        }
    }

    @ViewBuilder private func serverButton(_ server: Server) -> some View {
        let isSelected = selection == .server(server.id)
        let pings = serverMentions[server.id] ?? 0
        railButton(selected: isSelected, unread: unreadServerIds.contains(server.id),
                   label: pings > 0 ? "\(server.name), \(pings) mention\(pings == 1 ? "" : "s")"
                       : unreadServerIds.contains(server.id) ? "\(server.name), unread messages" : server.name) {
            selection = .server(server.id)
        } icon: {
            RemoteImage(url: AppConfig.iconThumb(server.iconUrl), contentMode: .fill) {
                ZStack {
                    Color(seed: server.id)
                    Text(Self.initials(server.name))
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
        } badge: {
            if voiceServerId == server.id {
                Image(systemName: "speaker.wave.2.fill")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 18, height: 18)
                    .background(Brand.online, in: Circle())
                    .overlay(Circle().stroke(Brand.background, lineWidth: 2.5))
                    .offset(x: 3, y: 3)
            } else if pings > 0 {
                UnreadDot(count: pings)
            } else if let kind = ServerBadgeKind.of(verified: server.verified, partner: server.partner,
                                                    catalysts: catalysts[server.id] ?? 0) {
                // The same seal the desktop shows beside a space's
                // name: Verified, Partner, or its Catalyst level.
                ServerBadgeView(kind: kind, size: 16)
                    .background(Circle().fill(Brand.background).padding(-2))
                    .offset(x: 3, y: 3)
            }
        }
        .contextMenu {
            // The web's "Mark as read": every channel and every
            // ping in the space, on every device.
            Button {
                ChannelUnreadStore.shared.markServerRead(server.id)
            } label: {
                Label("Mark as Read", systemImage: "checkmark.message")
            }
            .disabled(pings == 0 && !unreadServerIds.contains(server.id))
        }
    }

    // MARK: - Folders

    private var layout: ServerFolders.Layout {
        ServerFolders.layout(servers: servers, folders: folders, states: listState)
    }

    /// A folder as the desktop draws it: a tinted tile of its first four
    /// spaces, opening in place to list them. Pings and unread roll up to it.
    @ViewBuilder private func folderView(_ folder: ServerFolders.Folder, _ members: [Server]) -> some View {
        let open = openFolders.contains(folder.id)
        let tint = Color(hexString: Optional(folder.color)) ?? Brand.accent
        let pings = members.reduce(0) { $0 + (serverMentions[$1.id] ?? 0) }
        let unread = members.contains { unreadServerIds.contains($0.id) }
        VStack(spacing: 8) {
            railButton(selected: false, unread: unread && !open,
                       label: "\(folder.name) folder, \(members.count) spaces\(open ? ", open" : "")") {
                withAnimation(.snappy) {
                    if open { openFolders.remove(folder.id) } else { openFolders.insert(folder.id) }
                }
            } icon: {
                ZStack {
                    tint.opacity(0.35)
                    if open {
                        Image(systemName: "folder.fill")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(tint)
                    } else {
                        LazyVGrid(columns: [GridItem(.fixed(18), spacing: 3), GridItem(.fixed(18), spacing: 3)],
                                  spacing: 3) {
                            ForEach(members.prefix(4)) { server in
                                RemoteImage(url: AppConfig.iconThumb(server.iconUrl), contentMode: .fill) {
                                    Color(seed: server.id)
                                }
                                .frame(width: 18, height: 18)
                                .clipShape(Circle())
                            }
                        }
                    }
                }
            } badge: {
                if !open, pings > 0 { UnreadDot(count: pings) }
            }
            if open {
                ForEach(members) { server in serverButton(server) }
            }
        }
        .padding(.vertical, open ? 6 : 0)
        .background {
            if open {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(tint.opacity(0.12))
                    .padding(.horizontal, 8)
            }
        }
    }

    private func railButton<Icon: View, Badge: View>(
        selected: Bool,
        unread: Bool = false,
        label: String,
        action: @escaping () -> Void,
        @ViewBuilder icon: () -> Icon,
        @ViewBuilder badge: () -> Badge
    ) -> some View {
        Button {
            UISelectionFeedbackGenerator().selectionChanged()
            action()
        } label: {
            icon()
                .frame(width: 48, height: 48)
                // Squircle when selected, circle otherwise — the same morph
                // the desktop rail uses.
                .clipShape(RoundedRectangle(cornerRadius: selected ? 16 : 24, style: .continuous))
                .overlay(alignment: .bottomTrailing) { badge() }
                .frame(maxWidth: .infinity)
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(Color.white)
                        .frame(width: 4, height: selected ? 38 : (unread ? 8 : 0))
                        .offset(x: -2)
                }
                .animation(.snappy(duration: 0.25), value: selected)
                .animation(.snappy(duration: 0.25), value: unread)
        }
        .buttonStyle(RailPressStyle())
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func utilityIcon(_ symbol: String, tint: Color) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 19, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 48, height: 48)
            .background(Brand.surface, in: Circle())
    }

    static func initials(_ name: String) -> String {
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap(\.first).map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }
}

private struct RailPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

struct UnreadDot: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text(count > 99 ? "99+" : "\(count)")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 5)
                .frame(minWidth: 20, minHeight: 20)
                .background(Brand.dnd, in: Capsule())
                .overlay(Capsule().stroke(Brand.background, lineWidth: 3))
                .offset(x: 5, y: 5)
        }
    }
}
