import SwiftUI

/// Direct messages and group chats, interleaved by recency.
struct InboxPanel: View {
    @Environment(AppState.self) private var app
    @Environment(DmUnreadStore.self) private var unreadStore
    @Environment(PresenceService.self) private var presence
    @Environment(DirectMessagesViewModel.self) private var vm
    @Environment(VoiceSession.self) private var voice
    @Environment(ShellChrome.self) private var chrome

    @State private var filter: Filter = .all

    enum Filter: String, CaseIterable, Identifiable {
        case all = "All", unread = "Unread", groups = "Groups"
        var id: String { rawValue }
    }

    private enum Item: Identifiable {
        case dm(DmThread)
        case group(GroupChat)
        var id: String {
            switch self {
            case .dm(let t): return "dm:\(t.id)"
            case .group(let g): return "group:\(g.id)"
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                filterBar
                if vm.loading {
                    ProgressView().tint(Brand.accent)
                        .frame(maxWidth: .infinity).padding(.top, 60)
                } else if items.isEmpty {
                    emptyState
                } else {
                    LazyVStack(spacing: 2) {
                        ForEach(items) { item in row(item) }
                    }
                    .padding(.horizontal, 8)
                }
            }
            .padding(.bottom, 110)
        }
        .scrollIndicators(.hidden)
        .refreshable { await vm.start(currentUserId: app.currentUserId, unread: unreadStore) }
        .task { await vm.start(currentUserId: app.currentUserId, unread: unreadStore) }
    }

    private var header: some View {
        HStack {
            Text("Messages")
                .font(.title2.weight(.bold))
                .foregroundStyle(Brand.textPrimary)
            Spacer()
            Button {
                chrome.destination = .friends
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Brand.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(Brand.elevated, in: Circle())
            }
            .accessibilityLabel("New message")
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    private var filterBar: some View {
        HStack(spacing: 6) {
            ForEach(Filter.allCases) { option in
                Button {
                    withAnimation(.snappy(duration: 0.2)) { filter = option }
                } label: {
                    Text(option.rawValue)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(filter == option ? Color.white : Brand.textSecondary)
                        .padding(.horizontal, 14)
                        .frame(height: 32)
                        .background(filter == option ? Brand.accent : Brand.elevated, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: filter == .unread ? "checkmark.bubble" : "bubble.left.and.bubble.right")
                .font(.system(size: 34))
                .foregroundStyle(Brand.textMuted)
            Text(filter == .unread ? "You're all caught up." : "No conversations yet.")
                .font(.headline).foregroundStyle(Brand.textPrimary)
            if filter != .unread {
                Text("Start one from Friends.")
                    .font(.subheadline).foregroundStyle(Brand.textMuted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 70)
    }

    // MARK: - Items

    private var items: [Item] {
        var result: [(Item, Date, Bool)] = []
        if filter != .groups {
            for thread in vm.threads {
                result.append((.dm(thread), DirectMessagesViewModel.recency(thread),
                               unreadStore.count(for: thread.id) > 0))
            }
        }
        for group in vm.groups {
            let date = RelativeTime.date(from: group.createdAt) ?? .distantPast
            result.append((.group(group), date, unreadStore.countGroup(for: group.id) > 0))
        }
        if filter == .unread { result = result.filter(\.2) }
        return result
            .sorted { lhs, rhs in lhs.2 != rhs.2 ? lhs.2 : lhs.1 > rhs.1 }
            .map(\.0)
    }

    @ViewBuilder private func row(_ item: Item) -> some View {
        switch item {
        case .dm(let thread):
            NavigationLink(value: SpacesRoute.chat(
                .dm(threadId: thread.id, title: thread.friend?.name ?? "Direct Message"),
                callPeer: thread.friend, canModerate: false)
            ) {
                ConversationRow(
                    iconUrl: thread.friend?.avatarUrl,
                    name: thread.friend?.name ?? "Unknown",
                    status: thread.friend.map { presence.status(for: $0.id) },
                    preview: DirectMessagesViewModel.preview(for: thread),
                    time: RelativeTime.compact(thread.lastMessageAt ?? thread.createdAt),
                    unread: unreadStore.count(for: thread.id)
                )
                .padding(.horizontal, 8)
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(ChannelRowStyle())
        case .group(let group):
            NavigationLink(value: SpacesRoute.chat(.group(id: group.id, name: group.name),
                                                   callPeer: nil, canModerate: false)) {
                ConversationRow(
                    iconUrl: group.iconUrl,
                    name: group.name,
                    subtitle: voice.isIn(group.id) ? "In a call" : "\(group.members?.count ?? 0) members",
                    unread: unreadStore.countGroup(for: group.id)
                )
                .padding(.horizontal, 8)
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(ChannelRowStyle(highlighted: voice.isIn(group.id)))
            .contextMenu {
                Button(role: .destructive) {
                    Task { await vm.leaveGroup(group.id) }
                } label: {
                    Label("Leave Group", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
    }
}
