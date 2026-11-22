package com.wsgpolar.disband.data

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Custom emoji and stickers from spaces, as on the web (`src/lib/expressions.ts`)
 * and iOS (`ExpressionStore.swift`).
 *
 * Every space you're in is loaded once, so its emoji and stickers can be used
 * in any chat. A message carries a custom emoji as `<:name:id>` (or
 * `<a:name:id>`) and a sticker as an `attachments` entry of type "sticker"
 * whose `url` is the sticker's id. Anything from a space you're not in is
 * looked up by id (migration 0283 lets anyone signed in read both).
 */
object ExpressionStore {
    @Serializable
    data class CustomEmoji(
        val id: Long,
        val name: String,
        val url: String,
        @SerialName("server_id") val serverId: String,
    ) {
        val key: String get() = id.toString()
        val animated: Boolean get() = Regex("""\.(gif|webp|apng)(\?|$)""", RegexOption.IGNORE_CASE).containsMatchIn(url)
    }

    @Serializable
    data class SpaceSticker(
        val id: String,
        @SerialName("server_id") val serverId: String,
        val name: String,
        val tags: String? = null,
        val url: String,
        val format: String,
    )

    @Serializable
    data class Space(
        val id: String,
        val name: String,
        @SerialName("icon_url") val iconUrl: String? = null,
    )

    /** The name the picker and composer use, with ~1, ~2… when another space has it too. */
    data class Choice(val emoji: CustomEmoji, val label: String)

    @Serializable
    private data class Membership(@SerialName("server_id") val serverId: String)

    val spaces = mutableStateListOf<Space>()
    val emojiBySpace = mutableStateMapOf<String, List<CustomEmoji>>()
    val stickersBySpace = mutableStateMapOf<String, List<SpaceSticker>>()
    private val emojiById = mutableStateMapOf<String, CustomEmoji>()
    private val stickerById = mutableStateMapOf<String, SpaceSticker>()
    private val missingEmoji = mutableStateMapOf<String, Boolean>()
    private val missingStickers = mutableStateMapOf<String, Boolean>()
    val loaded = mutableStateOf(false)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val pendingEmoji = mutableSetOf<String>()
    private val pendingStickers = mutableSetOf<String>()
    private var flushJob: Job? = null
    private var loading = false

    private val client get() = DisbandSupabase.client
    private fun columns(spec: String) = Columns.raw(spec)

    /** Load the emoji and stickers of every space you're in (once; `force` reloads). */
    suspend fun loadMySpaces(force: Boolean = false) {
        if (loading || (loaded.value && !force)) return
        val userId = runCatching { DisbandSupabase.auth.currentUserOrNull()?.id }.getOrNull() ?: return
        loading = true
        try {
            val ids = client.from("server_members")
                .select(columns("server_id")) { filter { eq("user_id", userId) } }
                .decodeList<Membership>().map { it.serverId }.distinct()
            if (ids.isEmpty()) { loaded.value = true; return }
            coroutineScope {
                val spaceRows = async {
                    client.from("servers").select(columns("id, name, icon_url")) {
                        filter { isIn("id", ids) }
                        order("created_at", Order.ASCENDING)
                    }.decodeList<Space>()
                }
                val emojiRows = async {
                    client.from("custom_emoji").select(columns("id, name, url, server_id")) {
                        filter { isIn("server_id", ids) }
                        order("name", Order.ASCENDING)
                    }.decodeList<CustomEmoji>()
                }
                // Empty until migration 0283 is applied.
                val stickerRows = async {
                    runCatching {
                        client.from("server_stickers").select(columns("id, server_id, name, tags, url, format")) {
                            filter { isIn("server_id", ids) }
                            order("created_at", Order.ASCENDING)
                        }.decodeList<SpaceSticker>()
                    }.getOrDefault(emptyList())
                }
                val s = spaceRows.await()
                val e = emojiRows.await()
                val st = stickerRows.await()
                spaces.clear(); spaces.addAll(s)
                emojiBySpace.clear(); emojiBySpace.putAll(e.groupBy { it.serverId })
                stickersBySpace.clear(); stickersBySpace.putAll(st.groupBy { it.serverId })
                e.forEach { emojiById[it.key] = it }
                st.forEach { stickerById[it.id] = it }
            }
            loaded.value = true
        } catch (_: Exception) {
            // Offline or signed out: try again next time.
        } finally {
            loading = false
        }
    }

    /** Spaces that have stickers, in your space list's order. */
    fun stickerSpaces(): List<Pair<Space, List<SpaceSticker>>> =
        spaces.mapNotNull { space -> stickersBySpace[space.id]?.takeIf { it.isNotEmpty() }?.let { space to it } }

    fun choices(): List<Choice> {
        val seen = HashMap<String, Int>()
        return spaces.flatMap { space ->
            (emojiBySpace[space.id] ?: emptyList()).map { emoji ->
                val n = seen.getOrDefault(emoji.name.lowercase(), 0)
                seen[emoji.name.lowercase()] = n + 1
                Choice(emoji, if (n == 0) emoji.name else "${emoji.name}~$n")
            }
        }
    }

    /** A custom emoji by id, or null while it's looked up (see [isEmojiMissing]). */
    fun emoji(id: String): CustomEmoji? {
        emojiById[id]?.let { return it }
        if (missingEmoji[id] != true) request(pendingEmoji, id)
        return null
    }

    fun isEmojiMissing(id: String) = missingEmoji[id] == true

    /** A space sticker by id, or null while it's looked up (see [isStickerMissing]). */
    fun sticker(id: String): SpaceSticker? {
        stickerById[id]?.let { return it }
        if (missingStickers[id] != true) request(pendingStickers, id)
        return null
    }

    fun isStickerMissing(id: String) = missingStickers[id] == true

    private fun request(set: MutableSet<String>, id: String) {
        if (!set.add(id)) return
        if (flushJob?.isActive == true) return
        flushJob = scope.launch {
            delay(30)
            val emojiIds = pendingEmoji.toList(); pendingEmoji.clear()
            val stickerIds = pendingStickers.toList(); pendingStickers.clear()
            if (emojiIds.isNotEmpty()) {
                val numeric = emojiIds.mapNotNull { it.toLongOrNull() }
                val rows = runCatching {
                    if (numeric.isEmpty()) emptyList()
                    else client.from("custom_emoji").select(columns("id, name, url, server_id")) {
                        filter { isIn("id", numeric) }
                    }.decodeList<CustomEmoji>()
                }.getOrDefault(emptyList())
                rows.forEach { emojiById[it.key] = it }
                emojiIds.filter { emojiById[it] == null }.forEach { missingEmoji[it] = true }
            }
            if (stickerIds.isNotEmpty()) {
                val uuids = stickerIds.filter { Regex("^[0-9a-fA-F-]{36}$").matches(it) }
                val rows = runCatching {
                    if (uuids.isEmpty()) emptyList()
                    else client.from("server_stickers").select(columns("id, server_id, name, tags, url, format")) {
                        filter { isIn("id", uuids) }
                    }.decodeList<SpaceSticker>()
                }.getOrDefault(emptyList())
                rows.forEach { stickerById[it.id] = it }
                stickerIds.filter { stickerById[it] == null }.forEach { missingStickers[it] = true }
            }
        }
    }

    val TOKEN = Regex("""<a?:([a-zA-Z0-9_]{2,32}):(\d+)>""")
    private val CODE = Regex("```[\\s\\S]*?```|`[^`\\n]*`")
    private val LABEL = Regex("""(?<![<\w])(?<!<a):([a-zA-Z0-9_]{2,32}(?:~\d+)?):(?!\d)""")

    /** `:name:` and `:name~1:` in a message about to be sent become `<:name:id>` (code left alone). */
    fun encode(text: String): String {
        if (!text.contains(':')) return text
        val byLabel = choices().associateBy({ it.label.lowercase() }, { it.emoji })
        if (byLabel.isEmpty()) return text
        return mapOutsideCode(text) { part ->
            LABEL.replace(part) { m ->
                val emoji = byLabel[m.groupValues[1].lowercase()] ?: return@replace m.value
                "<${if (emoji.animated) "a" else ""}:${emoji.name}:${emoji.id}>"
            }
        }
    }

    /** The other way, for editing: `<:name:id>` back to what you'd type. */
    fun decode(text: String): String {
        val byId = choices().associateBy({ it.emoji.key }, { it.label })
        return TOKEN.replace(text) { m -> ":${byId[m.groupValues[2]] ?: m.groupValues[1]}:" }
    }

    /** For one-line previews: `<:name:id>` reads as `:name:`. */
    fun plain(text: String): String = TOKEN.replace(text) { ":${it.groupValues[1]}:" }

    private fun mapOutsideCode(text: String, transform: (String) -> String): String {
        val out = StringBuilder()
        var last = 0
        for (m in CODE.findAll(text)) {
            out.append(transform(text.substring(last, m.range.first)))
            out.append(m.value)
            last = m.range.last + 1
        }
        out.append(transform(text.substring(last)))
        return out.toString()
    }
}
