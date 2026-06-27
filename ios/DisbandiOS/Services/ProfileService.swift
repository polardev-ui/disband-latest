import Foundation
import Supabase

enum ProfileService {
    private static var client: SupabaseClient { SupabaseManager.client }

    static func update(displayName: String, bio: String) async {
        guard let uid = SupabaseManager.client.auth.currentUser?.id.uuidString.lowercased() else { return }
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
}

private struct ProfileUpdate: Encodable {
    let displayName: String
    let bio: String
    enum CodingKeys: String, CodingKey {
        case bio
        case displayName = "display_name"
    }
}
