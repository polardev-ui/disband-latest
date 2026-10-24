import Foundation
import Supabase

/**
 Everything Space Settings does, mirroring the web's calls one for one
 (`AppContext.tsx`), so a change made on the phone is the same change the web
 would have made. Permission checks live in the database; the app only hides
 what the person can't use.
 */
enum ServerAdmin {
    private static var client: SupabaseClient { SupabaseManager.client }

    // MARK: - Models

    struct Role: Codable, Identifiable, Hashable, Sendable {
        let id: String
        let serverId: String
        var name: String
        var color: String
        var position: Int
        var permissions: [String: Bool]
        var isDefault: Bool?
        var icon: String?

        enum CodingKeys: String, CodingKey {
            case id, name, color, position, permissions, icon
            case serverId = "server_id"
            case isDefault = "is_default"
        }
    }

    struct MemberDetail: Decodable, Sendable {
        let userId: String
        let role: String
        let roleIds: [String]?
        let profile: Profile?
        enum CodingKeys: String, CodingKey {
            case role, profile
            case userId = "user_id"
            case roleIds = "role_ids"
        }
    }

    struct Ban: Decodable, Identifiable, Sendable {
        let userId: String
        let reason: String?
        let createdAt: String?
        var profile: Profile?
        var id: String { userId }
        enum CodingKeys: String, CodingKey {
            case reason
            case userId = "user_id"
            case createdAt = "created_at"
        }
    }

    struct AuditEntry: Decodable, Identifiable, Sendable {
        let id: Int
        let action: String
        let actorId: String?
        let targetType: String?
        let targetId: String?
        let details: [String: AuditValue]?
        let createdAt: String
        enum CodingKeys: String, CodingKey {
            case id, action, details
            case actorId = "actor_id"
            case targetType = "target_type"
            case targetId = "target_id"
            case createdAt = "created_at"
        }
    }

    /// A loosely typed value from an audit row's `details` JSON.
    enum AuditValue: Decodable, Sendable {
        case string(String), number(Double), bool(Bool), other

        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let s = try? c.decode(String.self) { self = .string(s) }
            else if let n = try? c.decode(Double.self) { self = .number(n) }
            else if let b = try? c.decode(Bool.self) { self = .bool(b) }
            else { self = .other }
        }

        var text: String? {
            switch self {
            case .string(let s): return s
            case .number(let n): return n == n.rounded() ? String(Int(n)) : String(n)
            case .bool(let b): return b ? "yes" : "no"
            case .other: return nil
            }
        }
    }

    // MARK: - Permissions

    static func permissions(serverId: String) async -> [String: Bool] {
        (try? await client.rpc("my_server_permissions", params: ["p_server_id": serverId])
            .execute().value) ?? [:]
    }

    // MARK: - Overview

    static func isDiscoverable(serverId: String) async -> Bool {
        struct Row: Decodable { let discoverable: Bool? }
        let rows: [Row]? = try? await client.from("servers").select("discoverable")
            .eq("id", value: serverId).limit(1).execute().value
        return rows?.first?.discoverable ?? false
    }

    static func setDiscoverable(serverId: String, _ on: Bool) async throws {
        try await client.from("servers").update(["discoverable": on]).eq("id", value: serverId).execute()
    }

    static func deleteServer(serverId: String) async throws {
        try await client.rpc("delete_server", params: ["p_server_id": serverId]).execute()
    }

    // MARK: - Channels

    private struct CreateChannelParams: Encodable, Sendable {
        let p_server_id: String
        let p_name: String
        let p_type: String
        let p_category_id: String?
    }

    static func createChannel(serverId: String, name: String, type: ChannelType, categoryId: String?) async throws {
        try await client.rpc("create_channel", params: CreateChannelParams(
            p_server_id: serverId, p_name: name, p_type: type.rawValue, p_category_id: categoryId
        )).execute()
    }

    static func renameChannel(channelId: String, name: String) async throws {
        try await client.rpc("rename_channel", params: ["p_channel_id": channelId, "p_name": name]).execute()
    }

    static func deleteChannel(channelId: String) async throws {
        try await client.rpc("delete_channel", params: ["p_channel_id": channelId]).execute()
    }

    static func setReadOnly(channelId: String, _ on: Bool) async throws {
        try await client.from("channels").update(["read_only": on]).eq("id", value: channelId).execute()
    }

    static func createCategory(serverId: String, name: String) async throws {
        try await client.rpc("create_category", params: ["p_server_id": serverId, "p_name": name]).execute()
    }

    static func renameCategory(categoryId: String, name: String) async throws {
        try await client.rpc("rename_category", params: ["p_category_id": categoryId, "p_name": name]).execute()
    }

    /// Its channels stay, moved out to the top of the list.
    static func deleteCategory(categoryId: String) async throws {
        try await client.rpc("delete_category", params: ["p_category_id": categoryId]).execute()
    }

    // MARK: - Roles

    /// Highest first, the order the web lists them in.
    static func roles(serverId: String) async throws -> [Role] {
        try await client.from("server_roles").select("*").eq("server_id", value: serverId)
            .order("position", ascending: false).execute().value
    }

    private struct NewRole: Encodable, Sendable {
        let server_id: String
        let name: String
        let color: String
        let position: Int
    }

    static func createRole(serverId: String, name: String, color: String, position: Int) async throws {
        try await client.from("server_roles")
            .insert(NewRole(server_id: serverId, name: name, color: color, position: position))
            .execute()
    }

    private struct RolePatch: Encodable, Sendable {
        let name: String
        let color: String
        let permissions: [String: Bool]
    }

    static func updateRole(_ role: Role) async throws {
        try await client.from("server_roles")
            .update(RolePatch(name: role.name, color: role.color, permissions: role.permissions))
            .eq("id", value: role.id).eq("server_id", value: role.serverId)
            .execute()
    }

    static func deleteRole(roleId: String) async throws {
        try await client.rpc("delete_server_role", params: ["p_role_id": roleId]).execute()
    }

    private struct MoveRoleParams: Encodable, Sendable {
        let p_role_id: String
        let p_new_position: Int
    }

    /// `position` is where the role ends up: 1 is just above @everyone.
    static func moveRole(roleId: String, to position: Int) async throws {
        try await client.rpc("move_role", params: MoveRoleParams(p_role_id: roleId, p_new_position: position))
            .execute()
    }

    // MARK: - Members

    private struct ByIdsParams: Encodable, Sendable {
        let p_server_id: String
        let p_user_ids: [String]
    }

    static func memberDetail(serverId: String, userId: String) async -> MemberDetail? {
        let rows: [MemberDetail]? = try? await client.rpc(
            "get_server_members_by_ids",
            params: ByIdsParams(p_server_id: serverId, p_user_ids: [userId])
        ).execute().value
        return rows?.first
    }

    private struct SearchParams: Encodable, Sendable {
        let p_server_id: String
        let p_query: String
        let p_limit: Int
    }

    /// Username or display-name search across the whole roster, so a space of
    /// thousands is searchable even though only one page is listed.
    static func searchMembers(serverId: String, query: String) async -> [Profile] {
        struct Row: Decodable { let profile: Profile? }
        let rows: [Row]? = try? await client.rpc(
            "search_server_members",
            params: SearchParams(p_server_id: serverId, p_query: query, p_limit: 40)
        ).execute().value
        return rows?.compactMap(\.profile) ?? []
    }

    private struct SetRolesParams: Encodable, Sendable {
        let p_server_id: String
        let p_user_id: String
        let p_role_ids: [String]
    }

    static func setMemberRoles(serverId: String, userId: String, roleIds: [String]) async throws {
        try await client.rpc("set_member_roles", params: SetRolesParams(
            p_server_id: serverId, p_user_id: userId, p_role_ids: roleIds
        )).execute()
    }

    static func kick(serverId: String, userId: String) async throws {
        try await client.rpc("kick_server_member", params: ["p_server_id": serverId, "p_user_id": userId]).execute()
    }

    private struct BanParams: Encodable, Sendable {
        let p_server_id: String
        let p_user_id: String
        let p_reason: String?
    }

    static func ban(serverId: String, userId: String, reason: String?) async throws {
        try await client.rpc("ban_server_member", params: BanParams(
            p_server_id: serverId, p_user_id: userId, p_reason: reason
        )).execute()
    }

    static func unban(serverId: String, userId: String) async throws {
        try await client.rpc("unban_server_member", params: ["p_server_id": serverId, "p_user_id": userId]).execute()
    }

    private struct TimeoutParams: Encodable, Sendable {
        let p_server_id: String
        let p_user_id: String
        let p_seconds: Int
        let p_reason: String
    }

    static func timeout(serverId: String, userId: String, seconds: Int, reason: String?) async throws {
        try await client.rpc("timeout_server_member", params: TimeoutParams(
            p_server_id: serverId, p_user_id: userId, p_seconds: seconds, p_reason: reason ?? ""
        )).execute()
    }

    /// When the member's timeout ends, or nil if they aren't timed out.
    static func timeoutEnds(serverId: String, userId: String) async -> Date? {
        struct Row: Decodable { let expires_at: String }
        let rows: [Row]? = try? await client.from("server_timeouts").select("expires_at")
            .eq("server_id", value: serverId).eq("user_id", value: userId)
            .limit(1).execute().value
        guard let end = RelativeTime.date(from: rows?.first?.expires_at), end > Date() else { return nil }
        return end
    }

    static func removeTimeout(serverId: String, userId: String) async throws {
        try await client.rpc("remove_timeout", params: ["p_server_id": serverId, "p_user_id": userId]).execute()
    }

    // MARK: - Bans and audit log

    static func bans(serverId: String) async throws -> [Ban] {
        var rows: [Ban] = try await client.from("server_bans")
            .select("user_id, reason, created_at")
            .eq("server_id", value: serverId)
            .order("created_at", ascending: false)
            .execute().value
        let profiles = (try? await DatabaseService.profiles(ids: rows.map(\.userId))) ?? [:]
        for i in rows.indices { rows[i].profile = profiles[rows[i].userId] }
        return rows
    }

    static func auditLog(serverId: String) async throws -> [AuditEntry] {
        try await client.from("audit_log")
            .select("id, action, actor_id, target_type, target_id, details, created_at")
            .eq("server_id", value: serverId)
            .order("created_at", ascending: false)
            .limit(100)
            .execute().value
    }
}
