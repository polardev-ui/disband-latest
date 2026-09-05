package com.wsgpolar.disband.core

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/** Shared HTTP client for the media API, TURN endpoint and edge functions. */
object ApiHttp {
    val json = Json { ignoreUnknownKeys = true }
    val client = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(json)
        }
    }
}