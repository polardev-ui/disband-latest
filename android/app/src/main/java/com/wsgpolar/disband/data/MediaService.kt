package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.append
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Uploads to the same media API the web/desktop apps use and proxies Giphy
 * search. Mirrors `ios/DisbandiOS/Services/MediaService.swift`.
 */
object MediaService {
    private const val apiBase = AppConfig.MEDIA_API_URL

    /** A GIF result from the Giphy proxy. */
    @Serializable
    data class GiphyGif(
        val id: String,
        val url: String? = null,
        val preview: String? = null,
        val images: Images? = null,
    ) {
        @Serializable
        data class Images(@SerialName("fixed_width") val fixedWidth: Variant? = null) {
            @Serializable
            data class Variant(val url: String? = null)
        }

        val fullUrl: String? get() = url ?: images?.fixedWidth?.url ?: preview
        val thumbUrl: String? get() = images?.fixedWidth?.url ?: fullUrl
    }

    class UploadException(message: String) : Exception(message)

    /** Uploads bytes via multipart/form-data to /images; returns the hosted URL. */
    suspend fun uploadImage(bytes: ByteArray, filename: String = "upload.jpg",
                            mimeType: String = "image/jpeg"): MediaUploadResult {
        val response = ApiHttp.client.post("$apiBase/images") {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append(
                            "file",
                            bytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, mimeType)
                                append(HttpHeaders.ContentDisposition, "filename=\"$filename\"")
                            },
                        )
                    },
                ),
            )
        }
        val text = response.bodyAsText()
        if (!response.status.isSuccess()) {
            throw UploadException("Upload failed (HTTP ${response.status.value})")
        }
        val obj = Json.parseToJsonElement(text).jsonObject
        val success = obj["success"]?.jsonPrimitive?.booleanOrNull != false
        val url = obj["url"]?.jsonPrimitive?.content
        return if (success && url != null) {
            MediaUploadResult(
                url = url,
                key = obj["key"]?.jsonPrimitive?.content?.takeIf { it != "null" },
            )
        } else {
            throw UploadException(
                obj["message"]?.jsonPrimitive?.content ?: "Upload failed",
            )
        }
    }

    /** Searches GIFs via the media-API Giphy proxy. */
    suspend fun searchGifs(query: String, limit: Int = 24): List<GiphyGif> {
        val q = if (query.isBlank()) "trending" else query
        val text = ApiHttp.client.get("$apiBase/giphy/search") {
            parameter("q", q)
            parameter("limit", limit)
        }.bodyAsText()
        return runCatching {
            val root = Json.parseToJsonElement(text).jsonObject
            val element = root["results"] ?: root["data"] ?: return emptyList()
            Json { ignoreUnknownKeys = true }.decodeFromJsonElement(
                ListSerializer(GiphyGif.serializer()),
                element,
            ).filter { it.fullUrl != null }
        }.getOrDefault(emptyList())
    }
}