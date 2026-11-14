import SwiftUI

/// Direct messages and group chats, interleaved by recency.
struct InboxPanel: View {
    @Environment(AppState.self) private var app
    @Environment(DmUnreadStore.self) private var unreadStore
    @Environment(PresenceService.self) private var presence
    @Environment(ClosedDmStore.self) private var closedDms
    @Environment(DirectMessagesViewModel.self) private var vm
    @Environment(VoiceSession.self) private var voice
    @Environment(ShellChrome.self) private var chrome

    @State private var pins = PinnedConversationStore.shared
    @State private var filter: Filter = .all
    /// Typed into the search box: narrows the list to matching names.
    @State private var query = ""
    @FocusState private var searching: Bool
    @Namespace private var filterPill

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
                searchField
                filterBar
                if showsActiveNow { activeNow }
                if vm.loading {
                    SkeletonRows(count: 9)
                        .padding(.horizontal, 24)
                        .padding(.top, 6)
                } else if items.isEmpty {
                    emptyState
                } else {
                    LazyVStack(spacing: 2) {
                        ForEach(items) { item in row(item) }
                    }
                    .padding(.horizontal, 8)
                }
            }
            .padding(.bottom, 16)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .animation(Motion.settle, value: showsActiveNow)
        .refreshable { await vm.start(currentUserId: app.currentUserId, unread: unreadStore, closed: closedDms) }
        .task { await vm.start(currentUserId: app.currentUserId, unread: unreadStore, closed: closedDms) }
        .task(id: app.currentUserId) { await pins.load(currentUserId: app.currentUserId) }
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

    /// Find a conversation by name without scrolling for it.
    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.textMuted)
            TextField("Search conversations", text: $query)
                .font(.system(size: 15))
                .foregroundStyle(Brand.textPrimary)
                .focused($searching)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
            if !query.isEmpty {
                Button {
                    query = ""
                    Haptics.select()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Brand.textMuted)
                }
                .transition(.scale.combined(with: .opacity))
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(Brand.elevated, in: .rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12)
            .strokeBorder(searching ? Brand.accent.opacity(0.7) : Color.white.opacity(0.05), lineWidth: 1))
        .animation(Motion.quick, value: searching)
        .animation(Motion.quick, value: query.isEmpty)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private var filterBar: some View {
        HStack(spacing: 6) {
            ForEach(Filter.allCases) { option in
                Button {
                    Haptics.select()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) { filter = option }
                } label: {
                    Text(option.rawValue)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(filter == option ? Color.white : Brand.textSecondary)
                        .padding(.horizontal, 14)
                        .frame(height: 32)
                        .background {
                            // One highlight that slides between the chips.
                            if filter == option {
                                Capsule().fill(Brand.accent).matchedGeometryEffect(id: "pill", in: filterPill)
                            } else {
                                Capsule().fill(Brand.elevated)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    // MARK: - Active now

    /// Friends you talk to who are online right now.
    private var onlineFriends: [DmThread] {
        vm.threads.filter { thread in
            guard let friend = thread.friend, !closedDms.isClosed(friend.id), friend.isBot != true else { return false }
            return presence.status(for: friend.id) != .offline
        }
    }

    private var showsActiveNow: Bool {
        filter == .all && query.isEmpty && !vm.loading && !onlineFriends.isEmpty
    }

    /// A strip of who's around, one tap from their DM.
    private var activeNow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ACTIVE NOW")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.6)
                .foregroundStyle(Brand.textMuted)
                .padding(.horizontal, 16)
            ScrollView(.horizontal) {
                HStack(spacing: 14) {
                    ForEach(onlineFriends.prefix(20)) { thread in
                        if let friend = thread.friend {
                            RouteLink(value: SpacesRoute.chat(
                                .dm(threadId: thread.id, title: friend.name),
                                callPeer: friend, canModerate: false)
                            ) {
                                VStack(spacing: 5) {
                                    AvatarView(url: friend.avatarUrl, name: friend.name, size: 52,
                                               status: presence.status(for: friend.id))
                                    // Their own name style, as in the list
                                    // below: some names only draw in the
                                    // font their owner picked.
                                    StyledName(friend, size: 11, weight: .medium,
                                               fallbackColor: Brand.textSecondary)
                                        .lineLimit(1)
                                        .frame(width: 60, height: 14)
                                }
                            }
                            .buttonStyle(PressScaleStyle(scale: 0.93))
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.bottom, 12)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: filter == .unread ? "checkmark.bubble" : "bubble.left.and.bubble.right")
                .font(.system(size: 34))
                .foregroundStyle(Brand.textMuted)
            Text(!query.isEmpty ? "No one matches \u{201C}\(query)\u{201D}."
                 : filter == .unread ? "You're all caught up." : "No conversations yet.")
                .font(.headline).foregroundStyle(Brand.textPrimary)
                .multilineTextAlignment(.center)
            if filter != .unread, query.isEmpty {
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
            for thread in vm.threads where !closedDms.isClosed(thread.friend?.id) {
                result.append((.dm(thread), DirectMessagesViewModel.recency(thread),
                               unreadStore.count(for: thread.id) > 0))
            }
        }
        for group in vm.groups {
            let date = RelativeTime.date(from: group.createdAt) ?? .distantPast
            result.append((.group(group), date, unreadStore.countGroup(for: group.id) > 0))
        }
        if filter == .unread { result = result.filter(\.2) }
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        if !needle.isEmpty {
            result = result.filter { entry in
                switch entry.0 {
                case .dm(let thread):
                    return (thread.friend?.name.lowercased().contains(needle) ?? false)
                        || (thread.friend?.username?.lowercased().contains(needle) ?? false)
                case .group(let group):
                    return group.name.lowercased().contains(needle)
                }
            }
        }
        // Pinned first (most recently pinned on top), then unread, then the
        // rest by latest activity.
        func pinDate(_ item: Item) -> Date? {
            switch item {
            case .dm(let t): return pins.pinnedAt(.dm, t.id)
            case .group(let g): return pins.pinnedAt(.group, g.id)
            }
        }
        return result
            .sorted { lhs, rhs in
                let lp = pinDate(lhs.0), rp = pinDate(rhs.0)
                if lp != nil || rp != nil {
                    guard let lp else { return false }
                    guard let rp else { return true }
                    return lp > rp
                }
                return lhs.2 != rhs.2 ? lhs.2 : lhs.1 > rhs.1
            }
            .map(\.0)
    }

    @ViewBuilder private func row(_ item: Item) -> some View {
        switch item {
        case .dm(let thread):
            RouteLink(value: SpacesRoute.chat(
                .dm(threadId: thread.id, title: thread.friend?.name ?? "Direct Message"),
                callPeer: thread.friend, canModerate: false)
            ) {
                ConversationRow(
                    iconUrl: thread.friend?.avatarUrl,
                    name: thread.friend?.name ?? "Unknown",
                    userId: thread.friend?.id,
                    status: thread.friend.map { presence.status(for: $0.id) },
                    preview: DirectMessagesViewModel.preview(for: thread),
                    time: RelativeTime.compact(thread.lastMessageAt ?? thread.createdAt),
                    unread: unreadStore.count(for: thread.id),
                    nameStyle: thread.friend.map { NameStyle($0) },
                    pinned: pins.pinnedAt(.dm, thread.id) != nil
                )
                .padding(.horizontal, 8)
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(ChannelRowStyle())
            .contextMenu {
                pinButton(.dm, thread.id)
                if let friendId = thread.friend?.id {
                    Button(role: .destructive) {
                        closedDms.close(friendId)
                    } label: {
                        Label("Close DM", systemImage: "xmark")
                    }
                }
            }
        case .group(let group):
            RouteLink(value: SpacesRoute.chat(.group(id: group.id, name: group.name),
                                                   callPeer: nil, canModerate: false)) {
                ConversationRow(
                    iconUrl: group.iconUrl,
                    name: group.name,
                    subtitle: voice.isIn(group.id) ? "In a call" : "\(group.members?.count ?? 0) members",
                    unread: unreadStore.countGroup(for: group.id),
                    pinned: pins.pinnedAt(.group, group.id) != nil
                )
                .padding(.horizontal, 8)
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(ChannelRowStyle(highlighted: voice.isIn(group.id)))
            .contextMenu {
                pinButton(.group, group.id)
                Button(role: .destructive) {
                    Task { await vm.leaveGroup(group.id) }
                } label: {
                    Label("Leave Group", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
    }

    @ViewBuilder private func pinButton(_ kind: PinnedConversationStore.Kind, _ id: String) -> some View {
        let pinned = pins.pinnedAt(kind, id) != nil
        Button {
            Haptics.select()
            withAnimation(Motion.settle) { pins.toggle(kind, id) }
        } label: {
            Label(pinned ? "Unpin" : "Pin to Top", systemImage: pinned ? "pin.slash" : "pin")
        }
    }
}
