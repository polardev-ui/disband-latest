package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add

/** A poll as `get_poll` returns it. Same RPCs as the web (`src/lib/poll.ts`) and iOS. */
@Serializable
data class Poll(
    val id: String,
    val question: String = "",
    val options: List<String> = emptyList(),
    val counts: List<Int> = emptyList(),
    val closed: Boolean = false,
    @SerialName("author_id") val authorId: String? = null,
    @SerialName("my_vote") val myVote: Int? = null,
) {
    fun count(index: Int): Int = counts.getOrElse(index) { 0 }
    val totalVotes: Int get() = options.indices.sumOf { count(it) }
}

object PollService {
    const val MAX_OPTIONS = 10

    private val postgrest get() = DisbandSupabase.postgrest

    suspend fun create(question: String, options: List<String>): Poll =
        postgrest.rpc("create_poll", buildJsonObject {
            put("p_question", question)
            putJsonArray("p_options") { options.forEach { add(it) } }
        }).decodeAs()

    suspend fun get(id: String): Poll =
        postgrest.rpc("get_poll", buildJsonObject { put("p_poll", id) }).decodeAs()

    suspend fun vote(id: String, option: Int): Poll =
        postgrest.rpc("vote_poll", buildJsonObject {
            put("p_poll", id)
            put("p_option", option)
        }).decodeAs()

    suspend fun close(id: String): Poll =
        postgrest.rpc("close_poll", buildJsonObject { put("p_poll", id) }).decodeAs()

    /**
     * Votes are private rows, so nobody sees a table change. Whoever votes or
     * closes tells the others on `poll:<id>`, as the web does.
     */
    fun topic(id: String) = "poll:$id"
}
