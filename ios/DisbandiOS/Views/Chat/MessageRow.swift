import SwiftUI

struct MessageRow: View {
    let message: DisplayMessage
    let isOwn: Bool
    let grouped: Bool
    var reactions: [ReactionSummary] = []
    var replyTo: DisplayMessage? = nil
    /// Who is reading, so a reply aimed at them can be marked.
    var currentUserId: String? = nil
    /// Tapping an @mention. The row does not resolve the name itself — the
    /// chat view owns the lookup and the card it opens.
    var onTapMention: (String) -> Void = { _ in }
    /// Lets the owner (or a role with manage_messages) remove someone else's
    /// message. The database has always permitted this; only the menu was
    /// limited to your own messages.
    var canModerate: Bool = false
    var onTapAuthor: (Profile) -> Void = { _ in }
    var onReact: () -> Void = {}
    var onReply: () -> Void = {}
    var onSpeak: () -> Void = {}
    var onDelete: () -> Void = {}
    var onToggleReaction: (String) -> Void = { _ in }

    @State private var dragOffset: CGFloat = 0
    /// The image or video opened full-screen from this row, if any.
    @State private var viewingMedia: ViewedMedia?
    /// The reaction whose reactor list is open, if any.
    @State private var showingReactorsFor: ReactedEmoji?

    private var authorName: String { message.author?.name ?? "Unknown" }

    /// The stored filename, or the last path component when one was never
    /// recorded — anything but a bare "Attachment".
    private func attachmentDisplayName(for url: URL) -> String {
        if let name = message.attachmentName, !name.isEmpty { return name }
        let last = url.lastPathComponent
        return last.isEmpty ? "File" : last
    }

    /// True when this message is aimed at the reader: it replies to one of
    /// their messages, or mentions them.
    private var pingedYou: Bool {
        guard let me = currentUserId, message.authorId != me else { return false }
        if let replyTo, replyTo.authorId == me { return true }
        return message.mentions?.contains(me) ?? false
    }

    var body: some View {
        ZStack(alignment: .trailing) {
            // Reply affordance revealed while swiping left.
            Image(systemName: "arrowshape.turn.up.left.fill")
                .foregroundStyle(Brand.accent)
                .opacity(min(1, Double(-dragOffset) / 55))
                .padding(.trailing, 24)

            content
                // A reply to your message is a ping — addressed at you as
                // directly as an @mention — and read exactly like ordinary
                // traffic until it was marked.
                .background(pingedYou ? Brand.idle.opacity(0.12) : Brand.surfaceRaised)
                .offset(x: dragOffset)
                .gesture(swipeToReply)
                .onTapGesture(count: 2) { onReact() }
                .contextMenu {
                    Button { onReply() } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
                    Button { onReact() } label: { Label("React", systemImage: "face.smiling") }
                    Button { onSpeak() } label: { Label("Speak Message", systemImage: "speaker.wave.2.fill") }
                    if isOwn || canModerate {
                        Button(role: .destructive) { onDelete() } label: {
                            Label(isOwn ? "Delete" : "Delete Message", systemImage: "trash")
                        }
                    }
                }
        }
        .fullScreenCover(item: $viewingMedia) { media in
            MediaViewer(url: media.url, kind: media.kind, fileName: message.attachmentName)
        }
        .sheet(item: $showingReactorsFor) { picked in
            ReactionDetailSheet(reactions: reactions, selected: picked.id)
                .presentationDetents([.medium, .large])
        }
    }

    private var content: some View {
        HStack(alignment: .top, spacing: 12) {
            if grouped {
                Color.clear.frame(width: 40)
            } else {
                Button { if let a = message.author { onTapAuthor(a) } } label: {
                    AvatarView(url: message.author?.avatarUrl, name: authorName, size: 40)
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 2) {
                if let replyTo { replyPreview(replyTo) }

                if !grouped {
                    HStack(spacing: 6) {
                        Text(authorName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(isOwn ? Brand.accent : Brand.textPrimary)
                            .onTapGesture { if let a = message.author { onTapAuthor(a) } }
                        Text(RelativeTime.short(message.createdAt))
                            .font(.caption2).foregroundStyle(Brand.textMuted)
                    }
                }

                if !message.content.isEmpty {
                    // Discord-style jumbo emoji: a message that is nothing
                    // but a handful of emoji renders large, because at body
                    // size a lone reaction emoji is nearly illegible.
                    let jumbo: CGFloat? = EmojiText.jumboSize(for: message.content)
                    let size = jumbo ?? UIFont.systemFontSize
                    let baseFont = UIFont.systemFont(ofSize: size)
                    let color = UIColor(message.pending ? Brand.textMuted : Brand.textPrimary)
                    Text(ChatMarkdown.render(message.content, baseFont: baseFont, baseColor: color,
                                             mentionColor: UIColor(Brand.accent)))
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .environment(\.openURL, OpenURLAction { url in
                            guard let name = ChatMarkdown.mentionedUsername(from: url) else {
                                return .systemAction
                            }
                            onTapMention(name)
                            return .handled
                        })
                }

                // Invites and link previews, so a shared server can be joined
                // from the message instead of read out as raw text.
                if !message.content.isEmpty {
                    MessageEmbeds(text: message.content)
                }

                attachment

                if message.pending {
                    Text("Sending…").font(.caption2).foregroundStyle(Brand.textMuted)
                } else if message.editedAt != nil {
                    Text("(edited)").font(.caption2).foregroundStyle(Brand.textMuted)
                }

                if !reactions.isEmpty { reactionChips }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        // Grouped rows are the same author continuing, so they stay tight — a
        // run of messages from one person should read as one block. A
        // non-grouped row is where the avatar and name reappear, i.e. the
        // speaker changed, and that boundary gets more room so the
        // conversation is easier to scan. iOS only; web/desktop is unchanged.
        .padding(.top, grouped ? 1 : 18)
        .contentShape(Rectangle())
    }

    // MARK: - Reply preview

    private func replyPreview(_ replied: DisplayMessage) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "arrowshape.turn.up.left.fill")
                .font(.caption2).foregroundStyle(Brand.textMuted)
            Text(replied.author?.name ?? "Unknown")
                .font(.caption2.weight(.semibold)).foregroundStyle(Brand.textMuted)
            Text(replied.content.isEmpty ? "attachment" : replied.content)
                .font(.caption2).foregroundStyle(Brand.textMuted)
                .lineLimit(1)
        }
        .padding(.bottom, 1)
    }

    // MARK: - Reaction chips

    private var reactionChips: some View {
        // Bigger than they were: at caption size the emoji was smaller than the
        // text around it and the chip was an awkward tap target.
        FlowLayout(spacing: 6) {
            ForEach(reactions) { r in
                Button { onToggleReaction(r.emoji) } label: {
                    HStack(spacing: 5) {
                        Text(r.emoji).font(.system(size: 16))
                        Text("\(r.count)").font(.footnote.weight(.semibold))
                            .foregroundStyle(r.reacted ? Brand.accent : Brand.textSecondary)
                    }
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(r.reacted ? Brand.accent.opacity(0.2) : Brand.elevated,
                                in: .capsule)
                    .overlay(Capsule().stroke(Brand.accent, lineWidth: r.reacted ? 1 : 0))
                }
                .buttonStyle(.plain)
                // No hover on a phone, so "who reacted" is a press and hold.
                .onLongPressGesture { showingReactorsFor = ReactedEmoji(id: r.emoji) }
                .accessibilityHint("Double tap to react, press and hold to see who reacted")
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Swipe

    private var swipeToReply: some Gesture {
        DragGesture(minimumDistance: 18)
            .onChanged { value in
                if value.translation.width < 0 {
                    dragOffset = max(value.translation.width, -80)
                }
            }
            .onEnded { value in
                if value.translation.width < -55 { onReply() }
                withAnimation(.spring(response: 0.3)) { dragOffset = 0 }
            }
    }

    // MARK: - Attachment

    @ViewBuilder private var attachment: some View {
        // Still uploading: show the upload, not a finished-looking attachment.
        if let progress = message.uploadProgress {
            AttachmentUploadCard(
                name: message.attachmentName ?? "File",
                size: message.attachmentSize,
                type: message.attachmentType,
                progress: progress,
            )
        } else if let urlString = message.attachmentUrl, let url = URL(string: urlString) {
            switch message.attachmentType {
            case .image, .gif:
                Button { viewingMedia = ViewedMedia(url: url, kind: .image) } label: {
                    RemoteImage(url: urlString, contentMode: .fit) {
                        RoundedRectangle(cornerRadius: 10).fill(Brand.elevated)
                            .frame(height: 160)
                            .overlay(ProgressView().tint(Brand.textMuted))
                    }
                    .frame(maxWidth: 260, maxHeight: 280)
                    .clipShape(.rect(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
                .accessibilityLabel("Open image")

            case .video:
                // Opened in the app rather than handed to Safari, so it can be
                // scrubbed, zoomed and saved without leaving the conversation.
                Button { viewingMedia = ViewedMedia(url: url, kind: .video) } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(Brand.accent)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(message.attachmentName ?? "Video")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Brand.textPrimary)
                                .lineLimit(1)
                            if let size = FileSizeFormat.string(message.attachmentSize) {
                                Text(size).font(.caption).foregroundStyle(Brand.textMuted)
                            }
                        }
                        Spacer(minLength: 8)
                    }
                    .padding(10)
                    .background(Brand.surface, in: .rect(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Brand.elevated, lineWidth: 1))
                    .frame(maxWidth: 300, alignment: .leading)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)

            default:
                AttachmentFileCard(
                    url: url,
                    name: attachmentDisplayName(for: url),
                    size: message.attachmentSize,
                )
            }
        }
    }
}

/// The emoji whose reactor list is open. A bare String cannot be a sheet item.
struct ReactedEmoji: Identifiable {
    let id: String
}

/// The image or video the viewer is currently showing.
struct ViewedMedia: Identifiable {
    let url: URL
    let kind: AttachmentType
    var id: String { "\(kind.rawValue):\(url.absoluteString)" }
}
