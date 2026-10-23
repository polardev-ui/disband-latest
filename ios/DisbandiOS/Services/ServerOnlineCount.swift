import Foundation
import Supabase

/**
 How many of a space's members are online right now, for the "● 16 Online"
 line under a channel's name.

 Same approach as the web (`useLiveOnlineCount`): the stored
 `profiles.status` goes stale whenever a client closes without saying so, so
 the count is the people in the live presence channel who are members of this
 space. Membership of each present user is looked up once and cached for ten
 minutes, so presence changes alone keep the number moving.
 */
@MainActor
enum ServerOnlineCount {
    private static var membership: [String: (at: Date, known: [String: Bool])] = [:]
    private static var serverForChannel: [String: String] = [:]
    private static let ttl: TimeInterval = 600

    /// The space a channel belongs to, looked up once per channel.
    static func serverId(forChannel channelId: String) async -> String? {
        if let hit = serverForChannel[channelId] { return hit }
        struct Row: Decodable { let server_id: String }
        let rows: [Row]? = try? await SupabaseManager.client
            .from("channels").select("server_id").eq("id", value: channelId).limit(1)
            .execute().value
        guard let id = rows?.first?.server_id else { return nil }
        serverForChannel[channelId] = id
        return id
    }

    static func count(serverId: String, online: [String]) async -> Int {
        var entry = membership[serverId]
        if entry == nil || Date().timeIntervalSince(entry!.at) > ttl {
            entry = (Date(), [:])
        }
        var known = entry!.known
        let unknown = online.filter { known[$0] == nil }
        // get_server_members_by_ids takes at most 1000 ids per call.
        for start in stride(from: 0, to: unknown.count, by: 1000) {
            let chunk = Array(unknown[start..<min(start + 1000, unknown.count)])
            struct Row: Decodable { let user_id: String }
            let rows: [Row]? = try? await SupabaseManager.client
                .rpc("get_server_members_by_ids", params: Params(p_server_id: serverId, p_user_ids: chunk))
                .execute().value
            guard let rows else { break }
            let members = Set(rows.map(\.user_id))
            for id in chunk { known[id] = members.contains(id) }
        }
        membership[serverId] = (entry!.at, known)
        return online.filter { known[$0] == true }.count
    }

    private struct Params: Encodable, Sendable {
        let p_server_id: String
        let p_user_ids: [String]
    }
}
