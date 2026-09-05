package com.wsgpolar.disband.state

import android.content.Context
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.ThemeManager
import com.wsgpolar.disband.data.Database
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
    val notes: NotesService,
    val turnService: com.wsgpolar.disband.data.TurnService,
    val calls: com.wsgpolar.disband.call.CallManager,
) {
    private val client get() = DisbandSupabase.client

    private val _phase = MutableStateFlow(AuthPhase.Loading)
    val phase: StateFlow<AuthPhase> = _phase.asStateFlow()

    private val _session = MutableStateFlow<UserSession?>(null)
    val session = _session.asStateFlow()

    private val _profile = MutableStateFlow<Profile?>(null)
    val profile = _profile.asStateFlow()

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
                        calls.stop()
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
            calls.stop()
            return
        }
        _session.value = session

        if (mfaChallengeRequired()) {
            _phase.value = AuthPhase.MfaRequired
            return
        }

        loadProfile()
        _phase.value = AuthPhase.SignedIn
        presence.start(currentUserId, _profile.value?.status ?: UserStatus.Offline)
        themeManager.adopt(_profile.value?.theme)
        registerPush()
        startCallListeners()
        loadServers()
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
        _phase.value = AuthPhase.SignedIn
        presence.start(currentUserId, _profile.value?.status ?: UserStatus.Offline)
        themeManager.adopt(_profile.value?.theme)
        registerPush()
        startCallListeners()
        loadServers()
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