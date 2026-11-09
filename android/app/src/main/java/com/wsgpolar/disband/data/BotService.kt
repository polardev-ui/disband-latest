package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/*
 Bot slash commands, bot buttons and forum posts: the same RPCs the web uses
 (migrations 0198 and 0240).
*/

@Serializable
data class BotCommandChoice(val name: String, val value: JsonElement)

@Serializable
data class BotCommandOption(
    val name: String,
    val description: String = "",
    val type: String = "string",
    val required: Boolean = false,
    val choices: List<BotCommandChoice>? = null,
)

@Serializable
data class BotCommand(
    @SerialName("bot_id") val botId: String,
    @SerialName("bot_user_id") val botUserId: String,
    @SerialName("bot_name") val botName: String,
    @SerialName("bot_avatar_url") val botAvatarUrl: String? = null,
    val name: String,
    val description: String = "",
    val options: List<BotCommandOption> = emptyList(),
)

@Serializable
data class ForumPost(
    val id: String,
    val title: String,
    @SerialName("author_id") val authorId: String? = null,
    val tags: List<String>? = null,
    val pinned: Boolean? = null,
    @SerialName("message_count") val messageCount: Int? = null,
    @SerialName("last_message_at") val lastMessageAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    val opening: String? = null,
)

/** Who ran the command a bot's message answers. */
data class BotInteraction(val name: String, val who: String)

data class BotButton(
    val style: String,
    val label: String,
    val customId: String?,
    val url: String?,
    val emoji: String?,
    val disabled: Boolean,
)

class CommandInputException(message: String) : Exception(message)

object BotService {
    private val postgrest get() = DisbandSupabase.postgrest
    private val cache = mutableMapOf<String, Pair<Long, List<BotCommand>>>()

    /** The bots' commands in a space, kept for a minute. */
    suspend fun commands(serverId: String): List<BotCommand> {
        cache[serverId]?.let { (at, list) -> if (System.currentTimeMillis() - at < 60_000) return list }
        val list = runCatching {
            postgrest.rpc("space_bot_commands", buildJsonObject { put("p_server_id", serverId) })
                .decodeAs<List<BotCommand>>()
        }.getOrDefault(emptyList())
        cache[serverId] = System.currentTimeMillis() to list
        return list
    }

    suspend fun run(command: BotCommand, channelId: String, options: JsonObject) {
        postgrest.rpc("invoke_bot_command", buildJsonObject {
            put("p_bot_id", command.botId)
            put("p_channel_id", channelId)
            put("p_name", command.name)
            put("p_options", options)
        })
    }

    suspend fun press(messageId: String, customId: String) {
        postgrest.rpc("press_bot_button", buildJsonObject {
            put("p_message_id", messageId)
            put("p_custom_id", customId)
        })
    }

    /**
     * What was typed for an option, as the bot expects it. People and
     * channels go as ids, as on the web. Null when left empty.
     */
    suspend fun value(option: BotCommandOption, text: String, serverId: String): JsonElement? {
        val t = text.trim()
        if (t.isEmpty()) return null
        return when (option.type) {
            "integer" -> JsonPrimitive(t.toLongOrNull() ?: throw CommandInputException("${option.name} must be a whole number."))
            "number" -> JsonPrimitive(t.toDoubleOrNull() ?: throw CommandInputException("${option.name} must be a number."))
            "boolean" -> JsonPrimitive(t.lowercase() in setOf("yes", "true", "on", "1"))
            "user" -> {
                val name = t.removePrefix("@").lowercase()
                val rows = runCatching {
                    DisbandSupabase.client.from("profiles").select { filter { eq("username", name) }; limit(1) }
                        .decodeList<IdRow>()
                }.getOrDefault(emptyList())
                JsonPrimitive(rows.firstOrNull()?.id ?: throw CommandInputException("No one called @$name."))
            }
            "channel" -> {
                val name = t.removePrefix("#").lowercase()
                val rows = runCatching {
                    DisbandSupabase.client.from("channels").select {
                        filter { eq("server_id", serverId); ilike("name", name) }
                        limit(1)
                    }.decodeList<IdRow>()
                }.getOrDefault(emptyList())
                JsonPrimitive(rows.firstOrNull()?.id ?: throw CommandInputException("No channel called #$name."))
            }
            else -> JsonPrimitive(t)
        }
    }

    /** "kai used /fact", from a message's raw interaction, or null. */
    fun parseInteraction(raw: JsonElement?): BotInteraction? = runCatching {
        val o = raw?.jsonObject ?: return null
        if (o["type"]?.jsonPrimitive?.contentOrNull != "command") return null
        val name = o["name"]?.jsonPrimitive?.contentOrNull ?: return null
        val display = o["display_name"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val who = display.ifEmpty { o["username"]?.jsonPrimitive?.contentOrNull ?: "Someone" }
        BotInteraction(name, who)
    }.getOrNull()

    /** A bot message's button rows; anything odd is skipped. */
    fun parseButtons(raw: JsonElement?): List<List<BotButton>> = runCatching {
        raw?.jsonArray?.mapNotNull { row ->
            val buttons = runCatching { row.jsonObject["components"]?.jsonArray }.getOrNull() ?: return@mapNotNull null
            buttons.mapNotNull { b ->
                runCatching {
                    val o = b.jsonObject
                    BotButton(
                        style = o["style"]?.jsonPrimitive?.contentOrNull ?: "secondary",
                        label = o["label"]?.jsonPrimitive?.contentOrNull ?: "",
                        customId = o["custom_id"]?.jsonPrimitive?.contentOrNull,
                        url = o["url"]?.jsonPrimitive?.contentOrNull,
                        emoji = o["emoji"]?.jsonPrimitive?.contentOrNull,
                        disabled = o["disabled"]?.jsonPrimitive?.booleanOrNull == true,
                    )
                }.getOrNull()
            }.takeIf { it.isNotEmpty() }
        }.orEmpty()
    }.getOrDefault(emptyList())

    @Serializable
    private data class IdRow(val id: String)
}

object ForumService {
    private val postgrest get() = DisbandSupabase.postgrest

    suspend fun posts(forumId: String): List<ForumPost> =
        postgrest.rpc("get_forum_posts", buildJsonObject {
            put("p_forum_id", forumId)
            put("p_limit", 100)
        }).decodeAs()

    /** The new post's id (its own channel). */
    suspend fun create(forumId: String, title: String, content: String): String =
        postgrest.rpc("create_forum_post", buildJsonObject {
            put("p_forum_id", forumId)
            put("p_title", title)
            put("p_content", content)
        }).decodeAs()
}
