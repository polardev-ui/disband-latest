import Foundation
import Observation
import Realtime
import Supabase

/// A private note. Owner-only by RLS (`auth.uid() = user_id`) — there is no
/// sharing path, so nothing here is ever visible to another account.
struct Note: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let userId: String
    var content: String
    var attachmentUrl: String?
    var attachmentType: AttachmentType?
    var attachmentName: String?
    var pinned: Bool
    let createdAt: String?
    var editedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, content, pinned
        case userId = "user_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case attachmentName = "attachment_name"
        case createdAt = "created_at"
        case editedAt = "edited_at"
    }
}

private struct NewNote: Encodable {
    let userId: String
    let content: String
    let attachmentUrl: String?
    let attachmentType: String?
    let attachmentName: String?

    enum CodingKeys: String, CodingKey {
        case content
        case userId = "user_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case attachmentName = "attachment_name"
    }
}

private struct NoteEdit: Encodable {
    let content: String
    let editedAt: String
    enum CodingKeys: String, CodingKey {
        case content
        case editedAt = "edited_at"
    }
}

private struct NotePin: Encodable {
    let pinned: Bool
}

/// Backs the Notes tab: paged history, pin/edit/delete, and realtime so a note
/// written on the desktop shows up here without a refresh.
@MainActor
@Observable
final class NotesService {
    private(set) var notes: [Note] = []
    private(set) var loading = true
    private(set) var hasMore = false
    var error: String?

    private static let pageSize = 50

    private var hasLoadedOnce = false
    private var channel: RealtimeChannelV2?
    private var watchTask: Task<Void, Never>?
    private var changeChannel: RealtimeChannelV2?
    private var changeTask: Task<Void, Never>?
    private var userId: String?

    private var client: SupabaseClient { SupabaseManager.client }

    var pinned: [Note] { notes.filter(\.pinned) }

    func start(userId: String?) async {
        guard self.userId != userId else { return }
        stop()
        self.userId = userId
        hasLoadedOnce = false
        notes = []
        guard userId != nil else {
            loading = false
            return
        }
        await load()
        await subscribe()
    }

    func stop() {
        watchTask?.cancel()
        watchTask = nil
        changeTask?.cancel()
        changeTask = nil
        let ch = channel
        let changes = changeChannel
        channel = nil
        changeChannel = nil
        Task {
            await ch?.unsubscribe()
            await changes?.unsubscribe()
        }
    }

    func load() async {
        guard let userId else { return }
        if !hasLoadedOnce { loading = true }
        defer {
            loading = false
            hasLoadedOnce = true
        }
        do {
            let rows: [Note] = try await client
                .from("notes")
                .select("*")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .limit(Self.pageSize)
                .execute().value
            notes = rows
            hasMore = rows.count == Self.pageSize
        } catch {
            self.error = friendlyMessage(error)
        }
    }

    func loadMore() async {
        guard let userId, hasMore, let oldest = notes.last?.createdAt else { return }
        do {
            let rows: [Note] = try await client
                .from("notes")
                .select("*")
                .eq("user_id", value: userId)
                .lt("created_at", value: oldest)
                .order("created_at", ascending: false)
                .limit(Self.pageSize)
                .execute().value
            // Realtime may have already inserted one of these.
            let known = Set(notes.map(\.id))
            notes.append(contentsOf: rows.filter { !known.contains($0.id) })
            hasMore = rows.count == Self.pageSize
        } catch {
            self.error = friendlyMessage(error)
        }
    }

    func send(content: String, attachment: OutgoingAttachment? = nil) async {
        guard let userId else { return }
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        // Matches the `notes_not_empty` check constraint.
        guard !trimmed.isEmpty || attachment != nil else { return }
        do {
            let payload = NewNote(
                userId: userId,
                content: trimmed,
                attachmentUrl: attachment?.url,
                attachmentType: attachment?.type,
                attachmentName: nil
            )
            let inserted: [Note] = try await client
                .from("notes").insert(payload).select("*").execute().value
            if let note = inserted.first, !notes.contains(where: { $0.id == note.id }) {
                notes.insert(note, at: 0)
            }
        } catch {
            self.error = friendlyMessage(error)
        }
    }

    func edit(_ note: Note, content: String) async {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || note.attachmentUrl != nil else { return }
        let stamp = ISO8601DateFormatter().string(from: Date())
        do {
            try await client.from("notes")
                .update(NoteEdit(content: trimmed, editedAt: stamp))
                .eq("id", value: note.id)
                .execute()
            if let idx = notes.firstIndex(where: { $0.id == note.id }) {
                notes[idx].content = trimmed
                notes[idx].editedAt = stamp
            }
        } catch {
            self.error = friendlyMessage(error)
        }
    }

    func togglePin(_ note: Note) async {
        let next = !note.pinned
        // Optimistic: pinning should feel instant.
        if let idx = notes.firstIndex(where: { $0.id == note.id }) {
            notes[idx].pinned = next
        }
        do {
            try await client.from("notes")
                .update(NotePin(pinned: next))
                .eq("id", value: note.id)
                .execute()
        } catch {
            if let idx = notes.firstIndex(where: { $0.id == note.id }) {
                notes[idx].pinned = !next
            }
            self.error = friendlyMessage(error)
        }
    }

    func delete(_ note: Note) async {
        let previous = notes
        notes.removeAll { $0.id == note.id }
        do {
            try await client.from("notes").delete().eq("id", value: note.id).execute()
        } catch {
            notes = previous
            self.error = friendlyMessage(error)
        }
    }

    private func subscribe() async {
        guard let userId else { return }
        let (channel, stream) = await RealtimeService.observeInserts(
            table: "notes",
            filter: "user_id=eq.\(userId)",
            as: Note.self
        )
        self.channel = channel
        watchTask = Task { [weak self] in
            for await note in stream {
                await MainActor.run {
                    guard let self, !self.notes.contains(where: { $0.id == note.id }) else { return }
                    self.notes.insert(note, at: 0)
                }
            }
        }

        // Inserts alone are not enough: deleting, editing or pinning a note on
        // the desktop produced no event here, so the phone kept showing notes
        // that no longer existed. Any change triggers a reconcile against the
        // server.
        let (anyChannel, anyStream) = await RealtimeService.observeChanges(
            table: "notes",
            filter: "user_id=eq.\(userId)"
        )
        changeChannel = anyChannel
        changeTask = Task { [weak self] in
            for await _ in anyStream {
                await self?.reconcile()
            }
        }
    }

    /// Re-read the newest page and bring local state in line with it.
    ///
    /// Deletions are only applied within the window the fetch actually covers —
    /// an older note that simply falls outside the page must not be mistaken
    /// for one that was deleted.
    private func reconcile() async {
        guard let userId else { return }
        do {
            let rows: [Note] = try await client
                .from("notes")
                .select("*")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .limit(Self.pageSize)
                .execute().value

            let serverIds = Set(rows.map(\.id))
            let windowFloor = rows.count == Self.pageSize ? rows.last?.createdAt : nil

            var merged = notes.filter { note in
                if serverIds.contains(note.id) { return true }
                // Outside the fetched window — keep it, we cannot tell.
                if let floor = windowFloor, let created = note.createdAt, created < floor {
                    return true
                }
                return false
            }

            // Apply server values for rows we still hold, and add anything new.
            for row in rows {
                if let idx = merged.firstIndex(where: { $0.id == row.id }) {
                    merged[idx] = row
                } else {
                    merged.append(row)
                }
            }
            merged.sort { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            notes = merged
        } catch {
            // A failed reconcile should not surface as a user-facing error;
            // the next change (or a manual refresh) will try again.
        }
    }

    private func friendlyMessage(_ error: Error) -> String {
        let text = error.localizedDescription
        if text.localizedCaseInsensitiveContains("notes") && text.localizedCaseInsensitiveContains("exist") {
            return "Notes isn't set up on this account yet."
        }
        return text
    }
}
