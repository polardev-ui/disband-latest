package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Everything Space Settings does, the same calls the web and iOS make, so a
 * change made on Android is the change they would have made. Permission checks
 * live in the database; the app only hides what the person can't use.
 */
object ServerAdmin {
    private val client get() = DisbandSupabase.client
    private val postgrest get() = DisbandSupabase.postgrest

    @Serializable
    data class Role(
        val id: String,
        @SerialName("server_id") val serverId: String,
        val name: String,
        val color: String = "#99aab5",
        val position: Int = 0,
        val permissions: Map<String, Boolean> = emptyMap(),
        @SerialName("is_default") val isDefault: Boolean? = null,
        val icon: String? = null,
    )

    @Serializable
    data class MemberDetail(
        @SerialName("user_id") val userId: String,
        val role: String = "member",
        @SerialName("role_ids") val roleIds: List<String>? = null,
        val profile: Profile? = null,
    )

    @Serializable
    data class Ban(
        @SerialName("user_id") val userId: String,
        val reason: String? = null,
        @SerialName("created_at") val createdAt: String? = null,
    )

    @Serializable
    data class AuditEntry(
        val id: Long,
        val action: String,
        @SerialName("actor_id") val actorId: String? = null,
        @SerialName("target_type") val targetType: String? = null,
        @SerialName("target_id") val targetId: String? = null,
        val details: JsonObject? = null,
        @SerialName("created_at") val createdAt: String,
    ) {
        fun detail(key: String): String? {
            val value = details?.get(key) as? JsonPrimitive ?: return null
            return value.contentOrNull?.takeIf { it.isNotBlank() }
        }

        fun seconds(): Long? = (details?.get("seconds") as? JsonPrimitive)?.doubleOrNull?.toLong()
    }

    // MARK: - Permissions

    suspend fun permissions(serverId: String): Map<String, Boolean> = runCatching {
        val obj = postgrest.rpc("my_server_permissions", buildJsonObject { put("p_server_id", serverId) })
            .decodeAs<JsonObject>()
        obj.mapValues { (_, v) -> (v as? JsonPrimitive)?.booleanOrNull == true }
    }.getOrDefault(emptyMap())

    // MARK: - Overview

    @Serializable
    private data class DiscoverableRow(val discoverable: Boolean? = null)

    suspend fun isDiscoverable(serverId: String): Boolean = runCatching {
        client.from("servers").select(Columns.raw("discoverable")) {
            filter { eq("id", serverId) }
            limit(1)
        }.decodeList<DiscoverableRow>().firstOrNull()?.discoverable == true
    }.getOrDefault(false)

    suspend fun setDiscoverable(serverId: String, on: Boolean) {
        client.from("servers").update({ set("discoverable", on) }) { filter { eq("id", serverId) } }
    }

    suspend fun deleteServer(serverId: String) {
        postgrest.rpc("delete_server", buildJsonObject { put("p_server_id", serverId) })
    }

    // MARK: - Channels

    suspend fun createChannel(serverId: String, name: String, type: ChannelType, categoryId: String?) {
        postgrest.rpc("create_channel", buildJsonObject {
            put("p_server_id", serverId)
            put("p_name", name)
            put("p_type", if (type == ChannelType.Voice) "voice" else "text")
            put("p_category_id", categoryId)
        })
    }

    suspend fun renameChannel(channelId: String, name: String) {
        postgrest.rpc("rename_channel", buildJsonObject {
            put("p_channel_id", channelId)
            put("p_name", name)
        })
    }

    suspend fun deleteChannel(channelId: String) {
        postgrest.rpc("delete_channel", buildJsonObject { put("p_channel_id", channelId) })
    }

    suspend fun setReadOnly(channelId: String, on: Boolean) {
        client.from("channels").update({ set("read_only", on) }) { filter { eq("id", channelId) } }
    }

    suspend fun createCategory(serverId: String, name: String) {
        postgrest.rpc("create_category", buildJsonObject {
            put("p_server_id", serverId)
            put("p_name", name)
        })
    }

    suspend fun renameCategory(categoryId: String, name: String) {
        postgrest.rpc("rename_category", buildJsonObject {
            put("p_category_id", categoryId)
            put("p_name", name)
        })
    }

    /** Its channels stay, moved out of any category. */
    suspend fun deleteCategory(categoryId: String) {
        postgrest.rpc("delete_category", buildJsonObject { put("p_category_id", categoryId) })
    }

    // MARK: - Roles

    /** Highest first, the order the web lists them in. */
    suspend fun roles(serverId: String): List<Role> =
        client.from("server_roles").select(Columns.ALL) {
            filter { eq("server_id", serverId) }
            order("position", Order.DESCENDING)
        }.decodeList()

    suspend fun createRole(serverId: String, name: String, color: String, position: Int) {
        client.from("server_roles").insert(buildJsonObject {
            put("server_id", serverId)
            put("name", name)
            put("color", color)
            put("position", position)
        })
    }

    suspend fun updateRole(role: Role) {
        client.from("server_roles").update(buildJsonObject {
            put("name", role.name.trim())
            put("color", role.color)
            putJsonObject("permissions") { role.permissions.forEach { (k, v) -> put(k, v) } }
        }) {
            filter {
                eq("id", role.id)
                eq("server_id", role.serverId)
            }
        }
    }

    suspend fun deleteRole(roleId: String) {
        postgrest.rpc("delete_server_role", buildJsonObject { put("p_role_id", roleId) })
    }

    /** [position] is where the role ends up: 1 is just above @everyone. */
    suspend fun moveRole(roleId: String, position: Int) {
        postgrest.rpc("move_role", buildJsonObject {
            put("p_role_id", roleId)
            put("p_new_position", position)
        })
    }

    // MARK: - Members

    suspend fun memberDetail(serverId: String, userId: String): MemberDetail? = runCatching {
        postgrest.rpc("get_server_members_by_ids", buildJsonObject {
            put("p_server_id", serverId)
            put("p_user_ids", buildJsonArray { add(JsonPrimitive(userId)) })
        }).decodeList<MemberDetail>().firstOrNull()
    }.getOrNull()

    @Serializable
    private data class SearchRow(val profile: Profile? = null)

    /** Searches the whole roster, so a space of thousands is searchable. */
    suspend fun searchMembers(serverId: String, query: String): List<Profile> = runCatching {
        postgrest.rpc("search_server_members", buildJsonObject {
            put("p_server_id", serverId)
            put("p_query", query)
            put("p_limit", 40)
        }).decodeList<SearchRow>().mapNotNull { it.profile }
    }.getOrDefault(emptyList())

    suspend fun setMemberRoles(serverId: String, userId: String, roleIds: List<String>) {
        postgrest.rpc("set_member_roles", buildJsonObject {
            put("p_server_id", serverId)
            put("p_user_id", userId)
            put("p_role_ids", buildJsonArray { roleIds.forEach { add(JsonPrimitive(it)) } })
        })
    }

    suspend fun kick(serverId: String, userId: String) {
        postgrest.rpc("kick_server_member", buildJsonObject {
            put("p_server_id", serverId)
            put("p_user_id", userId)
        })
    }

    suspend fun ban(serverId: String, userId: String, reason: String?) {
        postgrest.rpc("ban_server_member", buildJsonObject {
            put("p_server_id", serverId)
            put("p_user_id", userId)
            put("p_reason", reason)
        })
    }

    suspend fun unban(serverId: String, userId: String) {
        postgrest.rpc("unban_server_member", buildJsonObject {
            put("p_server_id", serverId)
            put("p_user_id", userId)
        })
    }

    suspend fun timeout(serverId: String, userId: String, seconds: Int, reason: String?) {
        postgrest.rpc("timeout_server_member", buildJsonObject {
            put("p_server_id", serverId)
            put("p_user_id", userId)
            put("p_seconds", seconds)
            put("p_reason", reason ?: "")
        })
    }

    suspend fun removeTimeout(serverId: String, userId: String) {
        postgrest.rpc("remove_timeout", buildJsonObject {
            put("p_server_id", serverId)
            put("p_user_id", userId)
        })
    }

    @Serializable
    private data class TimeoutRow(@SerialName("expires_at") val expiresAt: String)

    /** When the member's timeout ends (epoch millis), or null if they aren't timed out. */
    suspend fun timeoutEnds(serverId: String, userId: String): Long? = runCatching {
        val row = client.from("server_timeouts").select(Columns.raw("expires_at")) {
            filter {
                eq("server_id", serverId)
                eq("user_id", userId)
            }
            limit(1)
        }.decodeList<TimeoutRow>().firstOrNull() ?: return@runCatching null
        val end = java.time.OffsetDateTime.parse(row.expiresAt).toInstant().toEpochMilli()
        end.takeIf { it > System.currentTimeMillis() }
    }.getOrNull()

    // MARK: - Bans and audit log

    suspend fun bans(serverId: String): List<Pair<Ban, Profile?>> {
        val rows = client.from("server_bans").select(Columns.raw("user_id, reason, created_at")) {
            filter { eq("server_id", serverId) }
            order("created_at", Order.DESCENDING)
        }.decodeList<Ban>()
        val profiles = runCatching { Database.profiles(rows.map { it.userId }) }.getOrDefault(emptyMap())
        return rows.map { it to profiles[it.userId] }
    }

    suspend fun auditLog(serverId: String): List<AuditEntry> =
        client.from("audit_log")
            .select(Columns.raw("id, action, actor_id, target_type, target_id, details, created_at")) {
                filter { eq("server_id", serverId) }
                order("created_at", Order.DESCENDING)
                limit(100)
            }.decodeList()
}
