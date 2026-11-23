package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Spends one of this month's Catalysts on a space, through the same route the
 * web uses (`/api/catalysts/allocate`). The server checks the plan and the
 * remaining monthly grant. This client only reports what it says.
 */
object CatalystService {
    /** Null on success, or a message to show. */
    suspend fun allocate(serverId: String): String? {
        val token = runCatching { DisbandSupabase.auth.currentSessionOrNull()?.accessToken }.getOrNull()
            ?: return "You're signed out. Sign in and try again."
        return try {
            val response = ApiHttp.client.post("${AppConfig.WEB_APP_URL}/api/catalysts/allocate") {
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject { put("server_id", serverId) }.toString())
            }
            if (response.status.isSuccess()) null
            else runCatching {
                Json.parseToJsonElement(response.bodyAsText()).jsonObject["error"]?.jsonPrimitive?.content
            }.getOrNull() ?: "Couldn't add a Catalyst. Try again."
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) {
            "Couldn't reach Disband. Check your connection and try again."
        }
    }
}
