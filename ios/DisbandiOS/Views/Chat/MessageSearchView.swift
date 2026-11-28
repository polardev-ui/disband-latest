import Supabase
import SwiftUI

/**
 Message search, through the web's `search_messages_v2` (migration 0279),
 with the same filter words as the web's search box:
 `from:alex has:image before:2026-11-01 cats`.

 Filters: `from:` and `mentions:` take a username; `has:` link, embed,
 image, video or file; `before:`, `after:`, `during:` a date (YYYY-MM-DD).
 A channel searches the whole space it belongs to, as on the web, unless
 "This channel only" is picked; `in:` is not offered here.
 */
struct MessageSearchView: View {
    let source: ChatSource
    /// The channel's space, when searching from a channel.
    var serverId: String?
    /// Open a result (the chat jumps to it, or opens its channel).
    var onOpen: (Hit, String?) -> Void = { _, _ in }

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var sort = "newest"
    @State private var channelOnly = false
    @State private var results: [Hit] = []
    @State private var authors: [String: Profile] = [:]
    @State private var channelNames: [String: String] = [:]
    @State private var total = 0
    @State private var page = 1
    @State private var loading = false
    @State private var error: String?
    @State private var searched = false

    static let pageSize = 25
    private static let hasValues: Set<String> = ["link", "embed", "image", "video", "file"]
    private static let keys: Set<String> = ["from", "has", "mentions", "before", "after", "during"]

    struct Hit: Decodable, Identifiable, Hashable {
        let messageId: String
        let sourceKind: String
        let containerId: String
        let authorId: String
        let content: String?
        let createdAt: String
        let attachmentCount: Int?
        let total: Int?
        var id: String { messageId }
        enum CodingKeys: String, CodingKey {
            case content, total
            case messageId = "message_id"
            case sourceKind = "source_kind"
            case containerId = "container_id"
            case authorId = "author_id"
            case createdAt = "created_at"
            case attachmentCount = "attachment_count"
        }
    }

    private struct Params: Encodable, Sendable {
        let p_scope: String
        let p_server_id: String?
        let p_container_id: String?
        let p_query: String?
        let p_channel_id: String?
        let p_from: String?
        let p_mentions: String?
        let p_has: String?
        let p_before: String?
        let p_after: String?
        let p_during: String?
        let p_sort: String
        let p_limit: Int
        let p_offset: Int

        // Nulls are sent, not left out: the function's defaults are null too,
        // but PostgREST matches overloads on the names it is given.
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(p_scope, forKey: .p_scope)
            try c.encode(p_server_id, forKey: .p_server_id)
            try c.encode(p_container_id, forKey: .p_container_id)
            try c.encode(p_query, forKey: .p_query)
            try c.encode(p_channel_id, forKey: .p_channel_id)
            try c.encode(p_from, forKey: .p_from)
            try c.encode(p_mentions, forKey: .p_mentions)
            try c.encode(p_has, forKey: .p_has)
            try c.encode(p_before, forKey: .p_before)
            try c.encode(p_after, forKey: .p_after)
            try c.encode(p_during, forKey: .p_during)
            try c.encode(p_sort, forKey: .p_sort)
            try c.encode(p_limit, forKey: .p_limit)
            try c.encode(p_offset, forKey: .p_offset)
        }
        enum CodingKeys: String, CodingKey {
            case p_scope, p_server_id, p_container_id, p_query, p_channel_id, p_from, p_mentions
            case p_has, p_before, p_after, p_during, p_sort, p_limit, p_offset
        }
    }

    /// Words, and `key:value` filters (the web's `parseQuery`).
    static func parse(_ text: String) -> (text: String, filters: [String: String]) {
        var words: [String] = []
        var filters: [String: String] = [:]
        for token in text.split(separator: " ", omittingEmptySubsequences: true) {
            let parts = token.split(separator: ":", maxSplits: 1).map(String.init)
            if parts.count == 2, keys.contains(parts[0].lowercased()), !parts[1].isEmpty {
                filters[parts[0].lowercased()] = parts[1]
            } else {
                words.append(String(token))
            }
        }
        return (words.joined(separator: " "), filters)
    }

    private static func isDate(_ value: String?) -> Bool {
        guard let value else { return false }
        return value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    private var scope: (kind: String, server: String?, container: String?) {
        switch source {
        case .channel(let id, _):
            if channelOnly || serverId == nil { return ("channel", serverId, id) }
            return ("server", serverId, nil)
        case .dm(let threadId, _): return ("dm", nil, threadId)
        case .group(let id, _): return ("group", nil, id)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if case .channel = source, serverId != nil {
                        Toggle("This channel only", isOn: $channelOnly)
                            .listRowBackground(Brand.surface)
                    }
                    Picker("Sort", selection: $sort) {
                        Text("Newest").tag("newest")
                        Text("Oldest").tag("oldest")
                        Text("Most relevant").tag("relevance")
                    }
                    .listRowBackground(Brand.surface)
                } footer: {
                    Text("Combine filters with words, like from:alex has:image cats. Also mentions:, before:, after: and during: (YYYY-MM-DD).")
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Brand.dnd).listRowBackground(Color.clear)
                }
                if loading && results.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
                } else if searched && results.isEmpty {
                    Text("No results.").foregroundStyle(Brand.textMuted).listRowBackground(Color.clear)
                }
                if !results.isEmpty {
                    Section("\(total) result\(total == 1 ? "" : "s")") {
                        ForEach(results) { hit in
                            Button {
                                onOpen(hit, channelNames[hit.containerId])
                                dismiss()
                            } label: { row(hit) }
                            .listRowBackground(Brand.surface)
                        }
                        if results.count < total {
                            Button(loading ? "Loading…" : "Show more") { Task { await run(page: page + 1) } }
                                .disabled(loading)
                                .listRowBackground(Brand.surface)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search messages")
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .onSubmit(of: .search) { Task { await run(page: 1) } }
            .onChange(of: sort) { if searched { Task { await run(page: 1) } } }
            .onChange(of: channelOnly) { if searched { Task { await run(page: 1) } } }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
    }

    private func row(_ hit: Hit) -> some View {
        let author = authors[hit.authorId]
        return HStack(alignment: .top, spacing: 10) {
            AvatarView(url: author?.avatarUrl, name: author?.name ?? "?", size: 32)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if let author { StyledName(author, size: 14).lineLimit(1) }
                    if hit.sourceKind == "channel", scope.kind == "server",
                       let name = channelNames[hit.containerId] {
                        Text("#\(name)").font(.caption).foregroundStyle(Brand.textMuted)
                    }
                    Text(RelativeTime.short(hit.createdAt)).font(.caption2).foregroundStyle(Brand.textMuted)
                }
                let text = ExpressionStore.shared.decode(hit.content ?? "")
                Text(text.isEmpty ? "(attachment)" : text)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.textSecondary)
                    .lineLimit(4)
                    .multilineTextAlignment(.leading)
            }
        }
    }

    private func run(page: Int) async {
        let parsed = Self.parse(query)
        guard !parsed.text.isEmpty || !parsed.filters.isEmpty else {
            results = []; total = 0; searched = false
            return
        }
        loading = true
        error = nil
        defer { loading = false }
        let f = parsed.filters
        let has = f["has"]?.lowercased()
        let params = Params(
            p_scope: scope.kind, p_server_id: scope.server, p_container_id: scope.container,
            p_query: parsed.text.isEmpty ? nil : parsed.text, p_channel_id: nil,
            p_from: f["from"], p_mentions: f["mentions"],
            p_has: has.flatMap { Self.hasValues.contains($0) ? $0 : nil },
            p_before: Self.isDate(f["before"]) ? f["before"] : nil,
            p_after: Self.isDate(f["after"]) ? f["after"] : nil,
            p_during: Self.isDate(f["during"]) ? f["during"] : nil,
            p_sort: sort, p_limit: Self.pageSize, p_offset: (page - 1) * Self.pageSize)
        do {
            let rows: [Hit] = try await SupabaseManager.client.rpc("search_messages_v2", params: params)
                .execute().value
            results = page == 1 ? rows : results + rows
            total = rows.first?.total ?? (page == 1 ? 0 : total)
            self.page = page
            searched = true
            let missing = Set(rows.map(\.authorId)).filter { authors[$0] == nil }
            for id in missing { if let known = ProfileLive.shared.latest[id] { authors[id] = known } }
            let unknown = missing.filter { authors[$0] == nil }
            if !unknown.isEmpty, let fetched = try? await DatabaseService.profiles(ids: Array(unknown)) {
                authors.merge(fetched) { _, new in new }
            }
            if scope.kind == "server", let serverId = scope.server, channelNames.isEmpty,
               let channels = try? await DatabaseService.channels(serverId: serverId) {
                for c in channels { channelNames[c.id] = c.name }
            }
        } catch {
            self.error = "Search failed. Try again."
        }
    }
}
