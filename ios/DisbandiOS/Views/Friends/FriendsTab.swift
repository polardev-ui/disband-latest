import SwiftUI

struct FriendsTab: View {
    @Environment(AppState.self) private var app
    @State private var friendships: [Friendship] = []
    @State private var loading = true
    @State private var showAdd = false
    @State private var openChat: ChatSource?
    @State private var selectedProfile: Profile?

    private var uid: String { app.currentUserId ?? "" }

    private var accepted: [Friendship] { friendships.filter { $0.status == .accepted } }
    private var incoming: [Friendship] {
        friendships.filter { $0.status == .pending && $0.addresseeId == uid }
    }
    private var outgoing: [Friendship] {
        friendships.filter { $0.status == .pending && $0.requesterId == uid }
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    StateView(kind: .loading)
                } else if friendships.isEmpty {
                    StateView(kind: .empty, title: "No friends yet.\nTap + to add someone.",
                              systemImage: "person.2")
                } else {
                    List {
                        if !incoming.isEmpty {
                            Section("Friend Requests") {
                                ForEach(incoming) { f in
                                    requestRow(f, profile: counterparty(f))
                                }
                            }
                        }
                        if !outgoing.isEmpty {
                            Section("Pending") {
                                ForEach(outgoing) { f in
                                    HStack {
                                        FriendRow(profile: counterparty(f))
                                        Spacer()
                                        Text("Sent").font(.caption).foregroundStyle(Brand.textMuted)
                                    }
                                    .listRowBackground(Brand.surface)
                                }
                            }
                        }
                        Section("All Friends — \(accepted.count)") {
                            ForEach(accepted) { f in
                                Button { selectedProfile = counterparty(f) } label: {
                                    HStack {
                                        FriendRow(profile: counterparty(f))
                                        Spacer()
                                        Button { startDm(with: counterparty(f)) } label: {
                                            Image(systemName: "bubble.left.fill").foregroundStyle(Brand.accent)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .listRowBackground(Brand.surface)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Brand.background)
            .navigationTitle("Friends")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "person.badge.plus") }
                }
            }
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

    private func counterparty(_ f: Friendship) -> Profile? {
        f.requesterId == uid ? f.addressee : f.requester
    }

    @ViewBuilder
    private func requestRow(_ f: Friendship, profile: Profile?) -> some View {
        HStack {
            FriendRow(profile: profile)
            Spacer()
            Button { respond(f, accept: true) } label: {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Brand.online)
            }.buttonStyle(.plain)
            Button { respond(f, accept: false) } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.dnd)
            }.buttonStyle(.plain)
        }
        .listRowBackground(Brand.surface)
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

struct FriendRow: View {
    let profile: Profile?
    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: profile?.avatarUrl, name: profile?.name ?? "?",
                       size: 40, status: profile?.status)
            VStack(alignment: .leading, spacing: 2) {
                Text(profile?.name ?? "Unknown").font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.textPrimary)
                Text("@\(profile?.handle ?? "user")").font(.caption).foregroundStyle(Brand.textMuted)
            }
        }
        .padding(.vertical, 2)
    }
}
