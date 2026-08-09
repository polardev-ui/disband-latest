import PhotosUI
import SwiftUI

/// Private notes: thoughts, images, GIFs and videos kept for as long as you
/// want them. Newest first, with pinned notes surfaced at the top.
struct NotesTab: View {
    @Environment(AppState.self) private var app
    @Environment(NotesService.self) private var notesService

    @State private var draft = ""
    @State private var editing: Note?
    @State private var editText = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var showPinnedOnly = false

    private var visibleNotes: [Note] {
        showPinnedOnly ? notesService.pinned : notesService.notes
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Notes")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showPinnedOnly.toggle()
                        } label: {
                            Image(systemName: showPinnedOnly ? "pin.fill" : "pin")
                        }
                        .accessibilityLabel(showPinnedOnly ? "Show all notes" : "Show pinned only")
                        .disabled(notesService.pinned.isEmpty && !showPinnedOnly)
                    }
                }
                .task(id: app.currentUserId) {
                    await notesService.start(userId: app.currentUserId)
                }
        }
        .sheet(item: $editing) { note in
            EditNoteSheet(note: note, text: $editText) { updated in
                Task { await notesService.edit(note, content: updated) }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(spacing: 0) {
            if notesService.loading {
                StateView(kind: .loading)
                    .frame(maxHeight: .infinity)
            } else if visibleNotes.isEmpty {
                StateView(
                    kind: .empty,
                    title: showPinnedOnly
                        ? "No pinned notes yet."
                        : "Nothing here yet.\nJot down a thought below.",
                    systemImage: showPinnedOnly ? "pin" : "note.text"
                )
                .frame(maxHeight: .infinity)
            } else {
                list
            }

            composer
        }
        .background(Brand.background)
    }

    private var list: some View {
        List {
            ForEach(visibleNotes) { note in
                NoteRow(note: note)
                    .listRowBackground(Brand.background)
                    .listRowSeparatorTint(Brand.divider)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            Task { await notesService.delete(note) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        Button {
                            editing = note
                            editText = note.content
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        .tint(Brand.accentSoft)
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            Task { await notesService.togglePin(note) }
                        } label: {
                            Label(note.pinned ? "Unpin" : "Pin",
                                  systemImage: note.pinned ? "pin.slash" : "pin")
                        }
                        .tint(Brand.idle)
                    }
                    .onAppear {
                        // Page in older notes as the list nears its end.
                        if !showPinnedOnly, note.id == visibleNotes.last?.id {
                            Task { await notesService.loadMore() }
                        }
                    }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Brand.background)
    }

    private var composer: some View {
        VStack(spacing: 0) {
            Divider().overlay(Brand.divider)

            if let error = notesService.error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(Brand.dnd)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
            }

            HStack(spacing: 10) {
                PhotosPicker(selection: $photoItem, matching: .any(of: [.images, .videos])) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(Brand.textMuted)
                }
                .disabled(uploading)

                TextField("Write a note…", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Brand.surface, in: .rect(cornerRadius: 18))
                    .foregroundStyle(Brand.textPrimary)

                Button {
                    let text = draft
                    draft = ""
                    Task { await notesService.send(content: text) }
                } label: {
                    if uploading {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(canSend ? Brand.accent : Brand.textMuted)
                    }
                }
                .disabled(!canSend || uploading)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .background(Brand.surfaceRaised)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await upload(item) }
        }
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func upload(_ item: PhotosPickerItem) async {
        uploading = true
        defer {
            uploading = false
            photoItem = nil
        }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        do {
            let result = try await MediaService.uploadImage(data)
            let caption = draft
            draft = ""
            await notesService.send(
                content: caption,
                attachment: OutgoingAttachment(url: result.url, type: "image", key: result.key)
            )
        } catch {
            notesService.error = error.localizedDescription
        }
    }
}

private struct NoteRow: View {
    let note: Note

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if note.pinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(Brand.idle)
                }
                Text(RelativeTime.short(note.createdAt))
                    .font(.caption)
                    .foregroundStyle(Brand.textMuted)
                if note.editedAt != nil {
                    Text("(edited)")
                        .font(.caption2)
                        .foregroundStyle(Brand.textMuted)
                }
            }

            if let url = note.attachmentUrl {
                RemoteImage(url: url, contentMode: .fit) {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Brand.surface)
                        .frame(height: 160)
                        .overlay { ProgressView().controlSize(.small) }
                }
                .frame(maxWidth: .infinity, maxHeight: 240)
                .clipShape(.rect(cornerRadius: 12))
            }

            if !note.content.isEmpty {
                Text(note.content)
                    .foregroundStyle(Brand.textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, 6)
    }
}

private struct EditNoteSheet: View {
    let note: Note
    @Binding var text: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack {
                TextEditor(text: $text)
                    .scrollContentBackground(.hidden)
                    .padding(12)
                    .background(Brand.surface, in: .rect(cornerRadius: 12))
                    .foregroundStyle(Brand.textPrimary)
                    .frame(maxHeight: .infinity)
            }
            .padding()
            .background(Brand.background)
            .navigationTitle("Edit note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(text)
                        dismiss()
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                              && note.attachmentUrl == nil)
                }
            }
        }
    }
}
