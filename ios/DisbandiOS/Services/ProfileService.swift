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
