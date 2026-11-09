import Foundation

// Bot commands, bot buttons and forum posts, in the shapes the web uses
// (migrations 0198 and 0240).

/// Who ran the command a bot's message answers.
struct MessageInteraction: Codable, Hashable, Sendable {
    let id: String?
    let type: String?
    let name: String?
    let userId: String?
    let username: String?
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case id, type, name, username
        case userId = "user_id"
        case displayName = "display_name"
    }

    var who: String {
        let shown = displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return shown.isEmpty ? (username ?? "Someone") : shown
    }
}

struct MessageButton: Codable, Hashable, Sendable {
    var type: String = "button"
    var style: String = "secondary"
    var label: String = ""
    var customId: String?
    var url: String?
    var emoji: String?
    var disabled: Bool?

    enum CodingKeys: String, CodingKey {
        case type, style, label, url, emoji, disabled
        case customId = "custom_id"
    }

    /// Never throws: a button a bot shaped oddly shows blank rather than
    /// failing the whole conversation.
    init(from decoder: Decoder) throws {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        type = (try? c?.decodeIfPresent(String.self, forKey: .type)) ?? "button"
        style = (try? c?.decodeIfPresent(String.self, forKey: .style)) ?? "secondary"
        label = (try? c?.decodeIfPresent(String.self, forKey: .label)) ?? ""
        customId = try? c?.decodeIfPresent(String.self, forKey: .customId)
        url = try? c?.decodeIfPresent(String.self, forKey: .url)
        emoji = try? c?.decodeIfPresent(String.self, forKey: .emoji)
        disabled = try? c?.decodeIfPresent(Bool.self, forKey: .disabled)
    }
}

struct ActionRow: Codable, Hashable, Sendable {
    var type: String = "action_row"
    var components: [MessageButton] = []

    enum CodingKeys: String, CodingKey { case type, components }

    init(from decoder: Decoder) throws {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        type = (try? c?.decodeIfPresent(String.self, forKey: .type)) ?? "action_row"
        components = (try? c?.decodeIfPresent([MessageButton].self, forKey: .components)) ?? []
    }
}

/// A slash command offered in a space (space_bot_commands).
struct BotCommand: Codable, Hashable, Identifiable, Sendable {
    struct Choice: Codable, Hashable, Sendable {
        let name: String
        let value: ChoiceValue
    }

    /// Choices can be strings or numbers.
    enum ChoiceValue: Codable, Hashable, Sendable {
        case string(String)
        case number(Double)

        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let n = try? c.decode(Double.self) { self = .number(n) } else { self = .string(try c.decode(String.self)) }
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.singleValueContainer()
            switch self {
            case .string(let s): try c.encode(s)
            case .number(let n): try c.encode(n)
            }
        }

        var text: String {
            switch self {
            case .string(let s): return s
            case .number(let n): return n.rounded() == n ? String(Int(n)) : String(n)
            }
        }
    }

    struct Option: Codable, Hashable, Sendable {
        let name: String
        let description: String
        let type: String
        let required: Bool
        let choices: [Choice]?
    }

    let botId: String
    let botUserId: String
    let botName: String
    let botAvatarUrl: String?
    let name: String
    let description: String
    let options: [Option]

    var id: String { "\(botId)/\(name)" }

    enum CodingKeys: String, CodingKey {
        case name, description, options
        case botId = "bot_id"
        case botUserId = "bot_user_id"
        case botName = "bot_name"
        case botAvatarUrl = "bot_avatar_url"
    }
}

/// A post in a forum (get_forum_posts).
struct ForumPost: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let title: String
    let authorId: String?
    let tags: [String]?
    let pinned: Bool?
    let messageCount: Int?
    let lastMessageAt: String?
    let createdAt: String?
    let opening: String?
    let openingAttachment: String?

    enum CodingKeys: String, CodingKey {
        case id, title, tags, pinned, opening
        case authorId = "author_id"
        case messageCount = "message_count"
        case lastMessageAt = "last_message_at"
        case createdAt = "created_at"
        case openingAttachment = "opening_attachment"
    }
}

/// A list that drops entries it can't read, and reads as empty when the
/// value isn't a list at all, instead of failing the message around it.
struct LossyList<Element: Codable & Hashable & Sendable>: Codable, Hashable, Sendable {
    var items: [Element]

    init(from decoder: Decoder) throws {
        var out: [Element] = []
        if var c = try? decoder.unkeyedContainer() {
            while !c.isAtEnd {
                if let item = try? c.decode(Element.self) { out.append(item) }
                else { _ = try? c.decode(AnyDecodable.self) }
            }
        }
        items = out
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(items)
    }
}

/// A value that reads as nil when it's malformed.
struct Lenient<Value: Codable & Hashable & Sendable>: Codable, Hashable, Sendable {
    var value: Value?

    init(from decoder: Decoder) throws {
        value = try? Value(from: decoder)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(value)
    }
}

/// Skips over one value of any shape.
private struct AnyDecodable: Decodable {
    init(from decoder: Decoder) throws {}
}
