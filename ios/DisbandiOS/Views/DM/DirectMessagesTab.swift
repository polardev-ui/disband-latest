import SwiftUI

struct DirectMessagesTab: View {
    @Environment(AppState.self) private var app
    @State private var threads: [DmThread] = []
    @State private var groups: [GroupChat] = []
    @State private var loading = true

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    StateView(kind: .loading)
                } else if threads.isEmpty && groups.isEmpty {
                    StateView(kind: .empty,
                              title: "No conversations yet.\nStart one from the Friends tab.",
                              systemImage: "bubble.left.and.bubble.right")
                } else {
                    List {
                        if !threads.isEmpty {
                            Section("Direct Messages") {
                                ForEach(threads) { thread in
                                    NavigationLink {
                                        ChatView(source: .dm(threadId: thread.id,
                                                              title: thread.friend?.name ?? "Direct Message"))
                                    } label: {
                                        ConversationRow(
                                            iconUrl: thread.friend?.avatarUrl,
                                            name: thread.friend?.name ?? "Unknown",
                                            subtitle: "@\(thread.friend?.handle ?? "user")",
                                            status: thread.friend?.status
                                        )
                                    }
                                    .listRowBackground(Brand.surface)
                                }
                            }
                        }
                        if !groups.isEmpty {
                            Section("Group Chats") {
                                ForEach(groups) { group in
                                    NavigationLink {
                                        ChatView(source: .group(id: group.id, name: group.name))
                                    } label: {
                                        ConversationRow(iconUrl: group.iconUrl, name: group.name,
                                                        subtitle: "Group chat", status: nil)
                                    }
                                    .listRowBackground(Brand.surface)
                                    .swipeActions {
                                        Button(role: .destructive) { leaveGroup(group.id) } label: {
                                            Label("Leave", systemImage: "rectangle.portrait.and.arrow.right")
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
            .navigationTitle("Messages")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        guard let uid = app.currentUserId else { return }
        async let t = DatabaseService.myDmThreads(currentUserId: uid)
        async let g = DatabaseService.myGroups(currentUserId: uid)
        threads = (try? await t) ?? []
        groups = (try? await g) ?? []
        loading = false
    }

    private func leaveGroup(_ groupId: String) {
        Task {
            try? await DatabaseService.leaveGroup(groupId: groupId)
            await load()
        }
    }
}

struct ConversationRow: View {
    let iconUrl: String?
    let name: String
    let subtitle: String
    let status: UserStatus?

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: iconUrl, name: name, size: 44, status: status)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.headline).foregroundStyle(Brand.textPrimary)
                Text(subtitle).font(.caption).foregroundStyle(Brand.textMuted)
            }
        }
        .padding(.vertical, 4)
    }
}
