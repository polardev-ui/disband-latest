package com.wsgpolar.disband.core

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
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
 * Sessions are persisted encrypted (see [PrefsSessionManager]) so a
 * signed-in user stays signed in across app launches.
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

/**
 * Persists the Supabase session in EncryptedSharedPreferences (AES-256, key
 * in the Android Keystore), so the refresh/access tokens are not sitting in
 * plaintext XML. The one pre-encryption entry is migrated on first read so
 * existing installs stay signed in; the plaintext copy is deleted after a
 * successful move. If the Keystore is unusable (broken hardware, some
 * emulators) it falls back to plaintext rather than locking the user out.
 */
class PrefsSessionManager(context: Context) : SessionManager {
    private val appContext = context.applicationContext
    private val key = "supabase.session"

    private val encrypted: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(appContext, MasterKey.DEFAULT_MASTER_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            "disband_sessions_enc",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private fun store(): SharedPreferences {
        return try {
            val store = encrypted
            // One-time migration from the legacy plaintext file.
            val legacy = appContext.getSharedPreferences("disband_sessions", Context.MODE_PRIVATE)
            legacy.getString(key, null)?.let { raw ->
                if (!store.contains(key)) store.edit().putString(key, raw).apply()
                legacy.edit().remove(key).apply()
            }
            store
        } catch (_: Exception) {
            appContext.getSharedPreferences("disband_sessions", Context.MODE_PRIVATE)
        }
    }

    override suspend fun saveSession(session: UserSession) {
        val raw = DisbandSupabase.sessionJson.encodeToString(UserSession.serializer(), session)
        store().edit().putString(key, raw).apply()
    }

    override suspend fun loadSession(): UserSession {
        val raw = store().getString(key, null) ?: error("No stored session")
        return DisbandSupabase.sessionJson.decodeFromString(UserSession.serializer(), raw)
    }

    override suspend fun deleteSession() {
        store().edit().remove(key).apply()
    }
}

val MainDispatcher = Dispatchers.Default