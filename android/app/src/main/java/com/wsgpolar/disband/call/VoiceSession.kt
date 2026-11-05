package com.wsgpolar.disband.call

import android.content.Context
import android.media.AudioManager
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.leave
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.RealtimeService
import com.wsgpolar.disband.data.TurnService
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.broadcast
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.channel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.webrtc.AudioTrack
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule

/** The voice channel this device is in. */
data class VoiceRoom(
    val channelId: String,
    val name: String,
    val serverId: String,
    val serverName: String,
)

/** Someone in a voice channel, as `voice_presence_live` reports them. */
data class VoiceMember(
    val userId: String,
    val profile: Profile? = null,
    val muted: Boolean = false,
    val deafened: Boolean = false,
    /** Stage channels: on stage (heard), invited up, or asking to speak. */
    val stageSpeaker: Boolean = false,
    val stageInvited: Boolean = false,
    val handRaisedAt: String? = null,
) {
    val name: String get() = profile?.name ?: "Someone"
    val handRaised: Boolean get() = handRaisedAt != null
}

/** A stage channel's own state (migration 0212). */
data class StageInfo(
    val topic: String? = null,
    val startedAt: String? = null,
    val requestsEnabled: Boolean = true,
    /** Owner, admins and anyone with Manage Channels run the stage. */
    val isModerator: Boolean = false,
) {
    val isLive: Boolean get() = startedAt != null
}

enum class VoicePhase { Idle, Connecting, Connected }

/**
 * One message on a voice channel's `voice:<id>` signalling topic (event
 * `signal`), wire-compatible with the web's `SignalPayload` and iOS
 * `MeshSignal`.
 */
@Serializable
data class MeshSignal(
    val type: String,
    val from: String,
    val to: String? = null,
    val sdp: CallSdp? = null,
    val candidate: CallIceCandidate? = null,
    /** Marks the native apps; the web ignores it. See [VoiceSession.handleOffer]. */
    val client: String? = null,
) {
    companion object {
        /** Shared with iOS so the two break an offer collision the same way. */
        const val NATIVE = "ios"
    }
}

@Serializable
private data class PresenceRow(
    @SerialName("channel_id") val channelId: String,
    @SerialName("user_id") val userId: String,
    val muted: Boolean? = null,
    val deafened: Boolean? = null,
    @SerialName("stage_speaker") val stageSpeaker: Boolean? = null,
    @SerialName("stage_invited") val stageInvited: Boolean? = null,
    @SerialName("stage_hand_raised_at") val handRaisedAt: String? = null,
)

@Serializable
private data class PresenceWrite(
    @SerialName("channel_id") val channelId: String,
    @SerialName("user_id") val userId: String,
    val muted: Boolean,
    val deafened: Boolean,
)

@Serializable
private data class StageRow(
    @SerialName("is_stage") val isStage: Boolean? = null,
    @SerialName("stage_topic") val topic: String? = null,
    @SerialName("stage_started_at") val startedAt: String? = null,
    @SerialName("stage_requests_enabled") val requestsEnabled: Boolean? = null,
)

/**
 * Server voice channels on Android: a full mesh of WebRTC connections (one
 * per other participant) signalled over Realtime, interoperating with the
 * web and iOS. The Android port of iOS `VoiceSession`, audio only.
 *
 * **Who offers.** Whoever joins offers to everyone already there; people
 * already in the room answer. The web also offers to newcomers, so offers
 * cross; this device keeps its own and the browser rolls back. Two native
 * apps break the tie by user id.
 *
 * **Stages.** Everyone joins the audience, muted. Only speakers' audio is
 * played, and only speakers can open their mic.
 */
class VoiceSession(
    private val appContext: Context,
    private val turnService: TurnService,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val client get() = DisbandSupabase.client

    private val _room = MutableStateFlow<VoiceRoom?>(null)
    val room: StateFlow<VoiceRoom?> = _room.asStateFlow()
    private val _phase = MutableStateFlow(VoicePhase.Idle)
    val phase: StateFlow<VoicePhase> = _phase.asStateFlow()
    private val _members = MutableStateFlow<List<VoiceMember>>(emptyList())
    val members: StateFlow<List<VoiceMember>> = _members.asStateFlow()
    private val _speaking = MutableStateFlow<Set<String>>(emptySet())
    val speaking: StateFlow<Set<String>> = _speaking.asStateFlow()
    private val _connectedPeers = MutableStateFlow<Set<String>>(emptySet())
    val connectedPeers: StateFlow<Set<String>> = _connectedPeers.asStateFlow()
    private val _micMuted = MutableStateFlow(false)
    val micMuted: StateFlow<Boolean> = _micMuted.asStateFlow()
    private val _deafened = MutableStateFlow(false)
    val deafened: StateFlow<Boolean> = _deafened.asStateFlow()
    private val _speakerOn = MutableStateFlow(true)
    val speakerOn: StateFlow<Boolean> = _speakerOn.asStateFlow()
    private val _stage = MutableStateFlow<StageInfo?>(null)
    /** Set while the room is a stage channel. */
    val stage: StateFlow<StageInfo?> = _stage.asStateFlow()
    private val _connectedAt = MutableStateFlow<Long?>(null)
    val connectedAt: StateFlow<Long?> = _connectedAt.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** Set by the app so voice never fights a 1:1 call for the microphone. */
    var isDirectCallActive: () -> Boolean = { false }

    val isActive: Boolean get() = _phase.value != VoicePhase.Idle
    fun isIn(channelId: String): Boolean = isActive && _room.value?.channelId == channelId

    private var userId: String? = null
    private fun me(): VoiceMember? = _members.value.firstOrNull { it.userId == userId }
    /** On a stage, only speakers may talk. Elsewhere everyone can. */
    val canSpeak: Boolean get() = _stage.value == null || me()?.stageSpeaker == true
    private val transmitting: Boolean get() = !_micMuted.value && canSpeak

    private var factory: PeerConnectionFactory? = null
    private var audioModule: JavaAudioDeviceModule? = null
    private var audioTrack: AudioTrack? = null
    private var iceServers: List<PeerConnection.IceServer> = emptyList()
    private val peers = mutableMapOf<String, MeshPeer>()
    private val remoteAudio = mutableMapOf<String, AudioTrack>()
    private val earlyCandidates = mutableMapOf<String, MutableList<IceCandidate>>()

    private var signalChannel: RealtimeChannel? = null
    private var presenceChannel: RealtimeChannel? = null
    private val loops = mutableListOf<Job>()
    private var savedAudioMode: Int? = null

    fun clearError() { _error.value = null }

    // MARK: - Joining and leaving

    fun join(room: VoiceRoom) {
        scope.launch { joinNow(room) }
    }

    private suspend fun joinNow(room: VoiceRoom) {
        val uid = DisbandSupabase.client.auth.currentUserOrNull()?.id ?: return
        if (isIn(room.channelId)) return
        if (isDirectCallActive()) {
            _error.value = "Finish your call before joining voice."
            return
        }
        if (isActive) leaveNow()

        userId = uid
        _error.value = null
        _room.value = room
        _phase.value = VoicePhase.Connecting
        _connectedPeers.value = emptySet()

        // A stage puts everyone in the audience, muted, until they're brought
        // up. Known before the mic exists so it never opens.
        _stage.value = fetchStage(room.channelId, uid)
        if (_stage.value != null) _micMuted.value = true

        startAudio()
        val factory = factory ?: return
        val mic = factory.createAudioTrack("mic-${uid.take(8)}", factory.createAudioSource(MediaConstraints()))
        mic.setEnabled(transmitting)
        audioTrack = mic
        iceServers = runCatching { turnService.iceServers() }.getOrElse { AppConfig.baseIceServers }

        try {
            // Subscribe before announcing presence: existing members offer as
            // soon as they see the new row, and an offer sent before we are
            // listening is lost.
            subscribeSignals(room)
            client.from("voice_presence").upsert(
                PresenceWrite(room.channelId, uid, _micMuted.value, _deafened.value),
            )
        } catch (e: Exception) {
            _error.value = "Couldn't join ${room.name}. Check your connection and try again."
            leaveNow()
            return
        }
        if (_room.value != room) return

        _phase.value = VoicePhase.Connected
        _connectedAt.value = System.currentTimeMillis()
        if (_stage.value == null) CallTones.playConnected()
        CallForegroundService.voiceHangup = { leave() }
        CallForegroundService.start(appContext, title = "Voice connected", caller = room.name, incoming = false)

        reloadMembers()
        for (member in _members.value) if (member.userId != uid) offer(member.userId)
        startLoops(room)
    }

    fun leave() {
        scope.launch { leaveNow() }
    }

    private suspend fun leaveNow() {
        val leavingRoom = _room.value ?: return
        val uid = userId
        val leavingSignal = signalChannel
        val leavingPresence = presenceChannel
        loops.forEach { it.cancel() }
        loops.clear()

        if (uid != null && leavingSignal != null) {
            broadcast(MeshSignal(type = "leave", from = uid, client = MeshSignal.NATIVE))
        }

        // The call ends here, on this phone, straight away; the network
        // clean-up afterwards can't hold it up.
        peers.values.forEach { it.close() }
        peers.clear()
        remoteAudio.clear()
        earlyCandidates.clear()
        signalChannel = null
        presenceChannel = null
        stopAudio()
        if (CallForegroundService.voiceHangup != null) {
            CallForegroundService.voiceHangup = null
            if (!isDirectCallActive()) CallForegroundService.stop(appContext)
        }

        _room.value = null
        _phase.value = VoicePhase.Idle
        _members.value = emptyList()
        _speaking.value = emptySet()
        _connectedPeers.value = emptySet()
        _connectedAt.value = null
        _stage.value = null

        // Then tell everyone. Waited on (briefly) so a quick rejoin of the
        // same room can't have its new row deleted by this one.
        if (uid != null) {
            withTimeoutOrNull(4_000) {
                runCatching {
                    client.from("voice_presence").delete {
                        filter {
                            eq("channel_id", leavingRoom.channelId)
                            eq("user_id", uid)
                        }
                    }
                }
            }
        }
        scope.launch {
            leavingSignal?.let { runCatching { it.leave() } }
            leavingPresence?.let { runCatching { it.leave() } }
        }
    }

    // MARK: - Controls

    fun toggleMute() {
        // The audience can't unmute; they raise a hand instead.
        if (_micMuted.value && !canSpeak) return
        _micMuted.value = !_micMuted.value
        // Unmuting while deafened would transmit into a call you can't hear.
        if (!_micMuted.value && _deafened.value) {
            _deafened.value = false
            applyRemoteAudio()
        }
        audioTrack?.setEnabled(transmitting)
        scope.launch { syncMuteState() }
    }

    fun toggleDeafen() {
        _deafened.value = !_deafened.value
        if (_deafened.value) {
            _micMuted.value = true
            audioTrack?.setEnabled(false)
        }
        applyRemoteAudio()
        scope.launch { syncMuteState() }
    }

    fun toggleSpeaker() {
        _speakerOn.value = !_speakerOn.value
        routeAudio()
    }

    // MARK: - Audio

    private fun startAudio() {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext)
                .setEnableInternalTracer(false)
                .createInitializationOptions(),
        )
        val module = JavaAudioDeviceModule.builder(appContext)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()
        audioModule = module
        factory = PeerConnectionFactory.builder().setAudioDeviceModule(module).createPeerConnectionFactory()
        val am = appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (am != null && savedAudioMode == null) {
            savedAudioMode = am.mode
            runCatching { am.mode = AudioManager.MODE_IN_COMMUNICATION }
        }
        routeAudio()
    }

    private fun routeAudio() {
        val am = appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        @Suppress("DEPRECATION")
        runCatching { am.isSpeakerphoneOn = _speakerOn.value }
    }

    private fun stopAudio() {
        runCatching { audioTrack?.dispose() }
        audioTrack = null
        runCatching { factory?.dispose() }
        factory = null
        runCatching { audioModule?.release() }
        audioModule = null
        val am = appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        savedAudioMode?.let { mode ->
            if (!isDirectCallActive()) {
                @Suppress("DEPRECATION")
                runCatching { am?.isSpeakerphoneOn = false }
                runCatching { am?.mode = mode }
            }
        }
        savedAudioMode = null
    }

    /** On a stage only speakers are played; the audience stays silent here. */
    private fun heard(remoteId: String): Boolean =
        _stage.value == null || _members.value.firstOrNull { it.userId == remoteId }?.stageSpeaker == true

    private fun applyRemoteAudio() {
        for ((remoteId, track) in remoteAudio) runCatching { track.setEnabled(!_deafened.value && heard(remoteId)) }
    }

    // MARK: - Signalling

    private suspend fun subscribeSignals(room: VoiceRoom) {
        val channel = client.channel("voice:${room.channelId}") { broadcast { acknowledgeBroadcasts = false } }
        // Decoded one by one, so a payload this app doesn't understand (the
        // web also sends soundboard and screen signals) can't end the stream.
        val signals = channel.broadcastFlow<JsonObject>("signal")
        loops += scope.launch {
            signals.collect { raw ->
                val signal = runCatching {
                    DisbandSupabase.sessionJson.decodeFromJsonElement(MeshSignal.serializer(), raw)
                }.getOrNull() ?: return@collect
                handle(signal)
            }
        }
        withTimeoutOrNull(8_000) { channel.subscribe(blockUntilSubscribed = true) }
            ?: throw IllegalStateException("Voice signalling didn't connect")
        signalChannel = channel
    }

    private fun broadcast(signal: MeshSignal) {
        val channel = signalChannel ?: return
        scope.launch {
            if (runCatching { channel.broadcast("signal", signal) }.isFailure) {
                delay(400)
                runCatching { channel.broadcast("signal", signal) }
            }
        }
    }

    private suspend fun handle(signal: MeshSignal) {
        val uid = userId ?: return
        if (!isActive || signal.from == uid) return
        if (signal.to != null && signal.to != uid) return
        if (signal.client == MeshSignal.NATIVE) peers[signal.from]?.remoteIsNative = true

        when (signal.type) {
            "offer" -> signal.sdp?.let { handleOffer(signal.from, it, signal.client == MeshSignal.NATIVE) }
            "answer" -> {
                val sdp = signal.sdp ?: return
                val peer = peers[signal.from] ?: return
                if (peer.signalingState != PeerConnection.SignalingState.HAVE_LOCAL_OFFER) return
                runCatching { peer.acceptAnswer(SessionDescription(SessionDescription.Type.ANSWER, sdp.sdp)) }
            }
            "ice" -> {
                val c = signal.candidate ?: return
                val candidate = IceCandidate(c.sdpMid, c.sdpMLineIndex, c.candidate)
                val peer = peers[signal.from]
                if (peer != null) peer.addCandidate(candidate)
                else earlyCandidates.getOrPut(signal.from) { mutableListOf() }.add(candidate)
            }
            "leave" -> {
                dropPeer(signal.from)
                _members.value = _members.value.filterNot { it.userId == signal.from }
            }
        }
    }

    /**
     * Against a browser this device always keeps its own offer (the browser
     * rolls back). Between two native apps, the larger user id yields.
     */
    private suspend fun handleOffer(remoteId: String, sdp: CallSdp, remoteIsNative: Boolean) {
        val audio = audioTrack ?: return
        val uid = userId ?: return
        val peer = peers[remoteId] ?: makePeer(remoteId) ?: return
        peer.remoteIsNative = peer.remoteIsNative || remoteIsNative
        if (peer.signalingState == PeerConnection.SignalingState.HAVE_LOCAL_OFFER) {
            val yields = peer.remoteIsNative && uid > remoteId
            if (!yields) return
            if (runCatching { peer.rollback() }.isFailure) return
        }
        try {
            val answer = peer.answer(SessionDescription(SessionDescription.Type.OFFER, sdp.sdp), audio)
            broadcast(MeshSignal(type = "answer", from = uid, to = remoteId,
                sdp = CallSdp("answer", answer.description), client = MeshSignal.NATIVE))
        } catch (_: Exception) {
            dropPeer(remoteId)
        }
    }

    private suspend fun offer(remoteId: String) {
        val audio = audioTrack ?: return
        val uid = userId ?: return
        if (peers.containsKey(remoteId)) return
        val peer = makePeer(remoteId) ?: return
        try {
            val offer = peer.makeOffer(audio)
            broadcast(MeshSignal(type = "offer", from = uid, to = remoteId,
                sdp = CallSdp("offer", offer.description), client = MeshSignal.NATIVE))
        } catch (_: Exception) {
            dropPeer(remoteId)
        }
    }

    private fun makePeer(remoteId: String): MeshPeer? {
        val factory = factory ?: return null
        val peer = runCatching {
            MeshPeer(remoteId, userId ?: "android", factory, iceServers) { block -> scope.launch { block() } }
        }.getOrNull() ?: return null
        peer.onIceCandidate = { candidate ->
            val uid = userId
            if (uid != null) {
                broadcast(MeshSignal(type = "ice", from = uid, to = remoteId,
                    candidate = CallIceCandidate(candidate.sdp, candidate.sdpMLineIndex, candidate.sdpMid),
                    client = MeshSignal.NATIVE))
            }
        }
        peer.onAudioTrack = { track ->
            if (peers[remoteId] === peer) {
                track.setEnabled(!_deafened.value && heard(remoteId))
                remoteAudio[remoteId] = track
            }
        }
        peer.onStateChange = { state ->
            if (peers[remoteId] === peer) {
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> _connectedPeers.value += remoteId
                    PeerConnection.PeerConnectionState.DISCONNECTED,
                    PeerConnection.PeerConnectionState.FAILED,
                    PeerConnection.PeerConnectionState.CLOSED -> _connectedPeers.value -= remoteId
                    else -> {}
                }
                // The reconcile loop re-offers to anyone still present.
                if (state == PeerConnection.PeerConnectionState.FAILED ||
                    state == PeerConnection.PeerConnectionState.CLOSED) dropPeer(remoteId)
            }
        }
        peers[remoteId] = peer
        earlyCandidates.remove(remoteId)?.forEach { peer.addCandidate(it) }
        return peer
    }

    private fun dropPeer(remoteId: String) {
        peers.remove(remoteId)?.close()
        remoteAudio.remove(remoteId)
        _connectedPeers.value -= remoteId
        _speaking.value -= remoteId
    }

    // MARK: - Presence

    private suspend fun syncMuteState() {
        val uid = userId ?: return
        val room = _room.value ?: return
        runCatching {
            client.from("voice_presence").update({
                set("muted", _micMuted.value)
                set("deafened", _deafened.value)
            }) {
                filter {
                    eq("channel_id", room.channelId)
                    eq("user_id", uid)
                }
            }
        }
        _members.value = _members.value.map {
            if (it.userId == uid) it.copy(muted = _micMuted.value, deafened = _deafened.value) else it
        }
    }

    private suspend fun reloadMembers() {
        val room = _room.value ?: return
        val loaded = runCatching { fetchMembers(room.channelId) }.getOrNull() ?: return
        if (_room.value != room) return

        if (wasRemoved(room, loaded)) {
            leaveNow()
            _error.value = "You were removed from the voice channel."
            return
        }

        val wasSpeaker = canSpeak
        _members.value = loaded

        val stage = _stage.value ?: return
        val uid = userId ?: return
        fetchStage(room.channelId, uid, stage.isModerator)?.let { if (_room.value == room) _stage.value = it }
        // Moved back to the audience: the mic closes, and stays shut when
        // they're next brought up until they unmute.
        if (wasSpeaker && !canSpeak) {
            _micMuted.value = true
            scope.launch { syncMuteState() }
        }
        audioTrack?.setEnabled(transmitting)
        applyRemoteAudio()
    }

    /**
     * Kicked, banned or disconnected from a stage: our row is gone though we
     * never left. Checked against the table itself, not the live view, so a
     * few missed heartbeats can't hang anyone up.
     */
    private suspend fun wasRemoved(room: VoiceRoom, loaded: List<VoiceMember>): Boolean {
        val uid = userId ?: return false
        val since = _connectedAt.value ?: return false
        if (_phase.value != VoicePhase.Connected || System.currentTimeMillis() - since < 5_000) return false
        if (loaded.any { it.userId == uid }) return false
        val rows = runCatching {
            client.from("voice_presence").select(io.github.jan.supabase.postgrest.query.Columns.list("user_id")) {
                filter {
                    eq("channel_id", room.channelId)
                    eq("user_id", uid)
                }
            }.decodeList<JsonObject>()
        }.getOrNull() ?: return false
        return rows.isEmpty() && _room.value == room
    }

    // MARK: - Loops

    private fun startLoops(room: VoiceRoom) {
        // Presence: react to joins and leaves at once, with a slow poll as a
        // safety net for a dropped realtime connection.
        loops += scope.launch {
            val live = runCatching {
                RealtimeService.observeChanges("voice_presence", "channel_id=eq.${room.channelId}")
            }.getOrNull() ?: return@launch
            presenceChannel = live.channel
            live.flow.collect { reloadMembers() }
        }
        loops += scope.launch {
            while (isActive) {
                delay(10_000)
                reloadMembers()
            }
        }
        // Heartbeat, so `voice_presence_live` keeps showing us.
        loops += scope.launch {
            while (isActive) {
                runCatching {
                    DisbandSupabase.postgrest.rpc("touch_voice_presence",
                        buildJsonObject { put("p_channel", room.channelId) })
                }
                delay(30_000)
            }
        }
        // Speaking indicators.
        loops += scope.launch {
            while (isActive) {
                delay(400)
                sampleLevels()
            }
        }
        // Heal: offer to anyone present with no connection. The grace period
        // lets a newcomer's own offer arrive first, as it normally will.
        loops += scope.launch {
            while (isActive) {
                delay(4_000)
                reconcile()
            }
        }
    }

    private suspend fun reconcile() {
        val uid = userId ?: return
        if (_phase.value != VoicePhase.Connected) return
        val now = System.currentTimeMillis()
        for (member in _members.value) {
            if (member.userId == uid) continue
            val peer = peers[member.userId]
            if (peer != null) {
                val stuck = peer.connectionState != PeerConnection.PeerConnectionState.CONNECTED &&
                    now - peer.createdAt > 20_000
                if (stuck) dropPeer(member.userId) else continue
            }
            offer(member.userId)
        }
        val present = _members.value.map { it.userId }.toSet()
        for (remoteId in peers.keys.toList()) {
            val peer = peers[remoteId] ?: continue
            if (remoteId !in present && now - peer.createdAt > 8_000) dropPeer(remoteId)
        }
    }

    private suspend fun sampleLevels() {
        val uid = userId ?: return
        val next = mutableSetOf<String>()
        var mine = 0.0
        for ((remoteId, peer) in peers.toMap()) {
            if (peer.inboundAudioLevel() > 0.04 && heard(remoteId)) next += remoteId
            if (transmitting) mine = maxOf(mine, peer.outboundAudioLevel())
        }
        if (mine > 0.04) next += uid
        if (next != _speaking.value) _speaking.value = next
    }

    // MARK: - Stage

    private suspend fun stageCall(fn: String, args: JsonObject) {
        if (_stage.value == null) return
        try {
            DisbandSupabase.postgrest.rpc(fn, args)
        } catch (e: Exception) {
            _error.value = (e as? RestException)?.error ?: "Something went wrong. Try again."
            return
        }
        reloadMembers()
    }

    private fun stage(fn: String, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) {
        val channelId = _room.value?.channelId ?: return
        scope.launch {
            stageCall(fn, buildJsonObject {
                put("p_channel_id", channelId)
                build()
            })
        }
    }

    fun startStage(topic: String) = stage("stage_start") { put("p_topic", topic) }
    fun endStage() = stage("stage_end") {}
    fun setHandRaised(raised: Boolean) = stage("stage_raise_hand") { put("p_raised", raised) }
    /** Inviting yourself (as a moderator) puts you straight on stage. */
    fun inviteToSpeak(memberId: String) = stage("stage_invite") { put("p_user_id", memberId) }
    fun respondToInvite(accept: Boolean) = stage("stage_respond_invite") { put("p_accept", accept) }
    /** Yourself, or (moderators) anyone. Also dismisses a raised hand. */
    fun moveToAudience(memberId: String) = stage("stage_move_to_audience") { put("p_user_id", memberId) }
    fun disconnectFromStage(memberId: String) = stage("stage_disconnect") { put("p_user_id", memberId) }
    fun setStageRequests(enabled: Boolean) = stage("stage_set_requests") { put("p_enabled", enabled) }

    companion object {
        private const val PRESENCE_COLUMNS =
            "channel_id,user_id,muted,deafened,stage_speaker,stage_invited,stage_hand_raised_at"

        /** Who is in a voice channel, for the lobby and the channel list too. */
        suspend fun fetchMembers(channelId: String): List<VoiceMember> =
            occupants(listOf(channelId))[channelId].orEmpty()

        /** Occupants of several voice channels in one round trip. */
        suspend fun occupants(channelIds: List<String>): Map<String, List<VoiceMember>> {
            if (channelIds.isEmpty()) return emptyMap()
            val rows = DisbandSupabase.client.from("voice_presence_live")
                .select(io.github.jan.supabase.postgrest.query.Columns.raw(PRESENCE_COLUMNS)) {
                    filter { isIn("channel_id", channelIds) }
                }.decodeList<PresenceRow>()
            val profiles = runCatching { Database.profiles(rows.map { it.userId }.distinct()) }.getOrDefault(emptyMap())
            return rows.groupBy { it.channelId }.mapValues { (_, list) ->
                list.map {
                    VoiceMember(
                        userId = it.userId, profile = profiles[it.userId],
                        muted = it.muted ?: false, deafened = it.deafened ?: false,
                        stageSpeaker = it.stageSpeaker ?: false, stageInvited = it.stageInvited ?: false,
                        handRaisedAt = it.handRaisedAt,
                    )
                }
            }
        }

        /** The stage's state, or null when the channel isn't a stage. */
        suspend fun fetchStage(channelId: String, userId: String, moderator: Boolean? = null): StageInfo? {
            val row = runCatching {
                DisbandSupabase.client.from("channels").select {
                    filter { eq("id", channelId) }
                    limit(1)
                }.decodeList<StageRow>().firstOrNull()
            }.getOrNull() ?: return null
            if (row.isStage != true) return null
            val isModerator = moderator ?: runCatching {
                DisbandSupabase.postgrest.rpc("is_stage_moderator", buildJsonObject {
                    put("p_channel_id", channelId)
                    put("p_user_id", userId)
                }).decodeAs<Boolean>()
            }.getOrDefault(false)
            return StageInfo(row.topic, row.startedAt, row.requestsEnabled ?: true, isModerator)
        }
    }
}
