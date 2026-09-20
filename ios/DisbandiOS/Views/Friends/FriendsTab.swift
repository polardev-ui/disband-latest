import SwiftUI

struct FriendsTab: View {
    @Environment(AppState.self) private var app
    @Environment(PresenceService.self) private var presence
    @State private var friendships: [Friendship] = []
    @State private var loading = true
    @State private var showAdd = false
    @State private var openChat: ChatSource?
    @State private var selectedProfile: Profile?
    @State private var query = ""
    @State private var sort: FriendSort = .nameAsc
    @State private var filter: FriendFilter = .online

    private var uid: String { app.currentUserId ?? "" }

    private var accepted: [Friendship] { friendships.filter { $0.status == .accepted } }
    private var incoming: [Friendship] {
        friendships.filter { $0.status == .pending && $0.addresseeId == uid }
    }
    private var outgoing: [Friendship] {
        friendships.filter { $0.status == .pending && $0.requesterId == uid }
    }

    private func isOnline(_ f: Friendship) -> Bool {
        guard let id = counterparty(f)?.id else { return false }
        return presence.status(for: id) != .offline
    }

    /// Friends after the filter, search and sort.
    ///
    /// Whichever sort is active, friendships accepted in the last 24 hours are
    /// pinned to the top of A–Z: a friend you just added should be findable
    /// without scrolling.
    private var visibleFriends: [Friendship] {
        let base = filter == .online ? accepted.filter(isOnline) : accepted
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let matched = needle.isEmpty ? base : base.filter { f in
            let p = counterparty(f)
            return (p?.name ?? "").lowercased().contains(needle)
                || (p?.handle ?? "").lowercased().contains(needle)
        }

        let sorted = matched.sorted { lhs, rhs in
            switch sort {
            case .nameAsc: return sortName(lhs) < sortName(rhs)
            case .recentlyAdded: return addedAt(lhs) > addedAt(rhs)
            case .oldestFirst: return addedAt(lhs) < addedAt(rhs)
            }
        }

        guard sort == .nameAsc else { return sorted }
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        let fresh = sorted.filter { addedAt($0) > cutoff }
        guard !fresh.isEmpty else { return sorted }
        let freshIds = Set(fresh.map(\.id))
        return fresh.sorted { addedAt($0) > addedAt($1) } + sorted.filter { !freshIds.contains($0.id) }
    }

    private func sortName(_ f: Friendship) -> String {
        (counterparty(f)?.name ?? "\u{10FFFF}").lowercased()
    }

    private func addedAt(_ f: Friendship) -> Date {
        RelativeTime.date(from: f.createdAt) ?? .distantPast
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ScreenHeader("Friends", subtitle: subtitle) {
                        HStack(spacing: 8) {
                            Menu {
                                Picker("Sort", selection: $sort) {
                                    ForEach(FriendSort.allCases) { option in
                                        Label(option.label, systemImage: option.icon).tag(option)
                                    }
                                }
                            } label: {
                                HeaderIconLabel(symbol: "arrow.up.arrow.down")
                            }
                            .accessibilityLabel("Sort friends")
                            Button { showAdd = true } label: {
                                Label("Add", systemImage: "person.fill.badge.plus")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 14)
                                    .frame(height: 40)
                                    .background(Brand.accent.gradient, in: Capsule())
                            }
                        }
                    }

                    CapsuleFilterBar(options: FriendFilter.allCases, selection: $filter,
                                     title: { $0.title },
                                     badge: { $0 == .pending ? incoming.count : 0 })
                        .padding(.bottom, 10)

                    if filter != .pending {
                        CapsuleSearchField(prompt: "Search friends", text: $query)
                            .padding(.bottom, 14)
                    }

                    if loading {
                        ProgressView().tint(Brand.accent).padding(.top, 60)
                    } else if filter == .pending {
                        pendingContent
                    } else {
                        if filter == .all, query.isEmpty, !onlineStrip.isEmpty { activeNow }
                        friendsList
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .statusBarScrim()
            .background(Brand.background)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $openChat) { ChatView(source: $0) }
            .sheet(item: $selectedProfile) { p in
                ProfileDetailView(profile: p, onStartDM: { startDm(with: $0) })
            }
            .sheet(isPresented: $showAdd) { AddFriendSheet { await load() } }
            .onChange(of: selectedProfile) { _, _ in Task { await load() } }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private var subtitle: String {
        let online = accepted.filter(isOnline).count
        return "\(online) online · \(accepted.count) total"
    }

    // MARK: - Active now

    private var onlineStrip: [Profile] {
        accepted.filter(isOnline).compactMap(counterparty)
    }

    private var activeNow: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionCaption("Active now")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(onlineStrip) { profile in
                        Button { selectedProfile = profile } label: {
                            VStack(spacing: 6) {
                                AvatarView(url: profile.avatarUrl, name: profile.name, size: 58,
                                           status: presence.status(for: profile.id))
                                Text(profile.name)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(Brand.textSecondary)
                                    .lineLimit(1)
                                    .frame(width: 64)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
            .padding(.bottom, 8)
        }
    }

    // MARK: - Lists

    @ViewBuilder private var friendsList: some View {
        if accepted.isEmpty {
            emptyState("No friends yet", detail: "Tap Add to find someone by their exact username.",
                       symbol: "person.2")
        } else if visibleFriends.isEmpty {
            if query.isEmpty {
                emptyState("Nobody's online", detail: "Your friends will show up here when they are.",
                           symbol: "moon.zzz")
            } else {
                emptyState("No matches", detail: "No friends match \u{201C}\(query)\u{201D}.",
                           symbol: "magnifyingglass")
            }
        } else {
            SectionCaption(filter == .online ? "Online — \(visibleFriends.count)" : "All friends — \(visibleFriends.count)")
            SettingsGroup {
                ForEach(Array(visibleFriends.enumerated()), id: \.element.id) { index, f in
                    if index > 0 { SettingsDivider().padding(.leading, 8) }
                    let profile = counterparty(f)
                    Button { selectedProfile = profile } label: {
                        HStack(spacing: 12) {
                            FriendRow(profile: profile, status: liveStatus(profile))
                            Spacer(minLength: 4)
                            Button { startDm(with: profile) } label: {
                                Image(systemName: "bubble.left.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Brand.textPrimary)
                                    .frame(width: 38, height: 38)
                                    .background(Brand.elevated, in: Circle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Message \(profile?.name ?? "friend")")
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private var pendingContent: some View {
        if incoming.isEmpty && outgoing.isEmpty {
            emptyState("No pending requests", detail: "Requests you send or receive wait here.",
                       symbol: "tray")
        }
        if !incoming.isEmpty {
            SectionCaption("Incoming — \(incoming.count)")
            SettingsGroup {
                ForEach(Array(incoming.enumerated()), id: \.element.id) { index, f in
                    if index > 0 { SettingsDivider().padding(.leading, 8) }
                    HStack(spacing: 10) {
                        FriendRow(profile: counterparty(f), status: liveStatus(counterparty(f)))
                        Spacer(minLength: 4)
                        roundAction("xmark", tint: Brand.dnd, label: "Decline") { respond(f, accept: false) }
                        roundAction("checkmark", tint: Brand.online, label: "Accept") { respond(f, accept: true) }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                }
            }
        }
        if !outgoing.isEmpty {
            SectionCaption("Sent — \(outgoing.count)")
            SettingsGroup {
                ForEach(Array(outgoing.enumerated()), id: \.element.id) { index, f in
                    if index > 0 { SettingsDivider().padding(.leading, 8) }
                    HStack {
                        FriendRow(profile: counterparty(f), status: liveStatus(counterparty(f)))
                        Spacer()
                        Text("Waiting")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Brand.textMuted)
                            .padding(.horizontal, 10).frame(height: 26)
                            .background(Brand.elevated, in: Capsule())
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                }
            }
        }
    }

    private func roundAction(_ symbol: String, tint: Color, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(tint, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func emptyState(_ title: String, detail: String, symbol: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 34))
                .foregroundStyle(Brand.textMuted)
            Text(title).font(.headline).foregroundStyle(Brand.textPrimary)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(Brand.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 40)
        .padding(.top, 50)
    }

    // MARK: - Actions

    private func counterparty(_ f: Friendship) -> Profile? {
        f.requesterId == uid ? f.addressee : f.requester
    }

    /// Live presence. Matches the web: offline when they're not actively
    /// connected, never a stale stored status.
    private func liveStatus(_ profile: Profile?) -> UserStatus? {
        guard let profile else { return nil }
        return presence.status(for: profile.id)
    }

    private func respond(_ f: Friendship, accept: Bool) {
        Task {
            try? await DatabaseService.respondToFriendRequest(id: f.id, accept: accept)
            await load()
        }
    }

    private func startDm(with profile: Profile?) {
        guard let profile else { return }
        Task {
            if let threadId = try? await DatabaseService.getOrCreateDmThread(friendId: profile.id) {
                openChat = .dm(threadId: threadId, title: profile.name)
            }
        }
    }

    private func load() async {
        friendships = (try? await DatabaseService.friendships(currentUserId: uid)) ?? []
        loading = false
    }
}

enum FriendFilter: String, CaseIterable, Identifiable {
    case online, all, pending
    var id: String { rawValue }
    var title: String {
        switch self {
        case .online: return "Online"
        case .all: return "All"
        case .pending: return "Pending"
        }
    }
}

/// A person in a list: avatar with presence, name and pronouns, and their
/// custom status when they have one (their handle otherwise).
struct FriendRow: View {
    let profile: Profile?
    /// Live presence, resolved by the caller.
    var status: UserStatus?

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: profile?.avatarUrl, name: profile?.name ?? "?", size: 44, status: status)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(profile?.name ?? "Unknown")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    if let pronouns = profile?.pronouns, !pronouns.isEmpty {
                        Text(pronouns)
                            .font(.caption)
                            .foregroundStyle(Brand.textMuted)
                            .lineLimit(1)
                    }
                }
                if let note = profile?.activeStatusNote {
                    Text(note)
                        .font(.subheadline)
                        .foregroundStyle(Brand.textSecondary)
                        .lineLimit(1)
                } else {
                    Text("@\(profile?.handle ?? "user")")
                        .font(.subheadline)
                        .foregroundStyle(Brand.textMuted)
                        .lineLimit(1)
                }
            }
        }
    }
}

/// Ordering options for the friends list.
enum FriendSort: String, CaseIterable, Identifiable {
    case nameAsc
    case recentlyAdded
    case oldestFirst

    var id: String { rawValue }

    var label: String {
        switch self {
        case .nameAsc: return "Name (A–Z)"
        case .recentlyAdded: return "Recently Added"
        case .oldestFirst: return "Oldest First"
        }
    }

    var icon: String {
        switch self {
        case .nameAsc: return "textformat.abc"
        case .recentlyAdded: return "arrow.down.circle"
        case .oldestFirst: return "arrow.up.circle"
        }
    }
}
