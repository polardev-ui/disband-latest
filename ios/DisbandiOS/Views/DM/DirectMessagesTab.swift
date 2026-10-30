import SwiftUI

struct DirectMessagesTab: View {
    @Environment(AppState.self) private var app
    @Environment(DmUnreadStore.self) private var unreadStore
    @Environment(PresenceService.self) private var presence
    @Environment(ClosedDmStore.self) private var closedDms
    // Shared with the app, which starts loading at sign-in rather than when
    // this tab is first opened.
    @Environment(DirectMessagesViewModel.self) private var vm

    // Tether entry point (Aero only): identity for the row, and the thread id
    // once opened, which drives programmatic navigation below.
    @State private var tetherInfo: TetherService.TetherInfo?
    @State private var isAero = false
    @State private var tetherThreadId: String?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Messages")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Task { await vm.start(currentUserId: app.currentUserId, unread: unreadStore, closed: closedDms) }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
                .task {
                    // Usually a no-op by the time the tab is opened: `start`
                    // is idempotent and repaints from what is already loaded.
                    await vm.start(currentUserId: app.currentUserId, unread: unreadStore, closed: closedDms)
                    await loadTetherEntry()
                }
                .navigationDestination(item: $tetherThreadId) { threadId in
                    ChatView(source: .dm(threadId: threadId,
                                         title: tetherInfo?.displayName ?? "Tether"),
                             callPeer: nil)
                }
        }
    }

    /// Resolve the Tether row state: Aero gate plus identity. Runs beside the
    /// normal load; failure just hides the row.
    private func loadTetherEntry() async {
        guard let uid = app.currentUserId else { return }
        async let aero = EntitlementService.shared.entitlement(for: uid).plan == "aero"
        async let info = TetherService.shared.tetherInfo()
        let (isAeroUser, tether) = await (aero, info)
        isAero = isAeroUser
        tetherInfo = tether
    }

    /// The pinned Tether row, shown to Aero users until a real thread with
    /// Tether exists (which then renders as a normal DM row on its own).
    private var showTetherRow: Bool {
        guard isAero, let info = tetherInfo else { return false }
        return !vm.threads.contains { $0.friend?.id == info.id }
    }

    @ViewBuilder
    private var content: some View {
        if vm.loading {
            StateView(kind: .loading)
        } else if visibleThreads.isEmpty && vm.groups.isEmpty && !showTetherRow && vm.messageRequests.isEmpty {
            StateView(kind: .empty,
                      title: "No conversations yet.\nStart one from the Friends tab.",
                      systemImage: "bubble.left.and.bubble.right")
        } else {
            List {
                // People you share a space with who messaged you without being
                // friends (migration 0193). Replying or accepting moves them
                // down into Direct Messages.
                if !vm.messageRequests.isEmpty {
                    Section {
                        ForEach(vm.messageRequests) { thread in
                            NavigationLink {
                                ChatView(source: .dm(threadId: thread.id,
                                                     title: thread.friend?.name ?? "Message Request"),
                                         callPeer: thread.friend)
                            } label: {
                                ConversationRow(
                                    iconUrl: thread.friend?.avatarUrl,
                                    name: thread.friend?.name ?? "Unknown",
                                    userId: thread.friend?.id,
                                    status: liveStatus(thread.friend),
                                    preview: DirectMessagesViewModel.preview(for: thread),
                                    time: RelativeTime.compact(thread.lastMessageAt ?? thread.createdAt),
                                    unread: unreadStore.count(for: thread.id)
                                )
                            }
                        }
                    } header: {
                        Text("Message Requests (\(vm.messageRequests.count))")
                    } footer: {
                        Text("From people you share a space with. They won't know you've seen it unless you reply.")
                    }
                }

                if !visibleThreads.isEmpty || showTetherRow {
                    Section("Direct Messages") {
                        if showTetherRow, let info = tetherInfo {
                            Button {
                                Task {
                                    if let existing = vm.threads.first(where: { $0.friend?.id == info.id }) {
                                        tetherThreadId = existing.id
                                    } else if let opened = await TetherService.shared.openTetherThread() {
                                        // Refresh the list so the new thread renders
                                        // as a normal row from here on.
                                        await vm.load(currentUserId: app.currentUserId)
                                        tetherThreadId = opened
                                    }
                                }
                            } label: {
                                ConversationRow(
                                    iconUrl: info.avatarUrl,
                                    name: info.displayName ?? "Tether",
                                    subtitle: "Ask anything — Aero"
                                )
                            }
                        }
                        ForEach(sortedThreads) { thread in
                            NavigationLink {
                                ChatView(source: .dm(threadId: thread.id,
                                                     title: thread.friend?.name ?? "Direct Message"),
                                         callPeer: thread.friend)
                            } label: {
                                ConversationRow(
                                    iconUrl: thread.friend?.avatarUrl,
                                    name: thread.friend?.name ?? "Unknown",
                                    userId: thread.friend?.id,
                                    status: liveStatus(thread.friend),
                                    preview: DirectMessagesViewModel.preview(for: thread),
                                    time: RelativeTime.compact(thread.lastMessageAt ?? thread.createdAt),
                                    unread: unreadStore.count(for: thread.id)
                                )
                            }
                            // Hold a row to close it (web parity: hover X on
                            // desktop, long-press menu on touch). A new message
                            // or opening the chat again brings the row back.
                            .contextMenu {
                                if let friendId = thread.friend?.id {
                                    Button(role: .destructive) {
                                        closedDms.close(friendId)
                                    } label: {
                                        Label("Close DM", systemImage: "xmark")
                                    }
                                }
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
    /// Closed rows are filtered out until a message or the chat itself opens.
    private var sortedThreads: [DmThread] {
        vm.threads.filter { !closedDms.isClosed($0.friend?.id) && !$0.isIncomingRequest(for: app.currentUserId) }
            .enumerated()
            .sorted { lhs, rhs in
                let lUnread = unreadStore.count(for: lhs.element.id) > 0
                let rUnread = unreadStore.count(for: rhs.element.id) > 0
                if lUnread != rUnread { return lUnread }
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }

    /// What the DM section actually renders after closed rows are hidden.
    private var visibleThreads: [DmThread] { sortedThreads }

    /// A DM friend's live presence status (offline when not actively connected,
    /// matching the web's presence semantics).
    private func liveStatus(_ friend: Profile?) -> UserStatus? {
        guard let friend else { return nil }
        return presence.status(for: friend.id)
    }

    private func groupRow(_ group: GroupChat) -> some View {
        NavigationLink {
            ChatView(source: .group(id: group.id, name: group.name), callPeer: nil)
        } label: {
            ConversationRow(
                iconUrl: group.iconUrl,
                name: group.name,
                subtitle: "\(group.members?.count ?? 0) members",
                unread: unreadStore.countGroup(for: group.id)
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
