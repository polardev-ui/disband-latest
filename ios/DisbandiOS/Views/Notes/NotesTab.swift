import PhotosUI
import SwiftUI

/// Private notes: thoughts, images, GIFs and videos kept for as long as you
/// want them. Newest first, grouped by day, with pinned notes on their own.
struct NotesTab: View {
    @Environment(AppState.self) private var app
    @Environment(NotesService.self) private var notesService
    @Environment(ShellChrome.self) private var chrome

    @State private var draft = ""
    @State private var editing: Note?
    @State private var editText = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var filter: NoteFilter = .all
    @FocusState private var composing: Bool

    enum NoteFilter: String, CaseIterable, Identifiable {
        case all, pinned
        var id: String { rawValue }
    }

    private var visibleNotes: [Note] {
        filter == .pinned ? notesService.pinned : notesService.notes
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ScreenHeader("Notes", subtitle: "Only you can see these")
                    CapsuleFilterBar(options: NoteFilter.allCases, selection: $filter,
                                     title: { $0 == .all ? "All" : "Pinned" },
                                     badge: { _ in 0 })
                        .padding(.bottom, 8)

                    if notesService.loading {
                        ProgressView().tint(Brand.accent).padding(.top, 60)
                    } else if visibleNotes.isEmpty {
                        emptyState
                    } else {
                        ForEach(daySections, id: \.title) { section in
                            SectionCaption(section.title)
                            ForEach(section.notes) { note in
                                NoteCard(note: note,
                                         onEdit: { editing = note; editText = note.content },
                                         onTogglePin: { Task { await notesService.togglePin(note) } },
                                         onDelete: { Task { await notesService.delete(note) } })
                                    .padding(.horizontal, 16)
                                    .padding(.bottom, 10)
                                    .onAppear {
                                        // Page in older notes as the list nears its end.
                                        if filter == .all, note.id == visibleNotes.last?.id {
                                            Task { await notesService.loadMore() }
                                        }
                                    }
                            }
                        }
                    }
                }
                .padding(.bottom, 12)
            }
            .scrollIndicators(.hidden)
            .statusBarScrim()
            .scrollDismissesKeyboard(.interactively)
            .background(Brand.background)
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
            .toolbar(.hidden, for: .navigationBar)
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

    // MARK: - Day sections

    private struct DaySection {
        let title: String
        let notes: [Note]
    }

    private var daySections: [DaySection] {
        if filter == .pinned { return [DaySection(title: "Pinned", notes: visibleNotes)] }
        let calendar = Calendar.current
        var order: [String] = []
        var buckets: [String: [Note]] = [:]
        for note in visibleNotes {
            let title: String
            if let date = RelativeTime.date(from: note.createdAt) {
                if calendar.isDateInToday(date) { title = "Today" }
                else if calendar.isDateInYesterday(date) { title = "Yesterday" }
                else { title = date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()) }
            } else {
                title = "Earlier"
            }
            if buckets[title] == nil { order.append(title) }
            buckets[title, default: []].append(note)
        }
        return order.map { DaySection(title: $0, notes: buckets[$0] ?? []) }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: filter == .pinned ? "pin" : "note.text")
                .font(.system(size: 34))
                .foregroundStyle(Brand.textMuted)
            Text(filter == .pinned ? "No pinned notes" : "Nothing here yet")
                .font(.headline).foregroundStyle(Brand.textPrimary)
            Text(filter == .pinned ? "Pin a note from its menu to keep it here."
                                   : "Jot down a thought, or save a photo, below.")
                .font(.subheadline).foregroundStyle(Brand.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 40)
        .padding(.top, 70)
    }

    // MARK: - Composer

    private var composer: some View {
        VStack(spacing: 6) {
            if let error = notesService.error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(Brand.dnd)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
            }

            HStack(alignment: .bottom, spacing: 4) {
                PhotosPicker(selection: $photoItem, matching: .any(of: [.images, .videos])) {
                    ZStack {
                        if uploading {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "photo.on.rectangle")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Brand.textPrimary)
                                .frame(width: 36, height: 36)
                                .background(Brand.surface, in: Circle())
                        }
                    }
                    .frame(width: 44, height: 44)
                }
                .disabled(uploading)
                .accessibilityLabel("Add a photo or video")

                TextField("Write a note…", text: $draft, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($composing)
                    .foregroundStyle(Brand.textPrimary)
                    .padding(.vertical, 11)
                    .frame(minHeight: 44)

                if canSend {
                    Button {
                        let text = draft
                        draft = ""
                        Task { await notesService.send(content: text) }
                    } label: {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Brand.accent.gradient, in: Circle())
                            .frame(width: 44, height: 44)
                    }
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
                    .accessibilityLabel("Save note")
                }
            }
            .padding(.leading, 4)
            .padding(.trailing, canSend ? 4 : 14)
            .padding(.vertical, 3)
            .background {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .fill(Brand.elevated.opacity(0.75)))
                    .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .strokeBorder(composing ? Brand.accent.opacity(0.55) : Color.white.opacity(0.07), lineWidth: 1))
                    .shadow(color: .black.opacity(0.25), radius: 14, y: 6)
            }
            .animation(.snappy(duration: 0.22), value: canSend)
            .padding(.horizontal, 12)
        }
        .padding(.top, 6)
        // Sit above the floating dock whenever it's showing. The shell hides
        // it while the software keyboard is up, and the composer drops down.
        .padding(.bottom, chrome.dockVisible ? 72 : 8)
        .animation(.snappy(duration: 0.25), value: chrome.dockVisible)
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
        // Videos were uploaded as images here, and the note then showed a
        // broken picture. They now go through the same path as chat.
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            guard let movie = try? await item.loadTransferable(type: PickedMovie.self) else {
                notesService.error = "Couldn't open that video."
                return
            }
            var converted: URL?
            defer {
                try? FileManager.default.removeItem(at: movie.url)
                if let converted { try? FileManager.default.removeItem(at: converted) }
            }
            do {
                let mp4 = try await MediaService.prepareVideo(movie.url)
                converted = mp4
                let result = try await MediaService.uploadFile(at: mp4, filename: "video.mp4", mimeType: "video/mp4")
                let caption = draft
                draft = ""
                await notesService.send(
                    content: caption,
                    attachment: OutgoingAttachment(url: result.url, type: "video", key: result.key)
                )
            } catch {
                notesService.error = error.localizedDescription
            }
            return
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

private struct NoteCard: View {
    let note: Note
    var onEdit: () -> Void
    var onTogglePin: () -> Void
    var onDelete: () -> Void

    @State private var viewing: ViewedMedia?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                if note.pinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Brand.idle)
                }
                Text(timeLabel)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Brand.textMuted)
                if note.editedAt != nil {
                    Text("· edited").font(.caption).foregroundStyle(Brand.textMuted)
                }
                Spacer()
                Menu {
                    Button(action: onTogglePin) {
                        Label(note.pinned ? "Unpin" : "Pin", systemImage: note.pinned ? "pin.slash" : "pin")
                    }
                    Button(action: onEdit) { Label("Edit", systemImage: "pencil") }
                    if !note.content.isEmpty {
                        Button { UIPasteboard.general.string = note.content } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }
                    }
                    Divider()
                    Button(role: .destructive, action: onDelete) { Label("Delete", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Brand.textMuted)
                        .frame(width: 30, height: 24)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Note options")
            }

            if note.attachmentType == .video, let raw = note.attachmentUrl, let url = URL(string: raw) {
                Button { viewing = ViewedMedia(url: url, kind: .video) } label: {
                    VideoThumbnail(url: url, maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            } else if let url = note.attachmentUrl {
                RemoteImage(url: url, contentMode: .fit) {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Brand.elevated)
                        .frame(height: 160)
                        .overlay { ProgressView().controlSize(.small) }
                }
                .frame(maxWidth: .infinity, maxHeight: 280)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            if !note.content.isEmpty {
                Text(note.content)
                    .foregroundStyle(Brand.textPrimary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(14)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(alignment: .leading) {
            if note.pinned {
                Capsule().fill(Brand.idle).frame(width: 3).padding(.vertical, 14)
            }
        }
        .fullScreenCover(item: $viewing) { media in
            MediaViewer(url: media.url, kind: media.kind, fileName: note.attachmentName)
        }
        .contextMenu {
            Button(action: onTogglePin) {
                Label(note.pinned ? "Unpin" : "Pin", systemImage: note.pinned ? "pin.slash" : "pin")
            }
            Button(action: onEdit) { Label("Edit", systemImage: "pencil") }
            Button(role: .destructive, action: onDelete) { Label("Delete", systemImage: "trash") }
        }
    }

    private var timeLabel: String {
        guard let date = RelativeTime.date(from: note.createdAt) else { return "" }
        return date.formatted(date: .omitted, time: .shortened)
    }
}

private struct EditNoteSheet: View {
    let note: Note
    @Binding var text: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .scrollContentBackground(.hidden)
                .padding(14)
                .background(Brand.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .foregroundStyle(Brand.textPrimary)
                .padding(16)
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
        .presentationDetents([.medium, .large])
    }
}
