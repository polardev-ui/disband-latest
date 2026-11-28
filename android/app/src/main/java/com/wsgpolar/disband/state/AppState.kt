package com.wsgpolar.disband.state

import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import android.content.Context
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.ThemeManager
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.ClosedDmStore
import com.wsgpolar.disband.data.DmUnreadStore
import com.wsgpolar.disband.data.NotesService
import com.wsgpolar.disband.data.PresenceService
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.ProfilePatch
import com.wsgpolar.disband.data.PushRegistrar
import com.wsgpolar.disband.data.Server
import com.wsgpolar.disband.data.UserStatus
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.exception.AuthRestException
import io.github.jan.supabase.auth.mfa.AuthenticatorAssuranceLevel
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class AuthPhase {
    Loading, SignedOut, MfaRequired, SignedIn,
}

/**
 * Global app/session state, mirroring the iOS `AppState`. Auth observation is
 * driven by the supabase-kt `sessionStatus` flow (persisted session is loaded
 * automatically by `PrefsSessionManager`), with an 8s watchdog that falls back
 * to the sign-in screen if the flow never emits.
 */
class AppState(
    private val scope: CoroutineScope,
    private val context: Context,
    val themeManager: ThemeManager,
    val presence: PresenceService,
    val dmUnread: DmUnreadStore,
    val closedDms: ClosedDmStore,
    val notes: NotesService,
    val turnService: com.wsgpolar.disband.data.TurnService,
    val calls: com.wsgpolar.disband.call.CallManager,
    val music: com.wsgpolar.disband.data.MusicPresenceService,
    val subscriptions: com.wsgpolar.disband.data.SubscriptionService =
        com.wsgpolar.disband.data.SubscriptionService(),
) {
    private val client get() = DisbandSupabase.client

    /** Server voice channels and stages. */
    val voice = com.wsgpolar.disband.call.VoiceSession(context, turnService).also { v ->
        v.isDirectCallActive = { calls.phase.value != com.wsgpolar.disband.call.CallPhase.Idle }
        calls.onGroupRing = { raw -> v.receiveRing(raw) }
    }

    private val _phase = MutableStateFlow(AuthPhase.Loading)
    val phase: StateFlow<AuthPhase> = _phase.asStateFlow()

    private val _session = MutableStateFlow<UserSession?>(null)
    val session = _session.asStateFlow()

    private val _profile = MutableStateFlow<Profile?>(null)
    val profile = _profile.asStateFlow()

    /** Set while the Turnstile dialog should show ("login" or "signup"). */
    private val _captchaAction = MutableStateFlow<String?>(null)
    val captchaAction: StateFlow<String?> = _captchaAction.asStateFlow()
    private var captchaResult: kotlinx.coroutines.CompletableDeferred<String?>? = null

    /** Called by the dialog with the token, or null if it was cancelled. */
    fun finishCaptcha(token: String?) {
        _captchaAction.value = null
        captchaResult?.complete(token)
        captchaResult = null
    }

    private suspend fun requestCaptcha(action: String): String? {
        captchaResult?.complete(null)
        val pending = kotlinx.coroutines.CompletableDeferred<String?>()
        captchaResult = pending
        _captchaAction.value = action
        return pending.await()
    }

    /**
     * Posts to a web gate with this device's restriction marker, keeps any new
     * marker, and when the gate asks for Turnstile shows it and asks again.
     * Returns (status, reply), or null when the server couldn't be reached.
     */
    private suspend fun gate(
        path: String,
        action: String,
        fields: Map<String, String>,
    ): Pair<Int, kotlinx.serialization.json.JsonObject?>? {
        var token: String? = null
        repeat(3) {
            val res = try {
                ApiHttp.client.post("${AppConfig.WEB_APP_URL}/$path") {
                    contentType(ContentType.Application.Json)
                    setBody(buildJsonObject {
                        fields.forEach { (k, v) -> put(k, v) }
                        com.wsgpolar.disband.core.NetworkRestriction.current(context)?.let { put("nr", it) }
                        token?.let { put("turnstileToken", it) }
                    }.toString())
                }
            } catch (e: Exception) {
                return null
            }
            val text = res.bodyAsText()
            com.wsgpolar.disband.core.NetworkRestriction.remember(context, text)
            val reply = runCatching { ApiHttp.json.parseToJsonElement(text).jsonObject }.getOrNull()
            val code = reply?.get("code")?.jsonPrimitive?.contentOrNull
            if (code == "TURNSTILE_REQUIRED" || code == "TURNSTILE_INVALID") {
                val solved = requestCaptcha(action)
                    ?: return res.status.value to buildJsonObject {
                        put("allowed", false); put("error", "Complete the check to continue.")
                    }
                token = solved
            } else {
                return res.status.value to reply
            }
        }
        return null
    }

    private val _authError = MutableStateFlow<String?>(null)
    val authError: StateFlow<String?> = _authError.asStateFlow()

    private val _authNotice = MutableStateFlow<String?>(null)
    val authNotice: StateFlow<String?> = _authNotice.asStateFlow()

    private val _profileError = MutableStateFlow<String?>(null)
    val profileError: StateFlow<String?> = _profileError.asStateFlow()

    private val _servers = MutableStateFlow<List<Server>>(emptyList())
    val servers: StateFlow<List<Server>> = _servers.asStateFlow()

    private val _serversLoading = MutableStateFlow(false)
    val serversLoading: StateFlow<Boolean> = _serversLoading.asStateFlow()

    fun loadServers() {
        val uid = currentUserId ?: return
        scope.launch {
            _serversLoading.value = true
            runCatching { _servers.value = Database.myServers(uid) }
            _serversLoading.value = false
        }
    }

    private var authJob: Job? = null
    private var recovering = false

    val currentUserId: String? get() = _session.value?.user?.id

    fun begin() {
        if (authJob != null) return
        authJob = scope.launch {
            launch { loadingWatchdog() }
            client.auth.sessionStatus.collect { status ->
                when (status) {
                    is SessionStatus.Initializing -> {} // keep the watchdog armed
                    is SessionStatus.NotAuthenticated -> {
                        cancelWatchdog()
                        _session.value = null
                        _profile.value = null
                        _phase.value = AuthPhase.SignedOut
                        presence.stop()
                        music.setUser(null)
                        notes.stop()
                        calls.stop()
                        voice.leave()
                    }
                    is SessionStatus.Authenticated -> {
                        cancelWatchdog()
                        handleSession(status.session)
                    }
                    is SessionStatus.RefreshFailure -> {
                        cancelWatchdog()
                        handleSession(DisbandSupabase.auth.currentSessionOrNull())
                    }
                }
            }
        }
    }

    private var watchdogJob: Job? = null
    private fun loadingWatchdog() {
        watchdogJob = scope.launch {
            delay(8_000)
            if (_phase.value == AuthPhase.Loading) {
                _phase.value = AuthPhase.SignedOut
            }
        }
    }

    private fun cancelWatchdog() {
        watchdogJob?.cancel()
        watchdogJob = null
    }

    private suspend fun handleSession(session: UserSession?) {
        if (session == null) {
            _session.value = null
            _profile.value = null
            _phase.value = AuthPhase.SignedOut
            presence.stop()
            music.setUser(null)
            notes.stop()
            calls.stop()
            voice.leave()
            return
        }
        _session.value = session

        if (mfaChallengeRequired()) {
            _phase.value = AuthPhase.MfaRequired
            return
        }

        loadProfile()
        startProfileWatch()
        com.wsgpolar.disband.data.StreakService.recordVisit(context)
        _phase.value = AuthPhase.SignedIn
        presence.start(currentUserId, chosenStatus())
        music.setUser(currentUserId)
        themeManager.adopt(_profile.value?.theme)
        registerPush()
        startCallListeners()
        subscriptions.start(currentUserId)
        loadServers()
    }

    /** The status the person picked on any device; the live column can read offline. */
    private fun chosenStatus(): UserStatus =
        _profile.value?.preferredStatus ?: _profile.value?.status ?: UserStatus.Online

    /**
     * App back on screen: re-read the status chosen on any device (Online set on
     * desktop shows here too) and rejoin presence, which the OS may have dropped.
     */
    fun onAppForeground() {
        if (_phase.value != AuthPhase.SignedIn) return
        com.wsgpolar.disband.data.ChannelUnreads.start()
        com.wsgpolar.disband.data.StreakService.recordVisit(context)
        scope.launch {
            loadProfile()
            presence.start(currentUserId, chosenStatus())
        }
        // A plan bought or gifted on the web while the app was away, or a
        // first load that failed, would otherwise stay wrong until restart.
        scope.launch { runCatching { subscriptions.start(currentUserId); subscriptions.reload() } }
    }

    /** App closed or sent to the background: offline straight away. The choice stays saved. */
    fun onAppBackground() {
        if (_phase.value != AuthPhase.SignedIn) return
        presence.stop()
    }

    private suspend fun mfaChallengeRequired(): Boolean = try {
        val levels = client.auth.mfa.getAuthenticatorAssuranceLevel("")
        levels.current == AuthenticatorAssuranceLevel.AAL1 &&
            levels.next == AuthenticatorAssuranceLevel.AAL2
    } catch (_: Exception) {
        false
    }

    private suspend fun completeSignedIn() {
        loadProfile()
        startProfileWatch()
        com.wsgpolar.disband.data.StreakService.recordVisit(context)
        _phase.value = AuthPhase.SignedIn
        presence.start(currentUserId, chosenStatus())
        music.setUser(currentUserId)
        themeManager.adopt(_profile.value?.theme)
        registerPush()
        startCallListeners()
        subscriptions.start(currentUserId)
        loadServers()
    }

    /**
     * Your own row, live: a status or name changed on the web or another
     * phone shows here without a restart (the web's `profile:<id>` channel).
     */
    private fun startProfileWatch() {
        val uid = currentUserId ?: return
        com.wsgpolar.disband.data.ProfileStore.onChange = { row ->
            if (row.id == currentUserId) {
                val old = _profile.value
                _profile.value = row.copy(listening = row.listening ?: old?.listening, activity = row.activity ?: old?.activity)
            }
        }
        com.wsgpolar.disband.data.ProfileStore.start(uid)
    }

    private fun startCallListeners() {
        val uid = currentUserId ?: return
        // Kept in step with the profile rather than sampled once. This is read
        // when placing a call, and a profile that had not loaded yet (or failed
        // to) left the name pinned to "User" for the whole session — which is
        // what the person being called saw.
        scope.launch { _profile.collect { p -> p?.name?.let { calls.myName = it } } }
        calls.myName = _profile.value?.name ?: "User"
        calls.start(uid)
        // One call at a time: a 1:1 call that connects takes the mic from voice.
        scope.launch {
            calls.phase.collect { if (it == com.wsgpolar.disband.call.CallPhase.Active && voice.isActive) voice.leave() }
        }
        scope.launch {
            runCatching { Database.unreadDmCounts() }.getOrNull()
                ?.let { rows -> dmUnread.seedUnread(rows.associate { it.threadId to it.unreadCount }) }
        }
        scope.launch {
            runCatching { Database.unreadGroupCounts() }.getOrNull()
                ?.let { rows -> dmUnread.seedGroupUnread(rows.associate { it.groupId to it.unreadCount }) }
        }
    }

    /** Verify a TOTP code against any enrolled factor and promote to aal2. */
    suspend fun verifyMfa(code: String): String? {
        return try {
            val factors = client.auth.mfa.retrieveFactorsForCurrentUser()
            val totp = factors.firstOrNull { it.factorType == "totp" }
                ?: return "No authenticator factor found."
            val challenge = client.auth.mfa.createChallenge(totp.id)
            client.auth.mfa.verifyChallenge(totp.id, challenge.id, code)
            completeSignedIn()
            null
        } catch (_: Exception) {
            "Invalid code. Please try again."
        }
    }

    suspend fun loadProfile() {
        val uid = currentUserId ?: run {
            _profileError.value = "Not signed in."
            return
        }
        try {
            runCatching { client.postgrest.rpc("ensure_user_profile") }
            val profile = Database.profile(uid)
            _profile.value = profile
            com.wsgpolar.disband.data.ProfileStore.put(profile)
            _profileError.value = null
        } catch (e: Exception) {
            if (e.message?.contains("PGRST116") == true && !recovering) {
                recoverSession(e)
                return
            }
            // Logged as well as stored: this used to fail into a field nothing
            // rendered, so the You tab was simply blank with no way to tell why.
            android.util.Log.e("Disband", "loadProfile failed", e)
            _profileError.value = e.message ?: e.toString()
        }
    }

    private suspend fun recoverSession(originalError: Exception) {
        recovering = true
        try {
            if (runCatching { client.auth.retrieveUserForCurrentSession() }.getOrNull() != null) {
                runCatching { client.postgrest.rpc("ensure_user_profile") }
                val uid = currentUserId
                if (uid != null) {
                    val profile = runCatching { Database.profile(uid) }.getOrNull()
                    if (profile != null) {
                        _profile.value = profile
                        _profileError.value = null
                        return
                    }
                }
                _profileError.value = "Your account has no profile yet. Pull to retry, or contact support."
                return
            }

            if (runCatching { client.auth.refreshCurrentSession() }.getOrNull() == null) {
                _profileError.value = null
                _authError.value = "Your session expired and couldn't be renewed. Please sign in again."
                runCatching { client.auth.signOut() }
                _session.value = null
                _profile.value = null
                _phase.value = AuthPhase.SignedOut
            } else {
                loadProfile()
            }
        } finally {
            recovering = false
        }
    }

    suspend fun signIn(email: String, password: String) {
        _authError.value = null
        _authNotice.value = null
        // The web's sign-in gate (rate limits, bans, network restrictions,
        // Turnstile), then the new-IP check, as on web, desktop and iOS.
        val login = gate("api/auth/login-check", "login", mapOf("email" to normalise(email)))
        if (login == null) {
            _authError.value = "We couldn't reach Disband. Check your connection and try again."
            return
        }
        val (loginStatus, loginReply) = login
        if (loginStatus !in 200..299 || loginReply?.get("allowed")?.jsonPrimitive?.booleanOrNull == false) {
            _authError.value = loginReply?.get("error")?.jsonPrimitive?.contentOrNull
                ?: "Sign-in is temporarily blocked. Try again later."
            return
        }
        val ipCheck = gate("api/auth/ip-check", "login", mapOf("email" to normalise(email), "password" to password))
        if (ipCheck != null && ipCheck.first !in 200..299) {
            _authError.value = ipCheck.second?.get("error")?.jsonPrimitive?.contentOrNull
                ?: "Sign-in is temporarily blocked. Try again later."
            return
        }
        try {
            client.auth.signInWith(Email) {
                this.email = normalise(email)
                this.password = password
            }
        } catch (e: Exception) {
            _authError.value = friendlyAuthError(e)
        }
    }

    suspend fun signUp(email: String, password: String) {
        _authError.value = null
        _authNotice.value = null
        // The server's sign-up checks (rate limits, bans) also issue the
        // one-time ticket Supabase now needs to create the account.
        signupCheck(normalise(email))?.let {
            _authError.value = it
            return
        }
        try {
            val info = client.auth.signUpWith(Email) {
                this.email = normalise(email)
                this.password = password
            }
            if (info?.identities.isNullOrEmpty()) {
                _authError.value = "That email is already registered. Log in instead, or reset your password."
                return
            }
            _authNotice.value = "Check $email for a confirmation link to finish setting up your account."
        } catch (e: Exception) {
            _authError.value = friendlyAuthError(e)
        }
    }

    /** Runs the web's sign-up gate. Returns a message to show, or null to go on. */
    private suspend fun signupCheck(email: String): String? {
        val result = gate("api/auth/signup-check", "signup", mapOf("email" to email, "platform" to "android"))
            ?: return "We couldn't reach Disband to check this sign-up. Check your connection and try again."
        val (status, reply) = result
        val allowed = reply?.get("allowed")?.jsonPrimitive?.booleanOrNull
        val error = reply?.get("error")?.jsonPrimitive?.contentOrNull
        return when {
            status in 200..299 && allowed != false -> null
            error != null -> error
            status == 429 -> "Too many sign-up attempts from your network. Try again later."
            else -> "Sign-up is temporarily unavailable. Please try again in a few minutes."
        }
    }

    suspend fun sendPasswordReset(email: String) {
        _authError.value = null
        _authNotice.value = null
        try {
            client.auth.resetPasswordForEmail(normalise(email))
            _authNotice.value = "Password reset email sent."
        } catch (e: Exception) {
            _authError.value = friendlyAuthError(e)
        }
    }

    suspend fun signOut() {
        // Remove this device's token while the old session still owns it.
        // Otherwise the old account keeps receiving pushes on this phone and
        // the next account is skipped because the FCM token has not changed.
        PushRegistrar.unregisterCurrentDevice(context)
        com.wsgpolar.disband.data.ChannelUnreads.reset()
        com.wsgpolar.disband.data.ProfileStore.reset()
        com.wsgpolar.disband.data.MessageTools.reset()
        com.wsgpolar.disband.ui.chat.ChatCache.clear(context)
        runCatching { client.auth.signOut() }
    }

    suspend fun deleteAccount(): String? {
        if (currentUserId == null) return "You're not signed in."
        return try {
            client.postgrest.rpc("delete_my_account")
            runCatching { client.auth.signOut() }
            _session.value = null
            _profile.value = null
            _phase.value = AuthPhase.SignedOut
            null
        } catch (e: Exception) {
            "Couldn't delete your account. Please try again.\n${e.message}"
        }
    }

    suspend fun saveProfile(patch: ProfilePatch): String? {
        val uid = currentUserId ?: return "Not signed in"
        return try {
            Database.updateProfile(uid, patch)
            // Show the change everywhere at once (your profile, the member
            // list, your messages), then confirm it with a fresh read.
            applyOwnPatch(uid, patch)
            loadProfile()
            null
        } catch (e: Exception) {
            e.message ?: e.toString()
        }
    }

    /** "" clears a column, null leaves it, exactly as [Database.updateProfile] writes it. */
    private fun applyOwnPatch(uid: String, patch: ProfilePatch) {
        fun String?.applied(old: String?): String? = when (this) {
            null -> old
            "" -> null
            else -> this
        }
        val change = { p: Profile ->
            p.copy(
                displayName = patch.displayName.applied(p.displayName),
                bio = patch.bio ?: p.bio,
                pronouns = patch.pronouns.applied(p.pronouns),
                statusNote = patch.statusNote.applied(p.statusNote),
                statusExpiresAt = patch.statusExpiresAt.applied(p.statusExpiresAt),
                avatarUrl = patch.avatarUrl ?: p.avatarUrl,
                bannerUrl = patch.bannerUrl ?: p.bannerUrl,
                accentColor = patch.accentColor ?: p.accentColor,
                accentColor2 = patch.accentColor2 ?: p.accentColor2,
            )
        }
        _profile.value?.takeIf { it.id == uid }?.let { _profile.value = change(it) }
        com.wsgpolar.disband.data.ProfileStore.put(_profile.value)
    }

    /** Your status was cleared: same immediate update as [saveProfile]. */
    suspend fun clearStatus(): String? {
        val uid = currentUserId ?: return "Not signed in"
        return try {
            Database.clearStatus(uid)
            applyOwnPatch(uid, ProfilePatch(statusNote = "", statusExpiresAt = ""))
            loadProfile()
            null
        } catch (e: Exception) {
            e.message ?: e.toString()
        }
    }

    suspend fun setStatus(status: UserStatus) {
        val uid = currentUserId ?: return
        try {
            com.wsgpolar.disband.data.ProfileService.updateStatus(status)
            _profile.value = _profile.value?.let {
                if (it.id == uid) it.copy(status = status, preferredStatus = status) else it
            }
            presence.update(status)
        } catch (_: Exception) {
        }
    }

    suspend fun updateTheme(theme: String) {
        themeManager.setTheme(com.wsgpolar.disband.core.ThemeId.from(theme) ?: return)
        com.wsgpolar.disband.data.ProfileService.updateTheme(theme)
    }

    private suspend fun registerPush() {
        runCatching {
            PushRegistrar.registerIfAuthorized(context)
        }
    }

    private fun normalise(email: String) = email.trim().lowercase()

    private fun friendlyAuthError(e: Exception): String {
        val message = if (e is AuthRestException) {
            e.errorDescription ?: e.message ?: "Sign in failed."
        } else {
            e.message ?: "Sign in failed."
        }
        val msg = message.lowercase()
        return when {
            "invalid login" in msg || "credentials" in msg -> "Invalid email or password."
            "already registered" in msg -> "That email is already registered."
            "email not confirmed" in msg -> "Please confirm your email before signing in."
            "only request this after" in msg || "rate limit" in msg ->
                "We just sent that email. Please wait a moment before trying again."
            else -> message
        }
    }
}