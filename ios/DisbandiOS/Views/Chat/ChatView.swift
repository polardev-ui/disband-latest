import SwiftUI
import PhotosUI

/// Shared conversation screen used for channels, DMs, and group chats.
struct ChatView: View {
    @Environment(AppState.self) private var app
    @State private var model: ChatViewModel
    @State private var draft = ""
    @State private var showGifPicker = false
    @State private var showPhotoPicker = false
    @State private var photoItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var openProfile: Profile?
    @State private var reactingMessage: DisplayMessage?
    @State private var replyingTo: DisplayMessage?

    private let quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀"]

    init(source: ChatSource) {
        _model = State(initialValue: ChatViewModel(source: source))
    }

    var body: some View {
        VStack(spacing: 0) {
            messageList
            if let replyingTo { replyBanner(replyingTo) }
            MessageComposer(text: $draft, uploading: uploading, onSend: sendDraft,
                            onGif: { showGifPicker = true },
                            onPhoto: { showPhotoPicker = true })
        }
        .background(Brand.surfaceRaised)
        .navigationTitle(model.source.title)
        .navigationBarTitleDisplayMode(.inline)
        .overlay { reactionBar }
        .task { await model.start(currentUserId: app.currentUserId, profile: app.profile) }
        .onDisappear { model.stop() }
        .sheet(isPresented: $showGifPicker) { GifPickerView { sendGif($0) } }
        .sheet(item: $openProfile) { ProfileDetailView(profile: $0) }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await uploadAndSend(item) }
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if model.loading && model.messages.isEmpty {
                    StateView(kind: .loading).frame(height: 300)
                } else if let error = model.loadError, model.messages.isEmpty {
                    StateView(kind: .error, title: error).frame(height: 300)
                } else if model.messages.isEmpty {
                    StateView(kind: .empty, title: "No messages yet.\nSay hello! 👋",
                              systemImage: "bubble.left").frame(height: 300)
                } else {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, message in
                            MessageRow(
                                message: message,
                                isOwn: message.authorId == app.currentUserId,
                                grouped: isGrouped(at: index),
                                reactions: model.reactions[message.id] ?? [],
                                replyTo: model.repliedMessage(for: message),
                                onTapAuthor: { openProfile = $0 },
                                onReact: { reactingMessage = message },
                                onReply: { withAnimation { replyingTo = message } },
                                onSpeak: { Speaker.shared.speak(message.content) },
                                onDelete: { Task { await model.deleteMessage(message) } },
                                onToggleReaction: { emoji in
                                    Task { await model.toggleReaction(messageId: message.id, emoji: emoji) }
                                }
                            )
                            .id(message.id)
                        }
                    }
                    .padding(.vertical, 12)
                }
            }
            .onChange(of: model.messages.count) {
                if let last = model.messages.last {
                    withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    // MARK: - Reaction picker overlay

    @ViewBuilder private var reactionBar: some View {
        if let target = reactingMessage {
            ZStack {
                Color.black.opacity(0.4).ignoresSafeArea()
                    .onTapGesture { reactingMessage = nil }
                HStack(spacing: 10) {
                    ForEach(quickReactions, id: \.self) { emoji in
                        Button {
                            Task { await model.toggleReaction(messageId: target.id, emoji: emoji) }
                            reactingMessage = nil
                        } label: {
                            Text(emoji).font(.system(size: 30))
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(Brand.elevated, in: .capsule)
                .shadow(radius: 12)
            }
            .transition(.opacity)
        }
    }

    private func replyBanner(_ message: DisplayMessage) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "arrowshape.turn.up.left.fill").foregroundStyle(Brand.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text("Replying to \(message.author?.name ?? "Unknown")")
                    .font(.caption.weight(.semibold)).foregroundStyle(Brand.textSecondary)
                Text(message.content.isEmpty ? "attachment" : message.content)
                    .font(.caption2).foregroundStyle(Brand.textMuted).lineLimit(1)
            }
            Spacer()
            Button { withAnimation { replyingTo = nil } } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.textMuted)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Brand.surface)
    }

    private func isGrouped(at index: Int) -> Bool {
        guard index > 0 else { return false }
        let prev = model.messages[index - 1]
        let cur = model.messages[index]
        guard prev.authorId == cur.authorId, cur.replyToId == nil else { return false }
        guard let a = RelativeTime.date(from: prev.createdAt),
              let b = RelativeTime.date(from: cur.createdAt) else { return false }
        return b.timeIntervalSince(a) < 300
    }

    private func sendDraft() {
        let content = draft
        let reply = replyingTo?.id
        draft = ""
        withAnimation { replyingTo = nil }
        guard let uid = app.currentUserId else { return }
        Task { await model.send(content: content, authorId: uid, replyToId: reply) }
    }

    private func sendGif(_ gif: GiphyGif) {
        guard let uid = app.currentUserId, let url = gif.fullUrl else { return }
        let reply = replyingTo?.id
        withAnimation { replyingTo = nil }
        Task { await model.sendAttachment(OutgoingAttachment(url: url, type: "gif", key: nil),
                                          replyToId: reply, authorId: uid) }
    }

    private func uploadAndSend(_ item: PhotosPickerItem) async {
        guard let uid = app.currentUserId else { return }
        uploading = true
        let reply = replyingTo?.id
        defer { uploading = false; photoItem = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            let result = try await MediaService.uploadImage(data)
            withAnimation { replyingTo = nil }
            await model.sendAttachment(OutgoingAttachment(url: result.url, type: "image", key: result.key),
                                       replyToId: reply, authorId: uid)
        } catch {
            model.loadError = error.localizedDescription
        }
    }
}
