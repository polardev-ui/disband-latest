import Foundation
import Supabase

enum ProfileService {
    private static var client: SupabaseClient { SupabaseManager.client }

    private static var currentUserId: String? {
        client.auth.currentUser?.id.uuidString.lowercased()
    }

    static func update(displayName: String, bio: String) async {
        guard let uid = currentUserId else { return }
        let payload = ProfileUpdate(
            displayName: displayName.trimmingCharacters(in: .whitespaces),
            bio: bio.trimmingCharacters(in: .whitespaces)
        )
        do {
            try await client.from("profiles").update(payload).eq("id", value: uid).execute()
        } catch {
            print("ProfileService.update error: \(error)")
        }
    }

    /// Pronouns, shown beside your name. Empty clears them.
    static func updatePronouns(_ pronouns: String) async throws {
        guard let uid = currentUserId else { return }
        let value = pronouns.trimmingCharacters(in: .whitespacesAndNewlines)
        try await client.from("profiles")
            .update(NullableFields(["pronouns": value.isEmpty ? nil : String(value.prefix(40))]))
            .eq("id", value: uid).execute()
    }

    /// The custom status line and when it lapses (nil = never). An empty note
    /// clears both, exactly as the web does.
    static func updateStatusNote(_ note: String, expiresAt: Date?) async throws {
        guard let uid = currentUserId else { return }
        let value = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let expiry = value.isEmpty ? nil : expiresAt.map { ISO8601DateFormatter().string(from: $0) }
        try await client.from("profiles")
            .update(NullableFields([
                "status_note": value.isEmpty ? nil : String(value.prefix(60)),
                "status_expires_at": expiry,
            ]))
            .eq("id", value: uid).execute()
    }

    /// Persist the theme choice so it follows the user to the desktop app,
    /// which reads the same `profiles.theme` column.
    static func updateTheme(_ theme: String) async throws {
        guard let uid = currentUserId else { return }
        try await client.from("profiles")
            .update(ThemeUpdate(theme: theme))
            .eq("id", value: uid)
            .execute()
    }

    static func updateAccent(color1: String?, color2: String?) async throws {
        guard let uid = currentUserId else { return }
        try await client.from("profiles")
            .update(AccentUpdate(accentColor: color1, accentColor2: color2))
            .eq("id", value: uid)
            .execute()
    }

    /// Font for anyone; colours only for Aero, as on the web, which clears
    /// them when someone without Aero saves.
    static func updateNameStyle(_ style: NameStyle, aero: Bool) async throws {
        guard let uid = currentUserId else { return }
        let hasColor = aero && (style.color != nil || style.color2 != nil)
        try await client.from("profiles")
            .update(NameStyleUpdate(
                font: style.font == .standard ? nil : style.font.rawValue,
                color: hasColor ? (style.color ?? "#ffffff") : nil,
                color2: aero ? style.color2 : nil,
                direction: hasColor ? (style.direction ?? "135deg") : nil))
            .eq("id", value: uid)
            .execute()
    }

    static func updateStatus(_ status: UserStatus) async throws {
        guard let uid = currentUserId else { return }
        try await client.from("profiles")
            .update(StatusUpdate(preferredStatus: status.rawValue, status: status.rawValue))
            .eq("id", value: uid)
            .execute()
    }

    static func updateAvatar(url: String) async throws {
        guard let uid = currentUserId else { return }
        try await client.from("profiles")
            .update(AvatarUpdate(avatarUrl: url))
            .eq("id", value: uid)
            .execute()
    }

    static func updateBanner(url: String) async throws {
        guard let uid = currentUserId else { return }
        try await client.from("profiles")
            .update(BannerUpdate(bannerUrl: url))
            .eq("id", value: uid)
            .execute()
    }
}

private struct ProfileUpdate: Encodable {
    let displayName: String
    let bio: String
    enum CodingKeys: String, CodingKey {
        case bio
        case displayName = "display_name"
    }
}

private struct ThemeUpdate: Encodable {
    let theme: String
}

private struct AccentUpdate: Encodable {
    let accentColor: String?
    let accentColor2: String?
    enum CodingKeys: String, CodingKey {
        case accentColor = "accent_color"
        case accentColor2 = "accent_color_2"
    }
    // nil has to reach the database as null: "Reset to default" sends nils,
    // and the synthesised encoder left them out, so the old colours stayed.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accentColor, forKey: .accentColor)
        try c.encode(accentColor2, forKey: .accentColor2)
    }
}

private struct NameStyleUpdate: Encodable {
    let font: String?
    let color: String?
    let color2: String?
    let direction: String?
    enum CodingKeys: String, CodingKey {
        case font = "name_font"
        case color = "name_color"
        case color2 = "name_color_2"
        case direction = "name_gradient_dir"
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(font, forKey: .font)
        try c.encode(color, forKey: .color)
        try c.encode(color2, forKey: .color2)
        try c.encode(direction, forKey: .direction)
    }
}

private struct StatusUpdate: Encodable {
    let preferredStatus: String
    let status: String
    enum CodingKeys: String, CodingKey {
        case status
        case preferredStatus = "preferred_status"
    }
}

private struct AvatarUpdate: Encodable {
    let avatarUrl: String
    enum CodingKeys: String, CodingKey { case avatarUrl = "avatar_url" }
}

private struct BannerUpdate: Encodable {
    let bannerUrl: String
    enum CodingKeys: String, CodingKey { case bannerUrl = "banner_url" }
}


/// A column → value map that writes JSON `null` for nil. Synthesized
/// `Encodable` skips nil properties entirely, so "clear my status" would have
/// sent an empty update and left the old status in place.
struct NullableFields: Encodable {
    let values: [String: String?]
    init(_ values: [String: String?]) { self.values = values }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        for (key, value) in values {
            let k = Key(stringValue: key)
            if let value { try container.encode(value, forKey: k) } else { try container.encodeNil(forKey: k) }
        }
    }

    private struct Key: CodingKey {
        let stringValue: String
        init(stringValue: String) { self.stringValue = stringValue }
        var intValue: Int? { nil }
        init?(intValue: Int) { nil }
    }
}
