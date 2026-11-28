package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A space's roles and who holds which, for role pills, coloured names and the
 * hoisted member list. The same reads as the web (`AppContext.tsx` on opening
 * a space): `server_roles` and `member_roles`, @everyone left out.
 */
object ServerRoster {
    data class Roster(
        /** Highest first. */
        val roles: List<ServerAdmin.Role>,
        /** Non-default role ids per member. */
        val memberRoles: Map<String, List<String>>,
    ) {
        private val byId = roles.associateBy { it.id }

        /** A member's roles, @everyone excluded, most senior first. */
        fun rolesOf(userId: String, legacyRoleId: String? = null): List<ServerAdmin.Role> {
            val ids = memberRoles[userId]?.takeIf { it.isNotEmpty() } ?: listOfNotNull(legacyRoleId)
            return ids.mapNotNull { byId[it] }.filter { it.isDefault != true }.sortedByDescending { it.position }
        }

        /** Highest-position role: colours the name and names the member-list group. */
        fun topRole(userId: String, legacyRoleId: String? = null): ServerAdmin.Role? =
            rolesOf(userId, legacyRoleId).firstOrNull()

        /** Highest role that has an icon, which may sit below the colour role. */
        fun iconRole(userId: String, legacyRoleId: String? = null): ServerAdmin.Role? =
            rolesOf(userId, legacyRoleId).firstOrNull { !it.icon.isNullOrBlank() }
    }

    private val _rosters = MutableStateFlow<Map<String, Roster>>(emptyMap())
    val rosters: StateFlow<Map<String, Roster>> = _rosters.asStateFlow()

    fun cached(serverId: String?): Roster? = serverId?.let { _rosters.value[it] }

    @Serializable
    private data class MemberRoleRow(
        @SerialName("user_id") val userId: String,
        @SerialName("role_id") val roleId: String,
    )

    /** Loads (or reloads) a space's roster. Both reads run together. */
    suspend fun load(serverId: String): Roster? = runCatching {
        coroutineScope {
            val roles = async { ServerAdmin.roles(serverId) }
            val links = async { memberRoles(serverId) }
            val defaults = roles.await().filter { it.isDefault == true }.map { it.id }.toSet()
            val grouped = links.await().filter { it.roleId !in defaults }
                .groupBy({ it.userId }, { it.roleId })
            Roster(roles.await(), grouped)
        }
    }.getOrNull()?.also { roster -> _rosters.update { it + (serverId to roster) } }

    /** Paged: PostgREST caps a read at 1000 rows. */
    private suspend fun memberRoles(serverId: String): List<MemberRoleRow> {
        val out = mutableListOf<MemberRoleRow>()
        val page = 1000L
        for (i in 0 until 20) {
            val rows = DisbandSupabase.client.from("member_roles")
                .select(Columns.raw("user_id, role_id")) {
                    filter { eq("server_id", serverId) }
                    range(i * page, (i + 1) * page - 1)
                }.decodeList<MemberRoleRow>()
            out += rows
            if (rows.size < page) break
        }
        return out
    }

    /**
     * One person's roles, for a profile sheet opened outside the member list:
     * the loaded roster if there is one, else `get_server_members_by_ids`, as
     * the web's `useProfileMember` does.
     */
    suspend fun rolesFor(serverId: String, userId: String): List<ServerAdmin.Role> {
        val roster = cached(serverId) ?: load(serverId) ?: return emptyList()
        if (roster.memberRoles.containsKey(userId)) return roster.rolesOf(userId)
        val detail = ServerAdmin.memberDetail(serverId, userId) ?: return emptyList()
        val ids = detail.roleIds.orEmpty().toSet()
        return roster.roles.filter { it.id in ids && it.isDefault != true }.sortedByDescending { it.position }
    }
}
