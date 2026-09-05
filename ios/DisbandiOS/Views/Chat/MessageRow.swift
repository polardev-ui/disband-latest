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

    private var authorName: String { message.author?.name ?? "Unknown" }

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
        FlowLayout(spacing: 6) {
            ForEach(reactions) { r in
                Button { onToggleReaction(r.emoji) } label: {
                    HStack(spacing: 4) {
                        Text(r.emoji).font(.caption)
                        Text("\(r.count)").font(.caption2.weight(.semibold))
                            .foregroundStyle(r.reacted ? Brand.accent : Brand.textSecondary)
                    }
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(r.reacted ? Brand.accent.opacity(0.2) : Brand.elevated,
                                in: .capsule)
                    .overlay(Capsule().stroke(Brand.accent, lineWidth: r.reacted ? 1 : 0))
                }
                .buttonStyle(.plain)
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
        if let urlString = message.attachmentUrl, let url = URL(string: urlString) {
            switch message.attachmentType {
            case .image, .gif:
                RemoteImage(url: urlString, contentMode: .fit) {
                    RoundedRectangle(cornerRadius: 10).fill(Brand.elevated)
                        .frame(height: 160)
                        .overlay(ProgressView().tint(Brand.textMuted))
                }
                .frame(maxWidth: 260, maxHeight: 280)
                .clipShape(.rect(cornerRadius: 10))
                .padding(.top, 4)
            case .video:
                Link(destination: url) {
                    Label("View video", systemImage: "play.rectangle.fill").font(.subheadline)
                }.padding(.top, 4)
            default:
                Link(destination: url) {
                    Label("Attachment", systemImage: "doc.fill").font(.subheadline)
                }.padding(.top, 4)
            }
        }
    }
}

/// Simple wrapping HStack for reaction chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > maxWidth {
                x = 0; y += rowHeight + spacing; rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX {
                x = bounds.minX; y += rowHeight + spacing; rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
