import Observation
import Supabase
import SwiftUI

/**
 Saved messages (bookmarks), the web's `saved-messages.ts` (migration 0238).

 Only references are stored: `saved_messages` holds the context, the message
 id and its container (channel, DM thread or group). The list reads each
 live message through its own table, so a deleted one, or one in a
 conversation you've left, shows as unavailable.
 */
@MainActor
@Observable
final class SavedMessages {
    static let shared = SavedMessages()

    struct Item: Codable, Identifiable, Hashable, Sendable {
        let id: String
        let context: String
        let messageId: String
        let containerId: String
        let note: String?
        let remindAt: String?
        let createdAt: String
        enum CodingKeys: String, CodingKey {
            case id, context, note
            case messageId = "message_id"
            case containerId = "container_id"
            case remindAt = "remind_at"
            case createdAt = "created_at"
        }
    }

    private(set) var items: [Item] = []
    private(set) var loaded = false
    @ObservationIgnored private var userId: String?

    private static let columns = "id, context, message_id, container_id, note, remind_at, created_at"

    func load(userId: String?) async {
        guard let userId else {
            items = []
            loaded = false
            self.userId = nil
            return
        }
        if self.userId != userId { items = []; loaded = false }
        self.userId = userId
        let rows: [Item]? = try? await SupabaseManager.client.from("saved_messages")
            .select(Self.columns).eq("user_id", value: userId)
            .order("created_at", ascending: false).limit(500)
            .execute().value
        guard self.userId == userId else { return }
        if let rows { items = rows }
        loaded = true
    }

    func saved(_ messageId: String, context: String) -> Item? {
        items.first { $0.messageId == messageId && $0.context == context }
    }

    private struct NewRow: Encodable, Sendable {
        let user_id: String
        let context: String
        let message_id: String
        let container_id: String
    }

    /// Nil when it worked, otherwise what to tell the reader.
    func save(_ message: DisplayMessage, in source: ChatSource) async -> String? {
        guard let userId else { return "Saved messages aren't available right now." }
        if saved(message.id, context: source.contextType) != nil { return nil }
        do {
            let row: Item = try await SupabaseManager.client.from("saved_messages")
                .insert(NewRow(user_id: userId, context: source.contextType,
                               message_id: message.id, container_id: source.notificationSourceId))
                .select(Self.columns).single().execute().value
            items.removeAll { $0.id == row.id }
            items.insert(row, at: 0)
            return nil
        } catch {
            // Already saved on another device.
            if (error as? PostgrestError)?.code == "23505" {
                await load(userId: userId)
                return nil
            }
            return "Couldn't save that message. Try again."
        }
    }

    func unsave(_ item: Item) async -> String? {
        guard let userId else { return nil }
        let before = items
        items.removeAll { $0.id == item.id }
        do {
            try await SupabaseManager.client.from("saved_messages")
                .delete().eq("id", value: item.id).eq("user_id", value: userId).execute()
            return nil
        } catch {
            items = before
            return "Couldn't remove it. Try again."
        }
    }
}

/// The saved list: each message as it is now, where it lives, and a tap
/// to open that conversation.
struct SavedMessagesView: View {
    @Environment(AppState.self) private var app
    @State private var saved = SavedMessages.shared
    @State private var resolved: [String: Resolved] = [:]
    @State private var resolving = false
    @State private var error: String?

    struct Resolved: Hashable {
        var content: String
        var createdAt: String
        var author: Profile?
        var hasAttachment: Bool
    }

    private struct Row: Decodable {
        let id: String
        let content: String?
        let created_at: String
        let attachment_url: String?
        let author: Profile?
    }

    @State private var channelNames: [String: String] = [:]
    @State private var groupNames: [String: String] = [:]

    var body: some View {
        Group {
            if !saved.loaded {
                StateView(kind: .loading)
            } else if saved.items.isEmpty {
                StateView(kind: .empty, title: "Nothing saved yet. Hold a message and choose Save Message.",
                          systemImage: "bookmark")
            } else {
                List {
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(Brand.dnd).listRowBackground(Color.clear)
                    }
                    ForEach(saved.items) { item in
                        NavigationLink {
                            ChatView(source: source(for: item)).hidesDock()
                        } label: {
                            row(item)
                        }
                        .listRowBackground(Brand.surface)
                        .swipeActions {
                            Button(role: .destructive) {
                                Task { error = await saved.unsave(item) }
                            } label: {
                                Label("Remove", systemImage: "bookmark.slash")
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .refreshable { await reload() }
            }
        }
        .background(Brand.background)
        .navigationTitle("Saved Messages")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
    }

    private func source(for item: SavedMessages.Item) -> ChatSource {
        switch item.context {
        case "channel": return .channel(id: item.containerId, name: channelNames[item.containerId] ?? "channel")
        case "group": return .group(id: item.containerId, name: groupNames[item.containerId] ?? "Group")
        default: return .dm(threadId: item.containerId, title: resolved[item.messageId]?.author?.name ?? "Direct message")
        }
    }

    private func place(_ item: SavedMessages.Item) -> String {
        switch item.context {
        case "channel": return channelNames[item.containerId].map { "#\($0)" } ?? "A channel"
        case "group": return groupNames[item.containerId] ?? "A group chat"
        default: return "Direct message"
        }
    }

    private func row(_ item: SavedMessages.Item) -> some View {
        let message = resolved[item.messageId]
        return HStack(alignment: .top, spacing: 10) {
            AvatarView(url: message?.author?.avatarUrl, name: message?.author?.name ?? "?", size: 32)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if let author = message?.author {
                        StyledName(author, size: 14).lineLimit(1)
                    }
                    Text(place(item)).font(.caption).foregroundStyle(Brand.textMuted).lineLimit(1)
                }
                if let message {
                    Text(message.content.isEmpty ? (message.hasAttachment ? "(attachment)" : "") :
                            ExpressionStore.shared.decode(message.content))
                        .font(.system(size: 14))
                        .foregroundStyle(Brand.textSecondary)
                        .lineLimit(4)
                } else if !resolving {
                    Text("This message is no longer available.")
                        .font(.system(size: 14)).italic()
                        .foregroundStyle(Brand.textMuted)
                }
            }
        }
    }

    private func reload() async {
        await saved.load(userId: app.currentUserId)
        await resolve()
    }

    /// Reads the live messages behind the list, a few queries at most.
    private func resolve() async {
        resolving = true
        defer { resolving = false }
        let items = saved.items
        func ids(_ context: String) -> [String] { items.filter { $0.context == context }.map(\.messageId) }
        let channelIds = Array(Set(items.filter { $0.context == "channel" }.map(\.containerId)))
        let groupIds = Array(Set(items.filter { $0.context == "group" }.map(\.containerId)))
        let select = "id, content, created_at, attachment_url, author:profiles(\(DatabaseService.profileColumns))"
        let client = SupabaseManager.client

        func fetch(_ table: String, _ list: [String]) async -> [Row] {
            guard !list.isEmpty else { return [] }
            var out: [Row] = []
            for start in stride(from: 0, to: list.count, by: 100) {
                let chunk = Array(list[start..<min(start + 100, list.count)])
                let rows: [Row]? = try? await client.from(table).select(select).in("id", values: chunk)
                    .execute().value
                out += rows ?? []
            }
            return out
        }
        struct Named: Decodable { let id: String; let name: String }
        async let channelRows = fetch("messages", ids("channel"))
        async let dmRows = fetch("dm_messages", ids("dm"))
        async let groupRows = fetch("group_messages", ids("group"))
        async let channels: [Named]? = channelIds.isEmpty ? [] :
            try? client.from("channels").select("id, name").in("id", values: channelIds).execute().value
        async let groups: [Named]? = groupIds.isEmpty ? [] :
            try? client.from("group_chats").select("id, name").in("id", values: groupIds).execute().value

        var map: [String: Resolved] = [:]
        for row in await channelRows + dmRows + groupRows {
            map[row.id] = Resolved(content: row.content ?? "", createdAt: row.created_at,
                                   author: row.author, hasAttachment: row.attachment_url != nil)
        }
        resolved = map
        for c in await channels ?? [] { channelNames[c.id] = c.name }
        for g in await groups ?? [] { groupNames[g.id] = g.name }
    }
}
