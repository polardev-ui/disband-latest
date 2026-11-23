import Foundation
import Supabase
import UIKit

/**
 Custom emoji and stickers from spaces, as on the web (`src/lib/expressions.ts`).

 Every space you're in is loaded once, so its emoji and stickers can be used
 in any chat. A message carries a custom emoji as `<:name:id>` (or
 `<a:name:id>`) and a sticker as an `attachments` entry of type "sticker"
 whose `url` is the sticker's id; anything from a space you're not in is
 looked up by id (migration 0283 lets anyone signed in read both).
 */
@MainActor
final class ExpressionStore: ObservableObject {
    static let shared = ExpressionStore()

    struct CustomEmoji: Decodable, Hashable, Identifiable {
        let id: Int
        let name: String
        let url: String
        let serverId: String
        var key: String { String(id) }
        var animated: Bool { url.range(of: #"\.(gif|webp|apng)(\?|$)"#, options: [.regularExpression, .caseInsensitive]) != nil }
        enum CodingKeys: String, CodingKey { case id, name, url; case serverId = "server_id" }
    }

    struct SpaceSticker: Decodable, Hashable, Identifiable {
        let id: String
        let serverId: String
        let name: String
        let tags: String?
        let url: String
        let format: String
        enum CodingKeys: String, CodingKey { case id, name, tags, url, format; case serverId = "server_id" }
    }

    struct Space: Decodable, Hashable, Identifiable {
        let id: String
        let name: String
        let iconUrl: String?
        enum CodingKeys: String, CodingKey { case id, name; case iconUrl = "icon_url" }
    }

    /// What the emoji sheet shows and the composer types: the name, with ~1,
    /// ~2… when another space already uses it (`:wave:`, `:wave~1:`).
    struct Choice: Hashable, Identifiable {
        let emoji: CustomEmoji
        let label: String
        var id: Int { emoji.id }
    }

    @Published private(set) var spaces: [Space] = []
    @Published private(set) var emojiBySpace: [String: [CustomEmoji]] = [:]
    @Published private(set) var stickersBySpace: [String: [SpaceSticker]] = [:]
    @Published private(set) var emojiById: [String: CustomEmoji] = [:]
    @Published private(set) var stickerById: [String: SpaceSticker] = [:]
    /// Decoded emoji images, for drawing inline in message text.
    @Published private(set) var images: [String: UIImage] = [:]

    private var missingEmoji = Set<String>()
    private var missingStickers = Set<String>()
    private var pendingEmoji = Set<String>()
    private var pendingStickers = Set<String>()
    private var loadingImages = Set<String>()
    private var flushScheduled = false
    private var loadedSpaces = false
    private var loadingSpaces = false

    private var client: SupabaseClient { SupabaseManager.client }

    // MARK: - Your spaces

    /// Load the emoji and stickers of every space you're in (once; `force` reloads).
    func loadMySpaces(force: Bool = false) async {
        if loadingSpaces || (loadedSpaces && !force) { return }
        guard let userId = client.auth.currentUser?.id.uuidString.lowercased() else { return }
        loadingSpaces = true
        defer { loadingSpaces = false }
        struct Membership: Decodable { let serverId: String; enum CodingKeys: String, CodingKey { case serverId = "server_id" } }
        do {
            let memberships: [Membership] = try await client.from("server_members")
                .select("server_id").eq("user_id", value: userId).execute().value
            let ids = Array(Set(memberships.map(\.serverId)))
            guard !ids.isEmpty else { loadedSpaces = true; return }
            async let spaceRows: [Space] = client.from("servers").select("id, name, icon_url")
                .in("id", values: ids).order("created_at").execute().value
            async let emojiRows: [CustomEmoji] = client.from("custom_emoji").select("id, name, url, server_id")
                .in("server_id", values: ids).order("name").execute().value
            // An empty list until migration 0283 is applied.
            let stickerRows: [SpaceSticker] = (try? await client.from("server_stickers")
                .select("id, server_id, name, tags, url, format")
                .in("server_id", values: ids).order("created_at").execute().value) ?? []
            let (s, e) = try await (spaceRows, emojiRows)
            spaces = s
            emojiBySpace = Dictionary(grouping: e, by: \.serverId)
            stickersBySpace = Dictionary(grouping: stickerRows, by: \.serverId)
            for row in e { emojiById[row.key] = row }
            for row in stickerRows { stickerById[row.id] = row }
            loadedSpaces = true
        } catch {
            // Offline or signed out: try again next time.
        }
    }

    /// Sticker packs every build ships with, as on the web (`BUILT_IN_PACKS` in
    /// `src/lib/stickers.ts`). The art is the animated WebP the website serves.
    static let builtInPacks: [(space: Space, stickers: [SpaceSticker])] = {
        let base = "https://www.disband.dev/stickers"
        func pack(_ id: String, _ name: String, _ stickers: [(id: String, name: String, tags: String)]) -> (space: Space, stickers: [SpaceSticker]) {
            let list = stickers.map {
                SpaceSticker(id: $0.id, serverId: "builtin:\(id)", name: $0.name, tags: $0.tags,
                             url: "\(base)/\(id)/\($0.id).webp", format: "image")
            }
            return (Space(id: "builtin:\(id)", name: name, iconUrl: list.first?.url), list)
        }
        return [
            pack("spectre", "Spectre", [
                ("spectre-hello", "Hello", "hello hi hey wave greetings 👋"),
                ("spectre-lol", "LOL", "lol laugh haha funny lmao 😂"),
                ("spectre-sad", "Sad", "sad cry crying tears upset 😢 😭"),
                ("spectre-love", "Love", "love heart hearts crush adore 😍 ❤️"),
                ("spectre-party", "Party", "party celebrate yay hype confetti jump 🎉"),
                ("spectre-typing", "Typing", "typing type keyboard laptop mash busy working coding ⌨️ 💻"),
                ("spectre-sleepy", "Sleepy", "sleepy sleep tired zzz night goodnight bed 😴 💤"),
                ("spectre-thinking", "Hmm", "hmm think thinking wonder confused question 🤔"),
                ("spectre-shocked", "Shocked", "shocked shock omg wow surprised scared what 😱 😮"),
                ("spectre-angry", "Angry", "angry mad rage furious grr 😠 😡 💢"),
                ("spectre-cool", "Cool", "cool sunglasses shades chill swag 😎"),
                ("spectre-dance", "Dance", "dance dancing groove vibe music disco 🕺 💃 🎶"),
                ("spectre-shrug", "Shrug", "shrug idk dunno whatever meh 🤷"),
            ]),
            pack("wisp", "Wisp", [
                ("wisp-hi", "Hi", "hi hello hey wave 👋"),
                ("wisp-yay", "Yay", "yay hooray celebrate excited jump 🎉 ✨"),
                ("wisp-thanks", "Thanks", "thanks thank you ty grateful bow 🙏"),
                ("wisp-shy", "Shy", "shy blush embarrassed cute flustered 😳 ☺️"),
                ("wisp-sad", "Sad", "sad cry crying tears upset 😢 😭"),
                ("wisp-love", "Love", "love heart hug adore crush ❤️ 🥰"),
                ("wisp-please", "Please", "please pleading beg pretty please puppy eyes 🥺"),
                ("wisp-pout", "Pout", "pout hmph angry mad sulk grumpy 😤 😠"),
                ("wisp-sleepy", "Sleepy", "sleepy sleep tired zzz night goodnight 😴 💤"),
                ("wisp-wink", "Wink", "wink flirt cheeky playful 😉"),
            ]),
        ]
    }()

    private static let builtInById: [String: SpaceSticker] = Dictionary(
        uniqueKeysWithValues: builtInPacks.flatMap(\.stickers).map { ($0.id, $0) })

    /// The built-in packs, then spaces that have stickers in your space list's order.
    var stickerSpaces: [(space: Space, stickers: [SpaceSticker])] {
        Self.builtInPacks + spaces.compactMap { space in
            guard let list = stickersBySpace[space.id], !list.isEmpty else { return nil }
            return (space, list)
        }
    }

    /// Every custom emoji you can use, with labels made unique.
    var choices: [Choice] {
        var seen: [String: Int] = [:]
        var out: [Choice] = []
        for space in spaces {
            for emoji in emojiBySpace[space.id] ?? [] {
                let key = emoji.name.lowercased()
                let n = seen[key, default: 0]
                seen[key] = n + 1
                out.append(Choice(emoji: emoji, label: n == 0 ? emoji.name : "\(emoji.name)~\(n)"))
            }
        }
        return out
    }

    // MARK: - Lookups by id

    func emoji(id: String) -> CustomEmoji? {
        if let hit = emojiById[id] { return hit }
        if !missingEmoji.contains(id) { pendingEmoji.insert(id); scheduleFlush() }
        return nil
    }

    func isEmojiMissing(_ id: String) -> Bool { missingEmoji.contains(id) }

    /// A sticker by id; nil while it's looked up, and also when it's gone (see `isStickerMissing`).
    func sticker(id: String) -> SpaceSticker? {
        if let hit = Self.builtInById[id] ?? stickerById[id] { return hit }
        if !missingStickers.contains(id) { pendingStickers.insert(id); scheduleFlush() }
        return nil
    }

    func isStickerMissing(_ id: String) -> Bool { missingStickers.contains(id) }

    /// The emoji's picture, sized for text; loads it the first time it's asked for.
    func image(for emoji: CustomEmoji) -> UIImage? {
        if let img = images[emoji.key] { return img }
        guard !loadingImages.contains(emoji.key), let url = URL(string: emoji.url) else { return nil }
        loadingImages.insert(emoji.key)
        Task {
            defer { loadingImages.remove(emoji.key) }
            guard let (data, _) = try? await URLSession.shared.data(from: url),
                  let image = UIImage(data: data) else { return }
            images[emoji.key] = image
        }
        return nil
    }

    private func scheduleFlush() {
        guard !flushScheduled else { return }
        flushScheduled = true
        Task { @MainActor in
            flushScheduled = false
            let emojiIds = Array(pendingEmoji).filter { Int($0) != nil }
            let stickerIds = Array(pendingStickers).filter { UUID(uuidString: $0) != nil }
            let allEmoji = pendingEmoji, allStickers = pendingStickers
            pendingEmoji.removeAll()
            pendingStickers.removeAll()
            if !emojiIds.isEmpty {
                let rows: [CustomEmoji] = (try? await client.from("custom_emoji").select("id, name, url, server_id")
                    .in("id", values: emojiIds).execute().value) ?? []
                for row in rows { emojiById[row.key] = row }
            }
            for id in allEmoji where emojiById[id] == nil { missingEmoji.insert(id) }
            if !stickerIds.isEmpty {
                let rows: [SpaceSticker] = (try? await client.from("server_stickers")
                    .select("id, server_id, name, tags, url, format")
                    .in("id", values: stickerIds).execute().value) ?? []
                for row in rows { stickerById[row.id] = row }
            }
            for id in allStickers where stickerById[id] == nil { missingStickers.insert(id) }
            objectWillChange.send()
        }
    }

    // MARK: - Message text

    /// `:name:` and `:name~1:` in a message about to be sent become `<:name:id>` (code left alone).
    func encode(_ text: String) -> String {
        guard text.contains(":") else { return text }
        let byLabel = Dictionary(choices.map { ($0.label.lowercased(), $0.emoji) }, uniquingKeysWith: { a, _ in a })
        guard !byLabel.isEmpty,
              let regex = try? NSRegularExpression(pattern: #"(?<![<\w])(?<!<a):([a-zA-Z0-9_]{2,32}(?:~\d+)?):(?!\d)"#)
        else { return text }
        // Split out code spans and blocks so they're left as typed.
        var out = ""
        for (i, part) in Self.splitCode(text).enumerated() {
            if i % 2 == 1 { out += part; continue }
            let ns = part as NSString
            var last = 0
            for m in regex.matches(in: part, range: NSRange(location: 0, length: ns.length)) {
                let label = ns.substring(with: m.range(at: 1))
                guard let emoji = byLabel[label.lowercased()] else { continue }
                out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
                out += "<\(emoji.animated ? "a" : ""):\(emoji.name):\(emoji.id)>"
                last = m.range.location + m.range.length
            }
            out += ns.substring(from: last)
        }
        return out
    }

    /// The other way, for editing: `<:name:id>` back to what you'd type.
    func decode(_ text: String) -> String {
        let byId = Dictionary(choices.map { ($0.emoji.key, $0.label) }, uniquingKeysWith: { a, _ in a })
        guard let regex = try? NSRegularExpression(pattern: #"<a?:([a-zA-Z0-9_]{2,32}):(\d+)>"#) else { return text }
        let ns = text as NSString
        var out = ""
        var last = 0
        for m in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
            let id = ns.substring(with: m.range(at: 2))
            out += ":\(byId[id] ?? ns.substring(with: m.range(at: 1))):"
            last = m.range.location + m.range.length
        }
        return out + ns.substring(from: last)
    }

    /// Text and code alternate: even indices are text, odd are code spans/blocks.
    static func splitCode(_ text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: "(```[\\s\\S]*?```|`[^`\\n]*`)") else { return [text] }
        let ns = text as NSString
        var parts: [String] = []
        var last = 0
        for m in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            parts.append(ns.substring(with: NSRange(location: last, length: m.range.location - last)))
            parts.append(ns.substring(with: m.range))
            last = m.range.location + m.range.length
        }
        parts.append(ns.substring(from: last))
        return parts
    }

    /// For one-line previews: `<:name:id>` reads as `:name:`.
    static func plain(_ text: String) -> String {
        text.replacingOccurrences(of: #"<a?:([a-zA-Z0-9_]{2,32}):\d+>"#, with: ":$1:", options: .regularExpression)
    }
}
