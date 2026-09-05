package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import io.ktor.client.plugins.timeout
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.webrtc.PeerConnection

/**
 * Fetches relay (TURN) credentials for calls. STUN only cannot carry media
 * behind carrier-grade NAT, so a phone-to-desktop call frequently has no
 * working candidate pair. Cloudflare issues time-limited credentials, minted
 * server-side at `/api/turn`.
 */
class TurnService {
    private var servers: List<PeerConnection.IceServer> = emptyList()
    private var fetchedAt: Long? = null

    private val mutex = Mutex()

    /** Comfortably inside the credential lifetime the server issues. */
    private val cacheLifetimeMillis = 45L * 60L * 1000L

    /** Never block a call for long — degrade to STUN rather than hold up dialling. */
    private val timeoutMillis = 6_000L

    suspend fun iceServers(): List<PeerConnection.IceServer> = mutex.withLock {
        val now = System.currentTimeMillis()
        if (fetchedAt != null && now - fetchedAt!! < cacheLifetimeMillis && servers.isNotEmpty()) {
            return AppConfig.baseIceServers + servers
        }
        val fetched = fetch()
        if (fetched.isNotEmpty()) {
            servers = fetched
            fetchedAt = now
        }
        AppConfig.baseIceServers + fetched
    }

    /** Warm the cache so the first call of a session does not pay for this. */
    suspend fun prewarm() {
        iceServers()
    }

    private suspend fun fetch(): List<PeerConnection.IceServer> {
        val token = try {
            DisbandSupabase.auth.currentSessionOrNull()?.accessToken ?: return emptyList()
        } catch (_: Exception) {
            return emptyList()
        }
        return try {
            val response = ApiHttp.client.get("${AppConfig.WEB_APP_URL}/api/turn") {
                header(HttpHeaders.Authorization, "Bearer $token")
                timeout {
                    requestTimeoutMillis = timeoutMillis
                }
            }
            if (!response.status.isSuccess()) return emptyList()
            val text = response.bodyAsText()
            val iceServers = Json.parseToJsonElement(text).jsonObject["iceServers"]?.jsonArray ?: return emptyList()
            iceServers.mapNotNull { entry ->
                val obj = entry.jsonObject
                val urls = obj["urls"]?.jsonArray?.map { it.jsonPrimitive.content } ?: return@mapNotNull null
                PeerConnection.IceServer.builder(urls)
                    .apply {
                        obj["username"]?.jsonPrimitive?.content?.let { setUsername(it) }
                        obj["credential"]?.jsonPrimitive?.content?.let { setPassword(it) }
                    }
                    .createIceServer()
            }
        } catch (_: Exception) {
            emptyList()
        }
    }
}