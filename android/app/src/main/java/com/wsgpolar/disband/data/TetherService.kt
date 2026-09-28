package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Tether on Android: talk to the web app's `api/tether` routes.
 *
 * Android had none of this, so `@tether` was an ordinary word here and the
 * assistant simply did not exist on the platform — while answering fine for
 * the same account on the web and on iOS.
 *
 * The ask route is authoritative for the Aero gate, the rate limits and the
 * model cost. Exactly like the other clients, the app only decides whether an
 * ask fires at all:
 *   - a sent message mentions `@tether`, or
 *   - it was sent in a DM thread with Tether itself, where no mention is
 *     needed because you are already talking to it.
 *
 * Firing is best-effort and detached from sending: the reply arrives through
 * the normal realtime stream, and an ask that fails must never remove or flag
 * the message that triggered it.
 */
object TetherService {

    @Serializable
    data class TetherInfo(
        val id: String,
        val username: String? = null,
        @SerialName("display_name") val displayName: String? = null,
        @SerialName("avatar_url") val avatarUrl: String? = null,
    )

    @Serializable
    private data class ThreadMembers(
        @SerialName("user_a") val userA: String,
        @SerialName("user_b") val userB: String,
    )

    @Volatile
    private var cachedInfo: TetherInfo? = null

    /**
     * "@tether" as a standalone word, case-insensitively — the same rule as
     * the web client's `mentionsTether`. The word boundary matters: without
     * it, "@tethered" would summon it.
     */
    private val MENTION = Regex("@tether\\b", RegexOption.IGNORE_CASE)

    fun mentionsTether(content: String): Boolean = MENTION.containsMatchIn(content)

    private suspend fun accessToken(): String? = runCatching {
        DisbandSupabase.auth.currentSessionOrNull()?.accessToken
    }.getOrNull()

    /**
     * Resolve (and cache) Tether's user id. Provisions lazily server-side, so
     * this works before the first ask.
     */
    suspend fun tetherInfo(): TetherInfo? {
        cachedInfo?.let { return it }
        val token = accessToken() ?: return null
        return runCatching {
            val response: HttpResponse = ApiHttp.client.get("${AppConfig.WEB_APP_URL}/api/tether/info") {
                header("Authorization", "Bearer $token")
            }
            if (response.status != HttpStatusCode.OK) return null
            response.body<TetherInfo>().also { cachedInfo = it }
        }.getOrNull()
    }

    /**
     * Open (or get) this account's DM thread with Tether. Requires the 0102
     * migration server-side, which lets flagged bots skip the friendship gate
     * — and requires Aero, enforced again by the ask route.
     */
    suspend fun openTetherThread(): String? {
        val info = tetherInfo() ?: return null
        return runCatching { Database.getOrCreateDmThread(info.id) }.getOrNull()
    }

    /**
     * Fire an ask for an already-sent message when warranted.
     *
     * Never throws and never touches send state: whatever happens here, the
     * message the user sent has already landed and must stay landed.
     */
    suspend fun fireAskIfNeeded(
        messageId: String,
        content: String,
        surface: String,
        threadId: String?,
        userId: String,
        isAero: Boolean,
    ) {
        val mentioned = mentionsTether(content)
        val inTetherThread =
            if (surface == "dm" && threadId != null) isTetherThread(threadId, userId) else false
        if (!mentioned && !inTetherThread) return
        // The client-side Aero check is a cost saver only; the route re-checks
        // it and is the one that actually decides.
        if (!isAero) return
        ask(messageId, surface)
    }

    private suspend fun isTetherThread(threadId: String, userId: String): Boolean {
        val info = tetherInfo() ?: return false
        val rows = runCatching {
            DisbandSupabase.client.from("dm_threads")
                .select(Columns.list("user_a", "user_b")) {
                    filter { eq("id", threadId) }
                }
                .decodeList<ThreadMembers>()
        }.getOrNull().orEmpty()
        val thread = rows.firstOrNull() ?: return false
        val other = if (thread.userA == userId) thread.userB else thread.userA
        return other == info.id
    }

    @Serializable
    private data class AskBody(val messageId: String, val surface: String)

    private suspend fun ask(messageId: String, surface: String) {
        val token = accessToken() ?: return
        runCatching {
            ApiHttp.client.post("${AppConfig.WEB_APP_URL}/api/tether/ask") {
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(AskBody(messageId, surface))
            }
        }
    }
}
