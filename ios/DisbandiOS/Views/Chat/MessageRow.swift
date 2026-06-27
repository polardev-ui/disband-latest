import SwiftUI

struct MessageRow: View {
    let message: DisplayMessage
    let isOwn: Bool
    let grouped: Bool
    var reactions: [ReactionSummary] = []
    var replyTo: DisplayMessage? = nil
    var onTapAuthor: (Profile) -> Void = { _ in }
    var onReact: () -> Void = {}
    var onReply: () -> Void = {}
    var onSpeak: () -> Void = {}
    var onDelete: () -> Void = {}
    var onToggleReaction: (String) -> Void = { _ in }

    @State private var dragOffset: CGFloat = 0

    private var authorName: String { message.author?.name ?? "Unknown" }

    var body: some View {
        ZStack(alignment: .trailing) {
            // Reply affordance revealed while swiping left.
            Image(systemName: "arrowshape.turn.up.left.fill")
                .foregroundStyle(Brand.accent)
                .opacity(min(1, Double(-dragOffset) / 55))
                .padding(.trailing, 24)

            content
                .background(Brand.surfaceRaised)
                .offset(x: dragOffset)
                .gesture(swipeToReply)
                .onTapGesture(count: 2) { onReact() }
                .contextMenu {
                    Button { onReply() } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
                    Button { onReact() } label: { Label("React", systemImage: "face.smiling") }
                    Button { onSpeak() } label: { Label("Speak Message", systemImage: "speaker.wave.2.fill") }
                    if isOwn {
                        Button(role: .destructive) { onDelete() } label: {
                            Label("Delete", systemImage: "trash")
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
                    Text(message.content)
                        .font(.body)
                        .foregroundStyle(message.pending ? Brand.textMuted : Brand.textPrimary)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
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
        .padding(.top, grouped ? 1 : 8)
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
