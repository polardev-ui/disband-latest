import Foundation
import Supabase
import SwiftUI

/**
 A space's roles and who holds which, for the member list and the profile
 sheet. Same reads and rules as the web (`AppContext.tsx` on opening a space,
 `MemberList.tsx`, `role-icons.ts`, `UserProfilePopout.tsx`):

 - roles: `server_roles` for the space; `member_roles` for who holds them.
 - a member's role ids: their `member_roles`, else the legacy
   `server_members.role_id`, else none. @everyone (`is_default`) never counts.
 - top role: the highest `position`. Its colour (and `gradient_to`) colours
   the name in the member list and names their group; the role icon comes
   from the highest role that has one.
 */
@MainActor
final class SpaceRoles {
    let serverId: String
    /// Highest first, @everyone left out.
    let roles: [ServerAdmin.Role]
    private let byId: [String: ServerAdmin.Role]
    private var memberRoleIds: [String: [String]]

    private init(serverId: String, roles: [ServerAdmin.Role], memberRoleIds: [String: [String]]) {
        self.serverId = serverId
        self.roles = roles.filter { $0.isDefault != true }.sorted { $0.position > $1.position }
        self.byId = Dictionary(self.roles.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        self.memberRoleIds = memberRoleIds
    }

    private static var cache: [String: (at: Date, value: SpaceRoles)] = [:]
    private static var inFlight: [String: Task<SpaceRoles?, Never>] = [:]

    /// Cached for a minute: the member list and every profile sheet opened
    /// from it read the same thing.
    static func load(serverId: String, force: Bool = false) async -> SpaceRoles? {
        if !force, let hit = cache[serverId], Date().timeIntervalSince(hit.at) < 60 { return hit.value }
        if let running = inFlight[serverId] { return await running.value }
        let task = Task<SpaceRoles?, Never> { @MainActor in
            async let rolesCall = try? ServerAdmin.roles(serverId: serverId)
            async let holdersCall = holders(serverId: serverId)
            guard let roles = await rolesCall else { return nil }
            let value = SpaceRoles(serverId: serverId, roles: roles, memberRoleIds: await holdersCall)
            cache[serverId] = (Date(), value)
            return value
        }
        inFlight[serverId] = task
        let value = await task.value
        inFlight[serverId] = nil
        return value
    }

    /// Every `member_roles` row in the space, a thousand at a time.
    private static func holders(serverId: String) async -> [String: [String]] {
        struct Row: Decodable { let user_id: String; let role_id: String }
        var out: [String: [String]] = [:]
        let page = 1000
        var from = 0
        while from < 50_000 {
            guard let rows: [Row] = try? await SupabaseManager.client.from("member_roles")
                .select("user_id,role_id").eq("server_id", value: serverId)
                .order("user_id").range(from: from, to: from + page - 1)
                .execute().value else { break }
            for row in rows { out[row.user_id, default: []].append(row.role_id) }
            if rows.count < page { break }
            from += page
        }
        return out
    }

    /// Fill in someone the bulk read missed (they joined since), from the
    /// row `get_server_members_by_ids` returns.
    func learn(userId: String, roleIds: [String]?) {
        guard let roleIds, !roleIds.isEmpty else { return }
        memberRoleIds[userId] = roleIds
    }

    /// The member's roles, highest first.
    func roles(of userId: String, legacyRoleId: String? = nil) -> [ServerAdmin.Role] {
        var ids = memberRoleIds[userId] ?? []
        if ids.isEmpty, let legacyRoleId { ids = [legacyRoleId] }
        return ids.compactMap { byId[$0] }.sorted { $0.position > $1.position }
    }

    func topRole(of userId: String, legacyRoleId: String? = nil) -> ServerAdmin.Role? {
        roles(of: userId, legacyRoleId: legacyRoleId).first
    }

    /// The highest role that has an icon, which may sit below the colour role.
    func iconRole(of userId: String, legacyRoleId: String? = nil) -> ServerAdmin.Role? {
        roles(of: userId, legacyRoleId: legacyRoleId).first { ($0.icon ?? "").isEmpty == false }
    }
}

extension ServerAdmin.Role {
    var swiftColor: Color? { Color(hexString: Optional(color)) }

    /// The member list's name gradient for a role with `gradient_to` (90deg).
    var nameGradient: LinearGradient? {
        guard let start = Color(hexString: Optional(color)), let end = Color(hexString: gradientTo) else { return nil }
        return LinearGradient(colors: [start, end], startPoint: .leading, endPoint: .trailing)
    }
}

/// A role's icon: an emoji, or an image when it is an https address.
struct RoleIconView: View {
    let icon: String
    var size: CGFloat = 15

    var body: some View {
        if icon.hasPrefix("https://") {
            RemoteImage(url: icon, contentMode: .fit) { Color.clear }
                .frame(width: size, height: size)
                .clipShape(.rect(cornerRadius: 3))
        } else {
            Text(icon).font(.system(size: size * 0.9))
        }
    }
}

/// One role on a profile: a dot in the role's colour, its icon, its name.
struct RolePill: View {
    let role: ServerAdmin.Role

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(role.swiftColor ?? Brand.textMuted)
                .frame(width: 12, height: 12)
            if let icon = role.icon, !icon.isEmpty { RoleIconView(icon: icon, size: 14) }
            Text(role.name)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Brand.textPrimary)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Brand.elevated, in: .rect(cornerRadius: 6))
    }
}
