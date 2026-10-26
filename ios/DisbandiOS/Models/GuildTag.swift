import SwiftUI

/// A space's guild tag, as stored on `server_guild_tags` and worn through
/// `profile_guild_tags`. The web treats the badge as a doorway to the space,
/// so the same tag travels with the profile rather than being looked up from
/// whichever space a message happened to be read in.
enum GuildTagIcon: String, Codable, CaseIterable, Identifiable, Sendable {
    case star, heart, bolt, crown, skull, moon, leaf, flame

    var id: String { rawValue }

    var label: String {
        switch self {
        case .star: return "Star"
        case .heart: return "Heart"
        case .bolt: return "Bolt"
        case .crown: return "Crown"
        case .skull: return "Skull"
        case .moon: return "Moon"
        case .leaf: return "Leaf"
        case .flame: return "Flame"
        }
    }

    /// A new icon shipped on the web should not make an older client fail to
    /// decode a whole profile. Unknown values fall back to the star.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = GuildTagIcon(rawValue: raw) ?? .star
    }
}

struct GuildTag: Codable, Identifiable, Hashable, Sendable {
    let serverId: String
    var tag: String
    var icon: GuildTagIcon
    var color: String
    var isPrivate: Bool?

    var id: String { serverId }

    enum CodingKeys: String, CodingKey {
        case tag, icon, color
        case serverId = "server_id"
        case isPrivate = "is_private"
    }

    static func sanitize(_ raw: String) -> String {
        String(raw.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-") }.prefix(4))
    }

    static func error(_ raw: String) -> String? {
        let tag = sanitize(raw)
        if tag.isEmpty { return "Enter 1–4 letters, numbers, dots, underscores or hyphens." }
        if tag.count > 4 { return "Guild tags are 1–4 characters." }
        return nil
    }

    static func normalizedColor(_ raw: String) -> String? {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, value.allSatisfy(\.isHexDigit) else { return nil }
        return "#\(value.lowercased())"
    }

    /// Dark badges get white ink, light badges get near-black ink. Mirrors the
    /// web's `guildTagForeground`.
    var foreground: Color {
        guard let normalized = GuildTag.normalizedColor(color) else { return .white }
        let value = UInt32(normalized.dropFirst(), radix: 16) ?? 0x5865F2
        let channels = [Double((value >> 16) & 0xFF) / 255,
                        Double((value >> 8) & 0xFF) / 255,
                        Double(value & 0xFF) / 255].map { channel in
            channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        let luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
        return luminance > 0.179 ? Color(hex: 0x111214) : .white
    }

    @MainActor var backgroundColor: Color {
        Color(hexString: color) ?? Brand.accent
    }
}

struct GuildTagOption: Identifiable, Hashable, Sendable {
    var tag: GuildTag
    var serverName: String
    var serverIconUrl: String?
    var equipped: Bool

    var id: String { tag.serverId }
}

/// A row from `profile_guild_tags`. Kept separate because the table also has
/// the wearer's id, which the guild-tag model itself does not need.
struct ProfileGuildTagRow: Decodable, Sendable {
    let userId: String
    let serverId: String
    let tag: String
    let icon: String
    let color: String

    enum CodingKeys: String, CodingKey {
        case tag, icon, color
        case userId = "user_id"
        case serverId = "server_id"
    }

    var guildTag: GuildTag {
        GuildTag(serverId: serverId, tag: tag, icon: GuildTagIcon(rawValue: icon) ?? .star, color: color)
    }
}

/// The result of `get_my_guild_tags`.
struct GuildTagOptionRow: Decodable, Sendable {
    let serverId: String
    let serverName: String
    let serverIconUrl: String?
    let tag: String
    let icon: String
    let color: String
    let equipped: Bool
    let isPrivate: Bool?

    enum CodingKeys: String, CodingKey {
        case tag, icon, color, equipped
        case serverId = "server_id"
        case serverName = "server_name"
        case serverIconUrl = "server_icon_url"
        case isPrivate = "is_private"
    }

    var option: GuildTagOption {
        GuildTagOption(
            tag: GuildTag(serverId: serverId, tag: tag,
                          icon: GuildTagIcon(rawValue: icon) ?? .star,
                          color: color, isPrivate: isPrivate),
            serverName: serverName,
            serverIconUrl: serverIconUrl,
            equipped: equipped
        )
    }
}

/// The public card behind a guild tag. Private tags return only that flag.
struct GuildTagSpace: Decodable, Sendable {
    let isPrivate: Bool?
    let serverId: String?
    let name: String?
    let iconUrl: String?
    let bannerUrl: String?
    let description: String?
    let verified: Bool?
    let partner: Bool?
    let discoverable: Bool?
    let joined: Bool?
    let memberCount: Int?
    let onlineCount: Int?

    enum CodingKeys: String, CodingKey {
        case name, description, verified, partner, discoverable, joined
        case isPrivate = "private"
        case serverId = "server_id"
        case iconUrl = "icon_url"
        case bannerUrl = "banner_url"
        case memberCount = "member_count"
        case onlineCount = "online_count"
    }

    var isPrivateSpace: Bool { isPrivate == true }
}
