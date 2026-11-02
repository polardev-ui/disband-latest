package com.wsgpolar.disband.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Shares what you're playing on Spotify while Disband is open on this phone,
 * the way the web, desktop and iOS apps do.
 *
 * The Spotify connection lives on the server, so this only asks our API what
 * is playing and publishes the answer: to the presence channel, and to
 * `profiles.listening` for anyone not watching presence. It runs only while
 * the app is in front, and doesn't clear the row when it stops, because the
 * person's desktop may be writing the same row; viewers drop a track once
 * its length has run out instead ([Listening.isCurrent]).
 */
class MusicPresenceService(
    private val scope: CoroutineScope,
    private val presence: PresenceService,
) {
    private val _connected = MutableStateFlow<Boolean?>(null)
    /** null until the first answer; then whether a Spotify account is linked. */
    val connected: StateFlow<Boolean?> = _connected.asStateFlow()

    private val _current = MutableStateFlow<Listening?>(null)
    val current: StateFlow<Listening?> = _current.asStateFlow()

    private var loop: Job? = null
    private var lastPublished: Listening? = null
    private var userId: String? = null
    private var foreground = false

    /**
     * Who is signed in (null when nobody is). Called again whenever presence
     * restarts, which forgets the track, so the next poll republishes it.
     */
    fun setUser(userId: String?) {
        this.userId = userId
        lastPublished = null
        if (userId == null) {
            _connected.value = null
            _current.value = null
        }
        restart()
    }

    /** The app came to the front or went behind. */
    fun setForeground(foreground: Boolean) {
        if (this.foreground == foreground) return
        this.foreground = foreground
        restart()
    }

    /** Check right away, e.g. after connecting. */
    fun refreshNow() = restart()

    private fun restart() {
        loop?.cancel()
        loop = null
        if (userId == null || !foreground) return
        loop = scope.launch {
            while (isActive) {
                val wait = tick()
                delay(wait * 1000L)
            }
        }
    }

    /** One poll. Returns how long to wait before the next one, in seconds. */
    private suspend fun tick(): Long {
        val result = fetchNowPlaying() ?: return 15 // network or Spotify trouble
        _connected.value = result.connected == true
        // Nothing linked: ask rarely. A connection made on another device
        // still shows up within a few minutes, or straight away from Settings.
        if (result.connected != true) {
            if (lastPublished != null) publish(null)
            _current.value = null
            return 300
        }
        _current.value = result.listening
        if (changed(result.listening)) publish(result.listening)
        return 8
    }

    /** Republish on a new track, or when the same one restarted or was seeked. */
    private fun changed(next: Listening?): Boolean {
        if (next == null) return lastPublished != null
        val last = lastPublished ?: return true
        if (last.identity != next.identity) return true
        val a = last.startedInstant ?: return false
        val b = next.startedInstant ?: return false
        return kotlin.math.abs(a.toEpochMilli() - b.toEpochMilli()) > 2_000
    }

    private suspend fun publish(listening: Listening?) {
        lastPublished = listening
        presence.updateListening(listening)
        val uid = userId ?: return
        val value = listening?.let { ApiHttp.json.encodeToJsonElement(Listening.serializer(), it) } ?: JsonNull
        runCatching {
            DisbandSupabase.client.from("profiles").update(buildJsonObject { put("listening", value) }) {
                filter { eq("id", uid) }
            }
        }
    }

    @Serializable
    private data class NowPlaying(val connected: Boolean? = null, val listening: Listening? = null)

    @Serializable
    private data class ConnectConfig(
        val connected: Boolean? = null,
        @SerialName("client_id") val clientId: String? = null,
        @SerialName("redirect_uri") val redirectUri: String? = null,
    )

    private fun token(): String? = runCatching { DisbandSupabase.auth.currentSessionOrNull()?.accessToken }.getOrNull()

    private suspend fun fetchNowPlaying(): NowPlaying? {
        val token = token() ?: return null
        return runCatching {
            val res = ApiHttp.client.post("${AppConfig.WEB_APP_URL}/api/music/spotify/now-playing") {
                header("Authorization", "Bearer $token")
            }
            if (!res.status.isSuccess()) return null
            ApiHttp.json.decodeFromString(NowPlaying.serializer(), res.bodyAsText())
        }.getOrNull()
    }

    // MARK: Connecting

    /** The redirect the sign-in started with; the code exchange must repeat it. */
    private var pendingRedirect: String? = null

    /**
     * Open Spotify's sign-in in the browser. The web callback page hands the
     * one-time code back on `disband://spotify-callback` (it does that when
     * the state starts with "app:"), and [finishConnect] exchanges it with
     * this app's own session, so nobody has to be signed in on the web.
     * Returns an error to show, or null once the browser is open.
     */
    suspend fun beginConnect(context: Context): String? {
        val token = token() ?: return "You're signed out. Sign in and try again."
        val config = runCatching {
            val res = ApiHttp.client.get("${AppConfig.WEB_APP_URL}/api/music/spotify/token") {
                header("Authorization", "Bearer $token")
            }
            ApiHttp.json.decodeFromString(ConnectConfig.serializer(), res.bodyAsText())
        }.getOrNull()
        val clientId = config?.clientId
        val redirect = config?.redirectUri
        if (clientId == null || redirect == null) return "Couldn't reach Disband. Check your connection and try again."
        pendingRedirect = redirect
        val url = Uri.parse("https://accounts.spotify.com/authorize").buildUpon()
            .appendQueryParameter("client_id", clientId)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("redirect_uri", redirect)
            .appendQueryParameter("scope", "user-read-currently-playing user-read-playback-state")
            .appendQueryParameter("state", "app:${java.util.UUID.randomUUID()}")
            .build()
        return runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            null
        }.getOrElse { "No browser to open Spotify's sign-in in." }
    }

    private val _connectError = MutableStateFlow<String?>(null)
    /** Why the last sign-in didn't link, for Settings to show. */
    val connectError: StateFlow<String?> = _connectError.asStateFlow()

    fun clearConnectError() { _connectError.value = null }

    /** The browser came back on `disband://spotify-callback`. */
    fun finishConnect(uri: Uri) {
        val code = uri.getQueryParameter("code")
        if (code.isNullOrBlank()) return // cancelled
        scope.launch {
            val token = token()
            val redirect = pendingRedirect ?: "${AppConfig.WEB_APP_URL}/connect/spotify/callback"
            val ok = token != null && runCatching {
                ApiHttp.client.post("${AppConfig.WEB_APP_URL}/api/music/spotify/token") {
                    header("Authorization", "Bearer $token")
                    contentType(ContentType.Application.Json)
                    setBody(buildJsonObject { put("code", code); put("redirect_uri", redirect) })
                }.status.isSuccess()
            }.getOrDefault(false)
            if (ok) {
                pendingRedirect = null
                _connected.value = true
                _connectError.value = null
                refreshNow()
            } else {
                _connectError.value = "Spotify didn't accept that sign-in. Try again."
            }
        }
    }

    /** Unlink Spotify from this account, everywhere. */
    suspend fun disconnect(): Boolean {
        val token = token() ?: return false
        val ok = runCatching {
            ApiHttp.client.delete("${AppConfig.WEB_APP_URL}/api/music/spotify/token") {
                header("Authorization", "Bearer $token")
            }.status.isSuccess()
        }.getOrDefault(false)
        if (!ok) return false
        _connected.value = false
        publish(null)
        _current.value = null
        return true
    }
}
