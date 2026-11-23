import SwiftUI
import UIKit

// MARK: - Custom emoji in message text

/**
 Message text with custom emoji (`<:name:id>`) drawn inline, as on the web.

 `Text` can't show pictures inside an `AttributedString`, so the message is
 split at each emoji: the text runs go through the normal markdown renderer
 and the emoji are `Text(Image)` pieces joined between them. Until an emoji's
 picture has loaded (or if it's gone) its `:name:` shows instead.
 */
enum CustomEmojiText {
    static let token = try! NSRegularExpression(pattern: #"<a?:([a-zA-Z0-9_]{2,32}):(\d+)>"#)

    /// A message of only custom emoji (up to three) shows them large.
    static func jumboSize(for content: String) -> CGFloat? {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = NSRange(location: 0, length: (trimmed as NSString).length)
        let count = token.numberOfMatches(in: trimmed, range: range)
        guard count > 0, count <= 3 else { return nil }
        let rest = token.stringByReplacingMatches(in: trimmed, range: range, withTemplate: "")
        return rest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 48 : nil
    }

    @MainActor
    static func text(_ content: String, store: ExpressionStore, font: UIFont,
                     render: (String) -> AttributedString) -> Text {
        let full = NSRange(location: 0, length: (content as NSString).length)
        guard content.contains("<:") || content.contains("<a:"),
              token.firstMatch(in: content, range: full) != nil
        else { return Text(render(content)) }

        var result = Text("")
        var buffer = ""
        let height = (font.lineHeight * 1.15).rounded()
        for (i, part) in ExpressionStore.splitCode(content).enumerated() {
            if i % 2 == 1 { buffer += part; continue }
            let ns = part as NSString
            var last = 0
            for m in token.matches(in: part, range: NSRange(location: 0, length: ns.length)) {
                buffer += ns.substring(with: NSRange(location: last, length: m.range.location - last))
                last = m.range.location + m.range.length
                let name = ns.substring(with: m.range(at: 1))
                let id = ns.substring(with: m.range(at: 2))
                if let emoji = store.emoji(id: id), let image = store.image(for: emoji) {
                    if !buffer.isEmpty { result = result + Text(render(buffer)); buffer = "" }
                    result = result + Text(Image(uiImage: scaled(image, key: emoji.key, height: height))
                        .renderingMode(.original))
                        .baselineOffset(font.descender)
                } else {
                    buffer += ":\(name):"
                }
            }
            buffer += ns.substring(from: last)
        }
        if !buffer.isEmpty { result = result + Text(render(buffer)) }
        return result
    }

    private static var scaledCache: [String: UIImage] = [:]

    /// `Text(Image)` draws at the picture's own size, so it's drawn to the line height first.
    @MainActor
    private static func scaled(_ image: UIImage, key: String, height: CGFloat) -> UIImage {
        let cacheKey = "\(key)@\(height)"
        if let hit = scaledCache[cacheKey] { return hit }
        let source = image.images?.first ?? image
        let ratio = source.size.height > 0 ? source.size.width / source.size.height : 1
        let size = CGSize(width: min(height * ratio, height * 3), height: height)
        let out = UIGraphicsImageRenderer(size: size).image { _ in
            source.draw(in: CGRect(origin: .zero, size: size))
        }
        scaledCache[cacheKey] = out
        return out
    }
}

// MARK: - A sticker in chat

/// A sticker sent in chat: 160pt with no frame, like the web. GIF, APNG and
/// animated WebP stickers animate. One that can't be found shows its name.
struct StickerMessageView: View {
    let id: String
    let name: String?
    @ObservedObject private var store = ExpressionStore.shared

    var body: some View {
        Group {
            if let sticker = store.sticker(id: id) {
                RemoteImage(url: sticker.url, contentMode: .fit, placeholder: { Color.clear },
                            maxPixelSize: 320, maxFrames: 60)
                    .accessibilityLabel("\(sticker.name) sticker")
            } else if store.isStickerMissing(id) {
                VStack(spacing: 6) {
                    Image(systemName: "face.smiling")
                        .font(.system(size: 30))
                        .foregroundStyle(Brand.textMuted)
                    Text(name ?? "Sticker")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Brand.textSecondary)
                    Text("This sticker isn't available.")
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.textMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(10)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Brand.textMuted.opacity(0.4),
                                                                          style: StrokeStyle(lineWidth: 2, dash: [6, 4])))
            } else {
                Color.clear
            }
        }
        .frame(width: 160, height: 160)
    }
}

// MARK: - Picker

/**
 Stickers and custom emoji from every space you're in, like the web's sticker
 and emoji pickers. A sticker sends straight away; an emoji goes into the
 message as `:name:` (sent as `<:name:id>`, so it shows in any chat).
 */
struct ExpressionPickerSheet: View {
    enum Tab: String, CaseIterable { case stickers = "Stickers", emoji = "Emoji" }

    var onSticker: (ExpressionStore.SpaceSticker) -> Void
    var onEmoji: (String) -> Void
    @State var tab: Tab = .stickers
    @State private var query = ""
    @ObservedObject private var store = ExpressionStore.shared
    @Environment(\.dismiss) private var dismiss

    private let stickerColumns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)
    private let emojiColumns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $tab) {
                    ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

                ScrollView {
                    // Lazy, so a long list only draws what's on screen.
                    LazyVStack(alignment: .leading, spacing: 14, pinnedViews: [.sectionHeaders]) {
                        if tab == .stickers { stickerSections } else { emojiSections }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 20)
                }
            }
            .background(Brand.background)
            .navigationTitle(tab.rawValue)
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: tab == .stickers ? "Find the perfect sticker" : "Find the perfect emoji")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .task { await store.loadMySpaces() }
        }
        .presentationDetents([.medium, .large])
    }

    private var q: String { query.trimmingCharacters(in: .whitespaces).lowercased() }

    @ViewBuilder private var stickerSections: some View {
        let groups = store.stickerSpaces.map { group in
            (group.space, group.stickers.filter { s in
                q.isEmpty || s.name.lowercased().contains(q) || (s.tags ?? "").lowercased().contains(q)
            })
        }.filter { !$0.1.isEmpty }
        if groups.isEmpty {
            empty(q.isEmpty ? "No stickers yet. A space's owner can add them in its settings."
                            : "No stickers match “\(query)”.")
        }
        ForEach(groups, id: \.0.id) { space, stickers in
            Section {
                LazyVGrid(columns: stickerColumns, spacing: 8) {
                    ForEach(stickers) { sticker in
                        Button {
                            Haptics.tap()
                            onSticker(sticker)
                            dismiss()
                        } label: {
                            RemoteImage(url: sticker.url, contentMode: .fit, placeholder: { Color.clear },
                                        maxPixelSize: 240, maxFrames: 50)
                                .aspectRatio(1, contentMode: .fit)
                                .padding(4)
                        }
                        .buttonStyle(PressScaleStyle(scale: 0.92))
                        .accessibilityLabel(sticker.name)
                    }
                }
            } header: { header(space) }
        }
    }

    @ViewBuilder private var emojiSections: some View {
        let choices = store.choices.filter { q.isEmpty || $0.label.lowercased().contains(q) }
        let bySpace = Dictionary(grouping: choices, by: \.emoji.serverId)
        let spaces = store.spaces.filter { bySpace[$0.id] != nil }
        if spaces.isEmpty {
            empty(q.isEmpty ? "None of your spaces have custom emoji yet."
                            : "No emoji match “\(query)”.")
        }
        ForEach(spaces) { space in
            Section {
                LazyVGrid(columns: emojiColumns, spacing: 6) {
                    ForEach(bySpace[space.id] ?? []) { choice in
                        Button {
                            Haptics.tap()
                            onEmoji(":\(choice.label):")
                            dismiss()
                        } label: {
                            RemoteImage(url: choice.emoji.url, contentMode: .fit) { Color.clear }
                                .frame(width: 34, height: 34)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PressScaleStyle(scale: 0.9))
                        .accessibilityLabel(":\(choice.label):")
                    }
                }
            } header: { header(space) }
        }
    }

    private func header(_ space: ExpressionStore.Space) -> some View {
        HStack(spacing: 8) {
            RemoteImage(url: space.iconUrl, contentMode: .fill, placeholder: {
                Text(String(space.name.prefix(2)))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Brand.textPrimary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Brand.elevated)
            }, maxPixelSize: 66, maxFrames: 30)
            .frame(width: 22, height: 22)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text(space.name)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.textSecondary)
            Spacer()
        }
        .padding(.vertical, 6)
        .background(Brand.background)
    }

    private func empty(_ message: String) -> some View {
        Text(message)
            .font(.system(size: 14))
            .foregroundStyle(Brand.textMuted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 40)
    }
}
