import SwiftUI

/**
 Forward a message to a friend or a group chat: Android's `ForwardSheet` and
 the web's `ForwardModal`.

 The text matches the web's `handleForward` exactly, so a forward reads the
 same on every client: a "[Forwarded from Name]" line, then the original text
 ("(attachment)" when there was none). Attachments travel too, as on Android
 (the web renders them); a poll stays behind, its id belongs to the original
 conversation.
 */
struct ForwardSheet: View {
    let message: DisplayMessage
    let currentUserId: String
    /// Called with a short confirmation once it is sent.
    var onForwarded: (String) -> Void = { _ in }

    @Environment(\.dismiss) private var dismiss
    @State private var targets: [Target]?
    @State private var query = ""
    @State private var sendingTo: String?
    @State private var error: String?

    struct Target: Identifiable, Hashable {
        enum Kind { case dm, group }
        let kind: Kind
        /// The friend's user id for a DM, the group's id for a group.
        let id: String
        let label: String
        let avatarUrl: String?
        var key: String { "\(kind):\(id)" }
    }

    static func content(for message: DisplayMessage, hasAttachments: Bool) -> String {
        let prefix = message.author.map { "[Forwarded from \($0.name)]" } ?? "[Forwarded]"
        let body = message.content.isEmpty ? (hasAttachments ? "" : "(attachment)") : message.content
        return body.isEmpty ? prefix : "\(prefix)\n\(body)"
    }

    static func attachments(for message: DisplayMessage) -> [StoredAttachment] {
        message.attachments.filter { $0.type != .poll && $0.type != .unknown }
    }

    private var shown: [Target] {
        let all = targets ?? []
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? all : all.filter { $0.label.lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if targets == nil {
                    StateView(kind: .loading)
                } else if shown.isEmpty {
                    StateView(kind: .empty,
                              title: (targets ?? []).isEmpty
                                ? "Add a friend or join a group chat to forward messages."
                                : "No matches.",
                              systemImage: "arrowshape.turn.up.right")
                } else {
                    List {
                        if let error {
                            Text(error).font(.footnote).foregroundStyle(Brand.dnd)
                                .listRowBackground(Color.clear)
                        }
                        ForEach(shown, id: \.key) { target in
                            Button { Task { await forward(to: target) } } label: {
                                HStack(spacing: 12) {
                                    AvatarView(url: target.avatarUrl, name: target.label, size: 36)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(target.label)
                                            .font(.system(size: 15, weight: .medium))
                                            .foregroundStyle(Brand.textPrimary)
                                            .lineLimit(1)
                                        Text(target.kind == .dm ? "Direct message" : "Group chat")
                                            .font(.caption)
                                            .foregroundStyle(Brand.textMuted)
                                    }
                                    Spacer(minLength: 0)
                                    if sendingTo == target.key { ProgressView().controlSize(.small) }
                                }
                            }
                            .disabled(sendingTo != nil)
                            .listRowBackground(Brand.surface)
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Brand.background)
            .searchable(text: $query, prompt: "Search friends and groups")
            .navigationTitle("Forward Message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await loadTargets() }
    }

    private func loadTargets() async {
        async let friendsCall = try? DatabaseService.friendships(currentUserId: currentUserId)
        async let groupsCall = try? DatabaseService.myGroups(currentUserId: currentUserId)
        let (friends, groups) = await (friendsCall, groupsCall)
        if friends == nil && groups == nil {
            error = "Couldn't load your conversations. Check your connection and try again."
            targets = []
            return
        }
        let dms: [Target] = (friends ?? [])
            .filter { $0.status == .accepted }
            .compactMap { f in
                let other = f.requesterId == currentUserId ? f.addressee : f.requester
                return other.map { Target(kind: .dm, id: $0.id, label: $0.name, avatarUrl: $0.avatarUrl) }
            }
            .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
        let gs: [Target] = (groups ?? [])
            .map { Target(kind: .group, id: $0.id, label: $0.name, avatarUrl: $0.iconUrl) }
            .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
        targets = dms + gs
    }

    private func forward(to target: Target) async {
        guard sendingTo == nil else { return }
        sendingTo = target.key
        error = nil
        defer { sendingTo = nil }
        let attachments = Self.attachments(for: message)
        let content = Self.content(for: message, hasAttachments: !attachments.isEmpty)
        do {
            let source: ChatSource
            switch target.kind {
            case .dm:
                let threadId = try await DatabaseService.getOrCreateDmThread(friendId: target.id)
                source = .dm(threadId: threadId, title: target.label)
            case .group:
                source = .group(id: target.id, name: target.label)
            }
            if attachments.isEmpty {
                switch source {
                case .dm(let threadId, _):
                    _ = try await DatabaseService.sendDmMessage(threadId: threadId, authorId: currentUserId,
                                                                content: content)
                case .group(let id, _):
                    _ = try await DatabaseService.sendGroupMessage(groupId: id, authorId: currentUserId,
                                                                   content: content)
                case .channel:
                    break
                }
            } else {
                _ = try await DatabaseService.sendMessageWithAttachments(
                    source: source, authorId: currentUserId, content: content, attachments: attachments)
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onForwarded("Forwarded to \(target.label)")
            dismiss()
        } catch {
            self.error = "Couldn't forward to \(target.label). Try again."
        }
    }
}
