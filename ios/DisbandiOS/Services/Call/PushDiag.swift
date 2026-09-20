import Foundation
import Supabase

/// Best-effort remote logging for the VoIP push → PushKit → CallKit chain.
///
/// Rows land in `push_diagnostics` (owner-scoped by RLS) and are read from the
/// Supabase dashboard SQL editor. Insert failures are swallowed — this must
/// never affect the call path.
@MainActor
enum PushDiag {
    private struct Row: Codable {
        let user_id: String
        let event: String
        let detail: String?
    }

    private static var client: SupabaseClient { SupabaseManager.client }

    static func log(_ event: String, _ detail: String? = nil) {
        guard let uid = client.auth.currentUser?.id.uuidString.lowercased() else { return }
        let row = Row(user_id: uid, event: event, detail: detail)
        Task {
            try? await client.from("push_diagnostics").insert(row).execute()
        }
    }
}