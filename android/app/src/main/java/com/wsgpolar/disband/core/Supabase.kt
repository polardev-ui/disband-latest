package com.wsgpolar.disband.core

import android.content.Context
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.realtime
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Process-wide shared Supabase client.
 *
 * Sessions are persisted to SharedPreferences (via [PrefsSessionManager]) so a
 * signed-in user stays signed in across app launches without any platform
 * keychain dependency.
 */
object DisbandSupabase {
    lateinit var client: SupabaseClient
        private set

    /** Json used for persisting the auth session. */
    val sessionJson = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    /** Must be called once from Application.onCreate. */
    fun initialize(context: Context) {
        if (::client.isInitialized) return
        client = createSupabaseClient(AppConfig.SUPABASE_URL, AppConfig.SUPABASE_ANON_KEY) {
            httpEngine = OkHttp.create()
            install(Auth) {
                autoLoadFromStorage = true
                autoSaveToStorage = true
                sessionManager = PrefsSessionManager(context.applicationContext)
            }
            install(Postgrest)
            install(Realtime)
        }
    }

    val auth: Auth
        get() = client.auth
    val postgrest: Postgrest
        get() = client.postgrest
    val realtime: Realtime
        get() = client.realtime
}

/** Persists the Supabase session in SharedPreferences. */
class PrefsSessionManager(context: Context) : SessionManager {
    private val prefs = context.getSharedPreferences("disband_sessions", Context.MODE_PRIVATE)
    private val key = "supabase.session"

    override suspend fun saveSession(session: UserSession) {
        val raw = DisbandSupabase.sessionJson.encodeToString(UserSession.serializer(), session)
        prefs.edit().putString(key, raw).apply()
    }

    override suspend fun loadSession(): UserSession {
        val raw = prefs.getString(key, null) ?: error("No stored session")
        return DisbandSupabase.sessionJson.decodeFromString(UserSession.serializer(), raw)
    }

    override suspend fun deleteSession() {
        prefs.edit().remove(key).apply()
    }
}

val MainDispatcher = Dispatchers.Default