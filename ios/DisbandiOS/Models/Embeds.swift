import Foundation

/**
 A rich embed, in Discord's shape: what webhooks and bots post (a GitHub
 commit card, a build status, an alert). The server validates and trims these
 before they are stored, so the client only has to draw them.
 */
struct MessageEmbed: Codable, Hashable, Sendable {
    struct Media: Codable, Hashable, Sendable { let url: String }
    struct Footer: Codable, Hashable, Sendable {
        let text: String
        let iconUrl: String?
        enum CodingKeys: String, CodingKey { case text; case iconUrl = "icon_url" }
    }
    struct Author: Codable, Hashable, Sendable {
        let name: String
        let url: String?
        let iconUrl: String?
        enum CodingKeys: String, CodingKey { case name, url; case iconUrl = "icon_url" }
    }
    struct Field: Codable, Hashable, Sendable {
        let name: String
        let value: String
        let inline: Bool?
    }

    let title: String?
    let description: String?
    let url: String?
    /// 0xRRGGBB as an integer, like Discord.
    let color: Int?
    let timestamp: String?
    let footer: Footer?
    let image: Media?
    let thumbnail: Media?
    let author: Author?
    let fields: [Field]?
}

/// Who a webhook message says it is from: the webhook's name and picture, or
/// the per-message override the caller sent.
struct MessageWebhook: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let avatarUrl: String?
    enum CodingKeys: String, CodingKey { case id, name; case avatarUrl = "avatar_url" }
}
