package com.wsgpolar.disband.call

import android.content.Context
import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.TurnService
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.broadcast
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.channel
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.webrtc.SessionDescription

/** Mirrors the iOS `CallPhase` state machine. */
enum class CallPhase {
    Idle, Outgoing, Incoming, Active,
}

/** An incoming call presented to the user. */
data class IncomingCall(
    val fromId: String,
    val callerName: String,
    val callId: String,
    val profile: Profile? = null,
)

/**
 * 1:1 WebRTC call manager over Supabase Realtime, wire-compatible with the
 * iOS `CallManager` and web `useCallManager`.
 *
 *  - Ring bus:   `call-user:<uid>`  (ring/accept/reject/cancel/handled)
 *  - Signal bus: `call:<callId>`    (offer/answer/ice/leave)
 *  - Event name: `"call"` on both.
 *  - callId = sorted(userId, peerId).joinToString(":")
 */
class CallManager(
    private val scope: CoroutineScope,
    private val appContext: Context,
) {
    private val client get() = DisbandSupabase.client

    private val _phase = MutableStateFlow(CallPhase.Idle)
    val phase: StateFlow<CallPhase> = _phase.asStateFlow()

    private val _incoming = MutableStateFlow<IncomingCall?>(null)
    val incoming: StateFlow<IncomingCall?> = _incoming.asStateFlow()

    private val _activePeer = MutableStateFlow<Profile?>(null)
    val activePeer: StateFlow<Profile?> = _activePeer.asStateFlow()

    private val _micMuted = MutableStateFlow(false)
    val micMuted: StateFlow<Boolean> = _micMuted.asStateFlow()

    private val _deafened = MutableStateFlow(false)
    val deafened: StateFlow<Boolean> = _deafened.asStateFlow()

    private val _speakerOn = MutableStateFlow(false)
    val speakerOn: StateFlow<Boolean> = _speakerOn.asStateFlow()

    private val _callNotice = MutableStateFlow<String?>(null)
    val callNotice: StateFlow<String?> = _callNotice.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _connectedAt = MutableStateFlow<Long?>(null)
    val connectedAt: StateFlow<Long?> = _connectedAt.asStateFlow()

    /** Display name used on `ring`/`reject`; set when the profile loads. */
    var myName: String = "User"

    private var userId: String? = null
    private var activeCallId: String? = null
    private var activePeerId: String? = null

    private var listenJob: Job? = null
    private var signalJob: Job? = null
    private var ringWatchdog: Job? = null
    private var engine: WebRTCEngine? = null
    private var sendChannel: RealtimeChannel? = null
    private var ongoingNotificationId: Int? = null

    private val turnService = TurnService()

    data class PendingCall(
        val callId: String,
        val from: String,
        val callerName: String,
    )

    private var pendingPush: PendingCall? = null

    // MARK: - Lifecycle

    /** Subscribe to `call-user:<uid>`, reconnecting with backoff. */
    fun start(uid: String) {
        if (userId == uid && listenJob != null) return
        userId = uid
        listenJob?.cancel()
        listenJob = scope.launch {
            var backoff = 1_000L
            while (isActive) {
                var channel: io.github.jan.supabase.realtime.RealtimeChannel? = null
                try {
                    val ch = client.channel("call-user:$uid") { broadcast { } }
                    channel = ch
                    // The flow has to exist before joining, and the join has to
                    // happen at all: this channel was the only one in the app
                    // that never called subscribe(), so the listener was wired
                    // up to a topic the client had not joined and no ring ever
                    // arrived. Outgoing calls worked because the send path
                    // subscribes, which is what made this look one-directional.
                    val signals = ch.broadcastFlow<CallSignal>("call")
                    val pump = launch { signals.collect { handleSignal(it) } }
                    ch.subscribe(blockUntilSubscribed = true)
                    backoff = 1_000L
                    pump.join()
                } catch (_: Exception) {
                    delay(backoff)
                    backoff = (backoff * 2).coerceAtMost(10_000L)
                } finally {
                    runCatching { channel?.unsubscribe() }
                }
            }
        }
        val push = pendingPush
        if (push != null) {
            pendingPush = null
            scope.launch { handleCallPush(push.callId, push.from, push.callerName) }
        }
    }

    fun stop() {
        resetInternal()
        listenJob?.cancel()
        listenJob = null
        userId = null
    }

    // MARK: - Public actions

    suspend fun startCall(peer: Profile) {
        val uid = userId ?: return
        val callId = directCallId(uid, peer.id)
        activePeerId = peer.id
        activeCallId = callId
        _activePeer.value = peer
        _phase.value = CallPhase.Outgoing
        _callNotice.value = null
        _error.value = null
        armRingWatchdog()
        showOngoingNotification(title = "Calling ${peer.name}", body = peer.name, ongoing = true)
        if (soundEnabled()) CallTones.startCallingTone()
        val ring = CallSignal(type = "ring", from = uid, to = peer.id, callId = callId, callerName = myName)
        // Realtime ring + FCM push — either can wake the callee. Retry ring
        // because a single broadcast is lossy on mobile (doze/brief disconnect).
        send(peer.id, ring)
        fireCallPush(callId = callId, calleeId = peer.id, callerName = myName)
        // Retry ring a couple times if still outgoing (callee didn't answer yet)
        scope.launch {
            repeat(2) { i ->
                kotlinx.coroutines.delay(1800L + i * 1000L)
                if (_phase.value == CallPhase.Outgoing && activeCallId == callId) {
                    send(peer.id, ring)
                    // re-push in case FCM was throttled the first time
                    if (i == 1) fireCallPush(callId = callId, calleeId = peer.id, callerName = myName)
                }
            }
        }
    }

    suspend fun acceptCall(call: IncomingCall) {
        val uid = userId ?: return
        _incoming.value = null
        stopAudioAlerts()
        setupRtc(callId = call.callId, peerId = call.fromId, asCaller = false)
        send(call.fromId, CallSignal(type = "accept", from = uid, to = call.fromId,
            callId = call.callId))
        // Tell this account's other devices to stop ringing.
        send(uid, CallSignal(type = "handled", from = uid, to = uid, callId = call.callId))
    }

    suspend fun rejectCall(call: IncomingCall) {
        val uid = userId ?: return
        send(call.fromId, CallSignal(type = "reject", from = uid, to = call.fromId,
            callId = call.callId, rejecterName = myName))
        send(uid, CallSignal(type = "handled", from = uid, to = uid, callId = call.callId))
        resetInternal()
    }

    /** "Hang up" on the call notification. */
    fun hangUpFromNotification() {
        scope.launch { runCatching { endCall() } }
    }

    /** "Answer" on an incoming-call notification. */
    fun answerFromNotification() {
        val call = _incoming.value ?: return
        scope.launch { runCatching { acceptCall(call) } }
    }

    suspend fun endCall() {
        val uid = userId
        val peerId = activePeerId
        val callId = activeCallId
        when (_phase.value) {
            CallPhase.Outgoing -> if (uid != null && peerId != null && callId != null) {
                send(peerId, CallSignal(type = "cancel", from = uid, to = peerId, callId = callId))
            }
            else -> if (uid != null && peerId != null && callId != null) {
                sendOnSignalChannel(
                    CallSignal(type = "leave", from = uid, to = peerId, callId = callId),
                )
                send(peerId, CallSignal(type = "leave", from = uid, to = peerId, callId = callId))
            }
        }
        resetInternal()
    }

    fun toggleMic() {
        val muted = !_micMuted.value
        _micMuted.value = muted
        if (!_deafened.value) engine?.setMicEnabled(!muted)
    }

    fun toggleDeafen() {
        val deafened = !_deafened.value
        _deafened.value = deafened
        engine?.let {
            it.setRemoteAudioEnabled(!deafened)
            it.setMicEnabled(!(deafened || _micMuted.value))
        }
    }

    fun toggleSpeaker() {
        val on = !_speakerOn.value
        _speakerOn.value = on
        engine?.setSpeaker(on)
    }

    /** Linked from FCM data pushes (incoming call when backgrounded). */
    suspend fun handleCallPush(callId: String, from: String, callerName: String) {
        val current = userId
        if (current == null) {
            pendingPush = PendingCall(callId, from, callerName)
            return
        }
        if (_phase.value != CallPhase.Idle) return
        ringIncoming(IncomingCall(fromId = from, callerName = callerName, callId = callId))
    }

    // MARK: - Ring bus

    private suspend fun ringIncoming(call: IncomingCall) {
        _incoming.value = call
        _phase.value = CallPhase.Incoming
        armRingWatchdog()
        showOngoingNotification(title = "Incoming call", body = call.callerName, ongoing = false, isIncoming = true,
            callId = call.callId, fromId = call.fromId)
        if (soundEnabled()) {
            CallTones.startRingtone()
            CallHaptics.startRingVibration(appContext, scope)
        }
        scope.launch {
            runCatching { Database.profile(call.fromId) }
                .getOrNull()
                ?.let { p -> _incoming.value = call.copy(profile = p) }
        }
    }

    private suspend fun handleSignal(signal: CallSignal) {
        when (signal.type) {
            "ring" -> {
                val callId = signal.callId ?: return
                if (_phase.value != CallPhase.Idle) {
                    // Busy → auto-decline, mirroring iOS.
                    send(signal.from, CallSignal(type = "reject", from = userId.orEmpty(),
                        to = signal.from, callId = callId, rejecterName = myName))
                    return
                }
                ringIncoming(
                    IncomingCall(
                        fromId = signal.from,
                        callerName = signal.callerName ?: "Disband call",
                        callId = callId,
                    ),
                )
            }
            "accept" -> {
                val callId = signal.callId ?: return
                if (_phase.value == CallPhase.Outgoing && callId == activeCallId) {
                    stopAudioAlerts()
                    setupRtc(callId = callId, peerId = signal.from, asCaller = true)
                }
            }
            "reject" -> {
                if (_phase.value == CallPhase.Outgoing && signal.callId == activeCallId) {
                    _callNotice.value = "Declined"
                    resetInternal()
                }
            }
            "cancel" -> {
                if (_phase.value == CallPhase.Incoming && signal.callId == incoming.value?.callId) {
                    resetInternal()
                }
            }
            "handled" -> {
                // Accepted/rejected on another device of the same account.
                if (_phase.value == CallPhase.Incoming && signal.callId == incoming.value?.callId) {
                    resetInternal()
                }
            }
            "leave" -> {
                if (signal.callId == activeCallId) resetInternal()
            }
        }
    }

    private suspend fun send(targetId: String, signal: CallSignal) {
        val uid = userId ?: return
        var lastError: Exception? = null
        repeat(2) { attempt ->
            try {
                val channel = client.channel("call-user:$targetId") {
                    broadcast { acknowledgeBroadcasts = false }
                }
                // blockUntilSubscribed: supabase-kt's subscribe() returns
                // before the JOIN completes by default, and a broadcast sent on
                // a channel that has not joined yet is silently dropped. That
                // is what made a desktop -> Android call connect on the phone
                // and hang forever on the PC: the phone's "accept" never left.
                kotlinx.coroutines.withTimeoutOrNull(6_000) {
                    channel.subscribe(blockUntilSubscribed = true)
                }
                try {
                    channel.broadcast("call", signal)
                    // Let the frame reach the socket before tearing the channel
                    // down; unsubscribing immediately can cut it short.
                    kotlinx.coroutines.delay(120)
                } finally {
                    runCatching { channel.unsubscribe() }
                }
                return
            } catch (e: Exception) {
                lastError = e
                if (attempt == 0) kotlinx.coroutines.delay(600)
            }
        }
        android.util.Log.w("CallManager", "send ${signal.type} to $targetId failed: ${lastError?.message}")
    }

    // MARK: - Signal bus

    private suspend fun setupRtc(callId: String, peerId: String, asCaller: Boolean) {
        val uid = userId ?: return
        activeCallId = callId
        activePeerId = peerId
        _phase.value = CallPhase.Active
        _connectedAt.value = System.currentTimeMillis()
        _error.value = null
        showOngoingNotification(title = "Ongoing call", body = _activePeer.value?.name ?: peerId, ongoing = true)
        CallTones.playConnected()

        val servers = runCatching { turnService.iceServers() }.getOrElse { AppConfig.baseIceServers }

        val engine = try {
            WebRTCEngine(
                appContext = appContext,
                iceServers = servers,
                onSignal = { signal ->
                    scope.launch {
                        sendOnSignalChannel(signal.copy(from = uid, to = peerId, callId = callId))
                    }
                },
                onRemoteAudioTrack = { track -> track?.setEnabled(!_deafened.value) },
                onConnectionFailed = {
                    _error.value = "Connection lost"
                    scope.launch { endCall() }
                },
            )
        } catch (e: Exception) {
            _error.value = "Couldn't start audio"
            resetInternal()
            return
        }
        this.engine = engine
        engine.setSpeaker(_speakerOn.value)
        engine.setMicEnabled(!(_micMuted.value || _deafened.value))

        scope.launch {
            runCatching { Database.profile(peerId) }.getOrNull()?.let { _activePeer.value = it }
        }

        try {
            val signalChannel = client.channel("call:$callId") { broadcast { acknowledgeBroadcasts = false } }
            // Wait for the JOIN, rather than hoping a timeout covers it: the
            // offer/answer and every ICE candidate ride this channel.
            kotlinx.coroutines.withTimeoutOrNull(6_000) {
                signalChannel.subscribe(blockUntilSubscribed = true)
            }
            sendChannel = signalChannel
            signalJob?.cancel()
            signalJob = scope.launch {
                signalChannel.broadcastFlow<CallSignal>("call").collect { handleCallSignal(it) }
            }
            // small yield so collector is running before we send
            kotlinx.coroutines.delay(200)
            if (asCaller) {
                val offer = engine.makeOffer()
                sendOnSignalChannel(
                    CallSignal(type = "offer", from = uid, to = peerId, callId = callId,
                        sdp = CallSdp(type = offer.type.wire(), sdp = offer.description)),
                )
            }
        } catch (e: Exception) {
            _error.value = e.message ?: "Call failed"
            resetInternal()
        }
    }

    private suspend fun handleCallSignal(signal: CallSignal) {
        // Ignore our own echoes (server may reflect with self:true).
        if (signal.from == userId) return
        when (signal.type) {
            "offer" -> {
                val sdp = signal.sdp ?: return
                try {
                    engine?.setRemote(sdp)
                    val answer = engine?.makeAnswer() ?: return
                    sendOnSignalChannel(
                        CallSignal(type = "answer", from = userId.orEmpty(), to = signal.from,
                            callId = activeCallId,
                            sdp = CallSdp(type = answer.type.wire(), sdp = answer.description)),
                    )
                } catch (_: Exception) {
                    _error.value = "Couldn't connect"
                    resetInternal()
                }
            }
            "answer" -> {
                val sdp = signal.sdp ?: return
                runCatching { engine?.setRemote(sdp) }
            }
            "ice" -> {
                val candidate = signal.candidate ?: return
                runCatching { engine?.addIceCandidate(candidate) }
            }
            "leave" -> resetInternal()
        }
    }

    private suspend fun sendOnSignalChannel(signal: CallSignal) {
        val channel = sendChannel ?: return
        var ok = runCatching { channel.broadcast("call", signal) }.isSuccess
        if (!ok) {
            kotlinx.coroutines.delay(400)
            runCatching { channel.broadcast("call", signal) }
        }
    }

    // MARK: - Watchdog / reset / helpers

    private fun armRingWatchdog() {
        ringWatchdog?.cancel()
        ringWatchdog = scope.launch {
            delay(60_000)
            if (_phase.value == CallPhase.Outgoing || _phase.value == CallPhase.Incoming) {
                _callNotice.value = if (_phase.value == CallPhase.Outgoing) "No answer" else null
                resetInternal()
            }
        }
    }

    private fun stopAudioAlerts() {
        CallTones.stop()
        CallHaptics.stopVibration()
    }

    private fun resetInternal() {
        ringWatchdog?.cancel()
        ringWatchdog = null
        stopAudioAlerts()
        cancelOngoingNotification()
        runCatching { engine?.dispose() }
        engine = null
        signalJob?.cancel()
        signalJob = null
        // Reusing a deterministic callId (alice:bob) immediately after hangup
        // raced the async unsubscribe, so the second call's offer was sent on a
        // stale channel. Best-effort synchronous unsubscribe with fallback.
        try { kotlinx.coroutines.runBlocking { sendChannel?.unsubscribe() } } catch (_: Exception) {
            sendChannel?.let { ch -> scope.launch { runCatching { ch.unsubscribe() } } }
        }
        sendChannel = null
        _phase.value = CallPhase.Idle
        _incoming.value = null
        _activePeer.value = null
        activeCallId = null
        activePeerId = null
        _connectedAt.value = null
        _micMuted.value = false
        _deafened.value = false
        _speakerOn.value = false
    }

    private fun showOngoingNotification(title: String, body: String, ongoing: Boolean,
                                         isIncoming: Boolean = false, callId: String? = null, fromId: String? = null) {
        // A foreground service, not a bare notify(): Android freezes a
        // backgrounded process and takes the call down with it, and only a
        // CallStyle notification gets the system's call treatment on the lock
        // screen. CallForegroundService owns both.
        CallForegroundService.attach(this)
        CallForegroundService.start(
            context = appContext,
            title = title,
            caller = body,
            incoming = isIncoming,
        )
        ongoingNotificationId = 3001
    }

    private fun cancelOngoingNotification() {
        ongoingNotificationId = null
        CallForegroundService.stop(appContext)
        CallForegroundService.detach(this)
    }

    private fun soundEnabled(): Boolean = true

    /** Best-effort call push so a backgrounded phone can still ring, mirroring iOS. */
    private suspend fun fireCallPush(callId: String, calleeId: String, callerName: String) {
        val token = runCatching { DisbandSupabase.auth.currentSessionOrNull()?.accessToken }
            .getOrNull() ?: return
        runCatching {
            ApiHttp.client.post("${AppConfig.SUPABASE_URL}/functions/v1/send-call-push") {
                header(HttpHeaders.Authorization, "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(
                    Json.encodeToString(
                        PushRequest(calleeId = calleeId, callId = callId, callerName = callerName),
                    ),
                )
            }
        }
    }

    private companion object {
        fun directCallId(a: String, b: String): String = listOf(a, b).sorted().joinToString(":")
    }
}

@Serializable
private data class PushRequest(
    @SerialName("calleeId") val calleeId: String,
    @SerialName("callId") val callId: String,
    @SerialName("callerName") val callerName: String,
)

private fun SessionDescription.Type.wire(): String = when (this) {
    SessionDescription.Type.OFFER -> "offer"
    SessionDescription.Type.ANSWER -> "answer"
    SessionDescription.Type.PRANSWER -> "pranswer"
    SessionDescription.Type.ROLLBACK -> "rollback"
    else -> "offer"
}