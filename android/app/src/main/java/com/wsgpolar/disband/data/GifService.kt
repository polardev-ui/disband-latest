package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.auth.auth
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * GIF search (Giphy proxy on the media API) and the signed-in user's
 * favourites (`/api/gifs/favorites`, shared with web, desktop and iOS).
 *
 * Every call throws on failure so the picker can show an error state; nothing
 * here throws on a malformed body beyond a plain exception.
 */
object GifService {

    @kotlinx.serialization.Serializable
    data class Favorite(
        val id: Long? = null,
        val url: String,
        val title: String? = null,
    ) {
        val key: String get() = gifKey(url)
    }

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Empty query shows "trending", as on iOS. */
    suspend fun search(query: String, limit: Int = 24): List<MediaService.GiphyGif> {
        val q = if (query.isBlank()) "trending" else query.trim()
        val res = ApiHttp.client.get("${AppConfig.MEDIA_API_URL}/giphy/search") {
            parameter("q", q)
            parameter("limit", limit)
        }
        if (!res.status.isSuccess()) error("Search failed (${res.status.value})")
        val root = json.parseToJsonElement(res.bodyAsText()).jsonObject
        val element = root["results"] ?: root["data"] ?: return emptyList()
        return json.decodeFromJsonElement(ListSerializer(MediaService.GiphyGif.serializer()), element)
            .filter { it.fullUrl != null }
    }

    suspend fun favorites(): List<Favorite> {
        val res = ApiHttp.client.get(ENDPOINT) { header("Authorization", bearer()) }
        if (!res.status.isSuccess()) error("Could not load favourites (${res.status.value})")
        val element = json.parseToJsonElement(res.bodyAsText()).jsonObject["favorites"] ?: return emptyList()
        return json.decodeFromJsonElement(ListSerializer(Favorite.serializer()), element)
    }

    suspend fun add(url: String, title: String? = null) {
        val res: HttpResponse = ApiHttp.client.post(ENDPOINT) {
            header("Authorization", bearer())
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("url", url)
                if (title != null) put("title", title)
            }.toString())
        }
        if (!res.status.isSuccess()) error("Could not save favourite (${res.status.value})")
    }

    suspend fun remove(favorite: Favorite) {
        val res: HttpResponse = ApiHttp.client.delete(ENDPOINT) {
            header("Authorization", bearer())
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                val id = favorite.id
                if (id != null) put("id", id) else put("url", favorite.url)
            }.toString())
        }
        if (!res.status.isSuccess()) error("Could not remove favourite (${res.status.value})")
    }

    private const val ENDPOINT = "${AppConfig.WEB_APP_URL}/api/gifs/favorites"

    private fun bearer(): String {
        val token = DisbandSupabase.auth.currentSessionOrNull()?.accessToken ?: error("Not signed in")
        return "Bearer $token"
    }

    /**
     * Same identity as web `gifFavKey` / iOS: host without `www.` plus path,
     * ignoring query and fragment; Giphy is keyed by its GIF id alone.
     */
    fun gifKey(url: String): String {
        val raw = url.trim()
        val uri = runCatching { java.net.URI(raw) }.getOrNull() ?: return raw
        var host = uri.host?.lowercase() ?: return raw
        if (host.startsWith("www.")) host = host.removePrefix("www.")
        val path = (uri.rawPath ?: "").trimEnd('/')
        val isGiphy = host == "giphy.com" || host == "i.giphy.com" ||
            (host.startsWith("media") && host.endsWith(".giphy.com") &&
                host.removePrefix("media").removeSuffix(".giphy.com").all { it.isDigit() })
        if (isGiphy) {
            var parts = path.split("/").drop(1)
            if (parts.firstOrNull() == "media") {
                parts = parts.drop(1)
                if (parts.firstOrNull()?.startsWith("v1.") == true) parts = parts.drop(1)
                if (parts.size == 2 && parts[0].isNotEmpty() && parts[1].isNotEmpty()) {
                    return "giphy.com/media/${parts[0]}"
                }
            }
        }
        return host + path
    }

    /** What iOS/web send for a picked GIF: type "gif", the full URL, no key. */
    fun attachmentFor(url: String) = StoredAttachment(url = url, key = null, type = "gif")
}
