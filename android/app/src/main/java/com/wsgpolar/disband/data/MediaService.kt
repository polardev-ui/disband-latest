package com.wsgpolar.disband.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.header
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

    /**
     * Uploads bytes via multipart/form-data to /images; returns the hosted URL.
     *
     * The CDN only accepts uploads from a signed-in user, so the bucket cannot
     * be used as free storage by whoever finds the endpoint. The old host took
     * anything from anyone, which is why this header did not exist before.
     */
    /**
     * HEIC/HEIF photos only display on Apple devices, so anything that isn't
     * already JPEG, PNG, GIF or WebP is re-encoded as JPEG before it goes up.
     */
    private fun webSafe(bytes: ByteArray, filename: String, mimeType: String): Triple<ByteArray, String, String> {
        fun at(i: Int) = if (i < bytes.size) bytes[i].toInt() and 0xFF else -1
        val jpeg = at(0) == 0xFF && at(1) == 0xD8 && at(2) == 0xFF
        val png = at(0) == 0x89 && at(1) == 0x50 && at(2) == 0x4E && at(3) == 0x47
        val gif = at(0) == 0x47 && at(1) == 0x49 && at(2) == 0x46 && at(3) == 0x38
        val webp = at(0) == 0x52 && at(1) == 0x49 && at(2) == 0x46 && at(3) == 0x46 &&
            at(8) == 0x57 && at(9) == 0x45 && at(10) == 0x42 && at(11) == 0x50
        if (jpeg || png || gif || webp || !mimeType.startsWith("image/")) return Triple(bytes, filename, mimeType)
        val bitmap = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes)))
            } else {
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }
        }.getOrNull() ?: return Triple(bytes, filename, mimeType)
        val out = java.io.ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
        val base = filename.substringBeforeLast('.', filename).ifBlank { "image" }
        return Triple(out.toByteArray(), "$base.jpg", "image/jpeg")
    }

    suspend fun uploadImage(bytes: ByteArray, filename: String = "upload.jpg",
                            mimeType: String = "image/jpeg"): MediaUploadResult {
        val (bytes, filename, mimeType) = webSafe(bytes, filename, mimeType)
        val token = runCatching {
            DisbandSupabase.auth.currentSessionOrNull()?.accessToken
        }.getOrNull()

        val response = ApiHttp.client.post("$apiBase/images") {
            token?.let { header("Authorization", "Bearer $it") }
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