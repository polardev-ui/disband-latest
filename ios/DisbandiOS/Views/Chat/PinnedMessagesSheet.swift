import Supabase
import SwiftUI

/// Pinned messages, through the same functions as the web
/// (`get_pinned_messages`, `pin_message`, `unpin_message` in `AppContext.tsx`).
/// Who may pin is checked by the database; the app only hides the action.
enum PinService {
    struct Pin: Decodable, Identifiable, Hashable, Sendable {
        let id: String
        let messageId: String
        let content: String?
        let authorId: String?
        let pinnerId: String?
        let createdAt: String?
        enum CodingKeys: String, CodingKey {
            case id, content
            case messageId = "message_id"
            case authorId = "author_id"
            case pinnerId = "pinner_id"
            case createdAt = "created_at"
        }
    }

    private struct Source: Encodable, Sendable {
        let p_source_type: String
        let p_source_id: String
    }

    private struct PinArgs: Encodable, Sendable {
        let p_source_type: String
        let p_source_id: String
        let p_message_id: String
        let p_content: String
        let p_author_id: String?
    }

    private struct UnpinArgs: Encodable, Sendable {
        let p_source_type: String
        let p_source_id: String
        let p_message_id: String
    }

    static func pins(source: ChatSource) async throws -> [Pin] {
        try await SupabaseManager.client.rpc("get_pinned_messages", params: Source(
            p_source_type: source.contextType, p_source_id: source.notificationSourceId
        )).execute().value
    }

    static func pin(_ message: DisplayMessage, in source: ChatSource) async throws {
        try await SupabaseManager.client.rpc("pin_message", params: PinArgs(
            p_source_type: source.contextType, p_source_id: source.notificationSourceId,
            p_message_id: message.id, p_content: message.content, p_author_id: message.authorId
        )).execute()
    }

    static func unpin(messageId: String, in source: ChatSource) async throws {
        try await SupabaseManager.client.rpc("unpin_message", params: UnpinArgs(
            p_source_type: source.contextType, p_source_id: source.notificationSourceId,
            p_message_id: messageId
        )).execute()
    }
}

/// The conversation's pinned messages, newest pin first, as the web's
/// `PinnedMessagesPanel`: tap one to jump to it, swipe to unpin.
struct PinnedMessagesSheet: View {
    let source: ChatSource
    let canUnpin: Bool
    /// Jump to the pinned message in the conversation.
    var onJump: (String) -> Void = { _ in }
    /// Called after a pin is removed, so the conversation can update.
    var onChanged: () -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @State private var pins: [PinService.Pin]?
    @State private var authors: [String: Profile] = [:]
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let pins {
                    if pins.isEmpty {
                        StateView(kind: .empty, title: "No pinned messages yet.", systemImage: "pin")
                    } else {
                        List {
                            if let error {
                                Text(error).font(.footnote).foregroundStyle(Brand.dnd)
                                    .listRowBackground(Color.clear)
                            }
                            ForEach(pins) { pin in row(pin) }
                        }
                        .listStyle(.insetGrouped)
                        .scrollContentBackground(.hidden)
                    }
                } else if let error {
                    StateView(kind: .error, title: error, retry: { await load() })
                } else {
                    StateView(kind: .loading)
                }
            }
            .background(Brand.background)
            .navigationTitle("Pinned Messages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await load() }
    }

    private func row(_ pin: PinService.Pin) -> some View {
        let author = pin.authorId.flatMap { authors[$0] }
        return Button {
            onJump(pin.messageId)
            dismiss()
        } label: {
            HStack(alignment: .top, spacing: 10) {
                AvatarView(url: author?.avatarUrl, name: author?.name ?? "?", size: 32)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if let author {
                            StyledName(author, size: 14)
                        } else {
                            Text("Unknown").font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Brand.textPrimary)
                        }
                        if let created = pin.createdAt {
                            Text(RelativeTime.short(created))
                                .font(.caption2).foregroundStyle(Brand.textMuted)
                        }
                    }
                    Text((pin.content ?? "").isEmpty ? "(attachment)" : ExpressionStore.shared.decode(pin.content ?? ""))
                        .font(.system(size: 14))
                        .foregroundStyle(Brand.textSecondary)
                        .lineLimit(4)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
        }
        .listRowBackground(Brand.surface)
        .swipeActions {
            if canUnpin {
                Button(role: .destructive) { Task { await unpin(pin) } } label: {
                    Label("Unpin", systemImage: "pin.slash")
                }
            }
        }
    }

    private func load() async {
        do {
            let loaded = try await PinService.pins(source: source)
                .sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            pins = loaded
            error = nil
            let ids = Set(loaded.compactMap(\.authorId))
            let missing = ids.filter { ProfileLive.shared.latest[$0] == nil }
            for id in ids { if let known = ProfileLive.shared.latest[id] { authors[id] = known } }
            if !missing.isEmpty, let fetched = try? await DatabaseService.profiles(ids: Array(missing)) {
                authors.merge(fetched) { _, new in new }
            }
        } catch {
            if pins == nil { self.error = "Couldn't load pinned messages." }
        }
    }

    private func unpin(_ pin: PinService.Pin) async {
        do {
            try await PinService.unpin(messageId: pin.messageId, in: source)
            pins?.removeAll { $0.id == pin.id }
            onChanged()
        } catch {
            self.error = "Couldn't unpin that message."
        }
    }
}
