import SwiftUI

struct DirectMessagesTab: View {
    @Environment(AppState.self) private var app
    @Environment(DmUnreadStore.self) private var unreadStore
    @State private var vm = DirectMessagesViewModel()

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Messages")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Task { await vm.start(currentUserId: app.currentUserId, unread: unreadStore) }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
                .task {
                    await vm.start(currentUserId: app.currentUserId, unread: unreadStore)
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if vm.loading {
            StateView(kind: .loading)
        } else if vm.threads.isEmpty && vm.groups.isEmpty {
            StateView(kind: .empty,
                      title: "No conversations yet.\nStart one from the Friends tab.",
                      systemImage: "bubble.left.and.bubble.right")
        } else {
            List {
                if !vm.threads.isEmpty {
                    Section("Direct Messages") {
                        ForEach(sortedThreads) { thread in
                            NavigationLink {
                                ChatView(source: .dm(threadId: thread.id,
                                                     title: thread.friend?.name ?? "Direct Message"),
                                         callPeer: thread.friend)
                            } label: {
                                ConversationRow(
                                    iconUrl: thread.friend?.avatarUrl,
                                    name: thread.friend?.name ?? "Unknown",
                                    status: thread.friend?.status,
                                    preview: DirectMessagesViewModel.preview(for: thread),
                                    time: RelativeTime.compact(thread.lastMessageAt ?? thread.createdAt),
                                    unread: unreadStore.count(for: thread.id)
                                )
                            }
                        }
                    }
                }

                if !vm.groups.isEmpty {
                    Section("Group Chats") {
                        ForEach(vm.groups) { group in
                            groupRow(group)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Brand.background)
        }
    }

    /// Threads with unread messages float to the top; everything else keeps
    /// the view model's most-recent-activity order. A stable secondary sort on
    /// recency stops rows from shuffling when two chats are both unread.
    private var sortedThreads: [DmThread] {
        vm.threads.enumerated()
            .sorted { lhs, rhs in
                let lUnread = unreadStore.count(for: lhs.element.id) > 0
                let rUnread = unreadStore.count(for: rhs.element.id) > 0
                if lUnread != rUnread { return lUnread }
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }

    private func groupRow(_ group: GroupChat) -> some View {
        NavigationLink {
            ChatView(source: .group(id: group.id, name: group.name), callPeer: nil)
        } label: {
            ConversationRow(
                iconUrl: group.iconUrl,
                name: group.name,
                subtitle: "\(group.members?.count ?? 0) members"
            )
        }
        .swipeActions {
            Button(role: .destructive) {
                Task { await vm.leaveGroup(group.id) }
            } label: {
                Label("Leave", systemImage: "rectangle.portrait.and.arrow.right")
            }
        }
    }
}
