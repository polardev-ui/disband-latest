import SwiftUI

/**
 One rich embed (from a webhook or a bot), drawn the way Discord's iOS app
 draws them: a rounded card with the embed's colour as a bar down its left
 edge, then author, title, description, fields, image and footer.
 */
struct RichEmbedView: View {
    let embed: MessageEmbed
    var onTapMention: (String) -> Void = { _ in }

    @State private var viewing: ViewedMedia?
    @Environment(\.openURL) private var openURL

    /// Discord's link blue, which reads on every palette.
    private static let linkBlue = Color(hex: 0x00A8FC)

    private var barColor: Color {
        if let c = embed.color { return Color(hex: UInt32(truncatingIfNeeded: c)) }
        return Brand.divider
    }

    var body: some View {
        HStack(spacing: 0) {
            barColor.frame(width: 4)

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        if let author = embed.author { authorRow(author) }
                        if let title = embed.title { titleView(title) }
                        if let description = embed.description, !description.isEmpty {
                            markdown(description, size: 15)
                        }
                    }
                    Spacer(minLength: 0)
                    if let thumb = embed.thumbnail?.url {
                        RemoteImage(url: thumb, contentMode: .fill) { Brand.elevated }
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .onTapGesture { open(thumb) }
                    }
                }

                if let fields = embed.fields, !fields.isEmpty { fieldsView(fields) }

                if let image = embed.image?.url {
                    RemoteImage(url: image, contentMode: .fit) {
                        RoundedRectangle(cornerRadius: 8).fill(Brand.elevated).frame(height: 140)
                    }
                    .frame(maxWidth: .infinity, maxHeight: 260, alignment: .leading)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .onTapGesture { open(image) }
                }

                if embed.footer != nil || embed.timestamp != nil { footerRow }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
        }
        .frame(maxWidth: 420, alignment: .leading)
        .background(Brand.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Brand.divider.opacity(0.6), lineWidth: 0.5)
        )
        .padding(.top, 6)
        .fullScreenCover(item: $viewing) { media in
            MediaViewer(url: media.url, kind: media.kind)
        }
    }

    private func authorRow(_ author: MessageEmbed.Author) -> some View {
        HStack(spacing: 8) {
            if let icon = author.iconUrl {
                RemoteImage(url: icon, contentMode: .fill) { Circle().fill(Brand.elevated) }
                    .frame(width: 20, height: 20)
                    .clipShape(Circle())
            }
            Text(author.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.textPrimary)
                .lineLimit(1)
        }
        .contentShape(Rectangle())
        .onTapGesture { if let url = author.url.flatMap(URL.init(string:)) { openURL(url) } }
    }

    @ViewBuilder private func titleView(_ title: String) -> some View {
        if let link = embed.url.flatMap(URL.init(string:)) {
            Button { openURL(link) } label: {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Self.linkBlue)
                    .multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
        } else {
            Text(title)
                .font(.body.weight(.semibold))
                .foregroundStyle(Brand.textPrimary)
        }
    }

    private func markdown(_ text: String, size: CGFloat) -> some View {
        Text(ChatMarkdown.render(text, baseFont: .systemFont(ofSize: size),
                                 baseColor: UIColor(Brand.textSecondary),
                                 mentionColor: UIColor(Brand.accent)))
            .fixedSize(horizontal: false, vertical: true)
            .environment(\.openURL, OpenURLAction { url in
                guard let name = ChatMarkdown.mentionedUsername(from: url) else { return .systemAction }
                onTapMention(name)
                return .handled
            })
    }

    /// Inline fields sit two to a row on a phone; the rest take a full row.
    private func fieldsView(_ fields: [MessageEmbed.Field]) -> some View {
        let rows = Self.fieldRows(fields)
        return VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: 12) {
                    ForEach(Array(row.enumerated()), id: \.offset) { _, field in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(field.name)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Brand.textPrimary)
                            markdown(field.value, size: 14)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    static func fieldRows(_ fields: [MessageEmbed.Field]) -> [[MessageEmbed.Field]] {
        var rows: [[MessageEmbed.Field]] = []
        var current: [MessageEmbed.Field] = []
        for field in fields {
            if field.inline == true {
                current.append(field)
                if current.count == 2 { rows.append(current); current = [] }
            } else {
                if !current.isEmpty { rows.append(current); current = [] }
                rows.append([field])
            }
        }
        if !current.isEmpty { rows.append(current) }
        return rows
    }

    private var footerRow: some View {
        HStack(spacing: 6) {
            if let icon = embed.footer?.iconUrl {
                RemoteImage(url: icon, contentMode: .fill) { Circle().fill(Brand.elevated) }
                    .frame(width: 16, height: 16)
                    .clipShape(Circle())
            }
            Text(footerText)
                .font(.caption)
                .foregroundStyle(Brand.textMuted)
                .lineLimit(2)
        }
    }

    private var footerText: String {
        let parts = [embed.footer?.text, embed.timestamp.map { RelativeTime.short($0) }]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        return parts.joined(separator: " • ")
    }

    private func open(_ string: String) {
        guard let url = URL(string: string) else { return }
        viewing = ViewedMedia(url: url, kind: url.pathExtension.lowercased() == "gif" ? .gif : .image)
    }
}
