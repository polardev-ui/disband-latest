import Foundation

/// Emoji-only message detection, for Discord-style "jumbo" rendering.
enum EmojiText {
    /// Largest number of emoji that still get enlarged. Past this the message
    /// reads as a string of glyphs rather than a single reaction, and jumbo
    /// sizing just makes it wrap awkwardly.
    private static let jumboLimit = 3

    /// Point size to render `content` at when it is nothing but emoji, or nil
    /// when it should use the normal body font.
    ///
    /// The size steps down as the count rises so three emoji still fit on one
    /// line on the narrowest phone.
    static func jumboSize(for content: String) -> CGFloat? {
        guard let count = emojiOnlyCount(content) else { return nil }
        switch count {
        case 1: return 52
        case 2: return 44
        case 3: return 36
        default: return nil
        }
    }

    /// Number of emoji in `content` if it consists *only* of emoji (whitespace
    /// ignored), otherwise nil.
    static func emojiOnlyCount(_ content: String) -> Int? {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        var count = 0
        for character in trimmed {
            if character.isWhitespace { continue }
            guard character.isEmojiCharacter else { return nil }
            count += 1
            if count > jumboLimit { return nil }
        }
        return count == 0 ? nil : count
    }
}

private extension Character {
    /// True for emoji, including multi-scalar sequences (flags, skin tones,
    /// ZWJ families) which `isEmoji` alone gets wrong.
    ///
    /// `unicodeScalars.first!.properties.isEmoji` is true for plain ASCII
    /// digits — "1" is emoji-presentable via the keycap sequence — so a bare
    /// `isEmoji` check would treat "123" as an emoji-only message.
    var isEmojiCharacter: Bool {
        guard let first = unicodeScalars.first else { return false }
        if unicodeScalars.count > 1 {
            // A sequence is emoji if any scalar requests emoji presentation.
            return unicodeScalars.contains { $0.properties.isEmojiPresentation }
                || unicodeScalars.contains { $0.value == 0xFE0F }
        }
        return first.properties.isEmojiPresentation
    }
}
