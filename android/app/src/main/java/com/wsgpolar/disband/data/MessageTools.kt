package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Which kind of conversation a message lives in, as the web names it. */
enum class ChatKind(val wire: String, val table: String) {
    Channel("channel", "messages"),
    Dm("dm", "dm_messages"),
    Group("group", "group_messages"),
}

/** One conversation: its kind, id and (for a channel) its space. */
data class ChatContext(val kind: ChatKind, val id: String, val serverId: String? = null)

/**
 * Pins, saved messages, search and per-space notification settings: the
 * same tables and RPCs the web uses (`AppContext.tsx` pins,
 * `lib/saved-messages.ts`, `SearchPanel.tsx`, `SpaceNotificationsModal.tsx`).
 */
object MessageTools {
    private val client get() = DisbandSupabase.client
    private val postgrest get() = DisbandSupabase.postgrest
    private fun me(): String? = client.auth.currentUserOrNull()?.id

    // MARK: - Pins

    @Serializable
    data class Pin(
        val id: String,
        @SerialName("message_id") val messageId: String,
        val content: String = "",
        @SerialName("author_id") val authorId: String? = null,
        @SerialName("pinner_id") val pinnerId: String? = null,
        @SerialName("created_at") val createdAt: String? = null,
    )

    suspend fun pins(ctx: ChatContext): List<Pin> =
        postgrest.rpc("get_pinned_messages", buildJsonObject {
            put("p_source_type", ctx.kind.wire)
            put("p_source_id", ctx.id)
        }).decodeList()

    suspend fun pin(ctx: ChatContext, messageId: String, content: String, authorId: String?) {
        postgrest.rpc("pin_message", buildJsonObject {
            put("p_source_type", ctx.kind.wire)
            put("p_source_id", ctx.id)
            put("p_message_id", messageId)
            put("p_content", content)
            if (authorId != null) put("p_author_id", authorId) else put("p_author_id", JsonNull)
        })
    }

    suspend fun unpin(ctx: ChatContext, messageId: String) {
        postgrest.rpc("unpin_message", buildJsonObject {
            put("p_source_type", ctx.kind.wire)
            put("p_source_id", ctx.id)
            put("p_message_id", messageId)
        })
    }

    // MARK: - Saved messages (migration 0238)

    @Serializable
    data class Saved(
        val id: String,
        val context: String,
        @SerialName("message_id") val messageId: String,
        @SerialName("container_id") val containerId: String,
        val note: String? = null,
        @SerialName("created_at") val createdAt: String? = null,
    )

    @Serializable
    private data class NewSaved(
        @SerialName("user_id") val userId: String,
        val context: String,
        @SerialName("message_id") val messageId: String,
        @SerialName("container_id") val containerId: String,
    )

    private val _saved = MutableStateFlow<List<Saved>>(emptyList())
    val saved: StateFlow<List<Saved>> = _saved.asStateFlow()
    private var savedFor: String? = null

    suspend fun loadSaved(force: Boolean = false): List<Saved> {
        val uid = me() ?: return emptyList()
        if (!force && savedFor == uid) return _saved.value
        val rows = client.from("saved_messages")
            .select(Columns.raw("id, context, message_id, container_id, note, created_at")) {
                filter { eq("user_id", uid) }
                order("created_at", Order.DESCENDING)
                limit(500)
            }.decodeList<Saved>()
        savedFor = uid
        _saved.value = rows
        return rows
    }

    fun isSaved(kind: ChatKind, messageId: String): Boolean =
        _saved.value.any { it.context == kind.wire && it.messageId == messageId }

    suspend fun save(ctx: ChatContext, messageId: String) {
        val uid = me() ?: return
        if (isSaved(ctx.kind, messageId)) return
        runCatching {
            client.from("saved_messages").insert(NewSaved(uid, ctx.kind.wire, messageId, ctx.id))
        }.onFailure { e ->
            // Already saved on another device (unique violation): just reload.
            if (e.message?.contains("23505") != true) throw e
        }
        loadSaved(force = true)
    }

    suspend fun unsave(kind: ChatKind, messageId: String) {
        val uid = me() ?: return
        val row = _saved.value.firstOrNull { it.context == kind.wire && it.messageId == messageId } ?: return
        client.from("saved_messages").delete {
            filter { eq("id", row.id); eq("user_id", uid) }
        }
        _saved.value = _saved.value - row
    }

    fun reset() {
        savedFor = null
        _saved.value = emptyList()
    }

    /** A saved or found message read back through its own table's RLS. */
    data class Resolved(val content: String, val author: Profile?, val createdAt: String?)

    @Serializable
    private data class MessageRef(
        val id: String,
        val content: String = "",
        @SerialName("author_id") val authorId: String? = null,
        @SerialName("created_at") val createdAt: String? = null,
    )

    /** Message id → its live content; missing ids were deleted or are no longer visible. */
    suspend fun resolve(items: List<Pair<ChatKind, String>>): Map<String, Resolved> = coroutineScope {
        val byKind = items.groupBy({ it.first }, { it.second })
        val rows = byKind.map { (kind, ids) ->
            async {
                ids.distinct().chunked(80).flatMap { chunk ->
                    runCatching {
                        client.from(kind.table).select(Columns.raw("id, content, author_id, created_at")) {
                            filter { isIn("id", chunk) }
                        }.decodeList<MessageRef>()
                    }.getOrDefault(emptyList())
                }
            }
        }.flatMap { it.await() }
        val profiles = runCatching { Database.profiles(rows.mapNotNull { it.authorId }) }.getOrDefault(emptyMap())
        rows.associate { it.id to Resolved(it.content, it.authorId?.let { a -> profiles[a] }, it.createdAt) }
    }

    // MARK: - Search

    @Serializable
    data class Hit(
        @SerialName("message_id") val messageId: String,
        @SerialName("source_kind") val sourceKind: String? = null,
        @SerialName("container_id") val containerId: String? = null,
        @SerialName("author_id") val authorId: String? = null,
        val content: String = "",
        @SerialName("created_at") val createdAt: String? = null,
        @SerialName("attachment_count") val attachmentCount: Int = 0,
        val total: Int = 0,
    )

    /**
     * `search_messages_v2`, scoped like the web: a whole space ("server"), or
     * one DM / group. Supports the web's `from:`, `has:`, `before:`, `after:`
     * and `in:` filters typed into the query.
     */
    suspend fun search(
        ctx: ChatContext,
        query: String,
        wholeSpace: Boolean,
        channelByName: (String) -> String? = { null },
        offset: Int = 0,
    ): List<Hit> {
        val filters = mutableMapOf<String, String>()
        val words = mutableListOf<String>()
        for (token in query.trim().split(Regex("\\s+"))) {
            val m = Regex("^(from|has|before|after|during|in|mentions):(.+)$", RegexOption.IGNORE_CASE).find(token)
            if (m != null) filters[m.groupValues[1].lowercase()] = m.groupValues[2] else if (token.isNotBlank()) words += token
        }
        val text = words.joinToString(" ").ifBlank { null }
        val date = Regex("^\\d{4}-\\d{2}-\\d{2}$")
        val scope = when (ctx.kind) {
            ChatKind.Channel -> if (wholeSpace) "server" else "channel"
            ChatKind.Dm -> "dm"
            ChatKind.Group -> "group"
        }
        val inChannel = filters["in"]?.let { channelByName(it.removePrefix("#")) }
        return postgrest.rpc("search_messages_v2", buildJsonObject {
            put("p_scope", scope)
            ctx.serverId?.let { put("p_server_id", it) } ?: put("p_server_id", JsonNull)
            put("p_container_id", ctx.id)
            text?.let { put("p_query", it) } ?: put("p_query", JsonNull)
            inChannel?.let { put("p_channel_id", it) } ?: put("p_channel_id", JsonNull)
            filters["from"]?.let { put("p_from", it.removePrefix("@")) } ?: put("p_from", JsonNull)
            filters["mentions"]?.let { put("p_mentions", it.removePrefix("@")) } ?: put("p_mentions", JsonNull)
            filters["has"]?.lowercase()?.takeIf { it in setOf("link", "embed", "image", "video", "file") }
                ?.let { put("p_has", it) } ?: put("p_has", JsonNull)
            for (key in listOf("before", "after", "during")) {
                filters[key]?.takeIf { date.matches(it) }?.let { put("p_$key", it) } ?: put("p_$key", JsonNull)
            }
            put("p_sort", "newest")
            put("p_limit", 25)
            put("p_offset", offset)
        }).decodeList()
    }

    // MARK: - Per-space notification settings

    @Serializable
    data class NotifySettings(
        val level: String = "mentions",
        @SerialName("suppress_everyone") val suppressEveryone: Boolean = false,
        @SerialName("muted_until") val mutedUntil: String? = null,
    ) {
        val muted: Boolean get() = mutedUntil?.let { com.wsgpolar.disband.core.TimeFormat.parse(it) }
            ?.isAfter(java.time.Instant.now()) == true
        val mutedForever: Boolean get() = mutedUntil?.startsWith("9999") == true
    }

    const val FOREVER = "9999-12-31T00:00:00Z"

    suspend fun notifySettings(serverId: String): NotifySettings =
        client.from("server_notification_settings")
            .select(Columns.raw("level, suppress_everyone, muted_until")) {
                filter { eq("server_id", serverId); me()?.let { eq("user_id", it) } }
                limit(1)
            }.decodeList<NotifySettings>().firstOrNull() ?: NotifySettings()

    suspend fun setNotifySettings(serverId: String, s: NotifySettings) {
        postgrest.rpc("set_server_notification_settings", buildJsonObject {
            put("p_server_id", serverId)
            put("p_level", s.level)
            put("p_suppress_everyone", s.suppressEveryone)
            s.mutedUntil?.let { put("p_muted_until", it) } ?: put("p_muted_until", JsonNull)
        })
    }

    // MARK: - Soundboard

    @Serializable
    data class Sound(
        val id: String,
        @SerialName("server_id") val serverId: String,
        val name: String,
        val emoji: String = "🔊",
        val url: String,
    )

    suspend fun sounds(serverId: String): List<Sound> =
        client.from("server_sounds").select(Columns.ALL) {
            filter { eq("server_id", serverId) }
            order("created_at", Order.DESCENDING)
        }.decodeList()
}
