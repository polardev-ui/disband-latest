package com.wsgpolar.disband.call

import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * The web's fixed transceiver layout (`src/lib/webrtc.ts`): mic, camera,
 * screen and the screen share's own sound, in that order. A lane is the
 * transceiver whose mid sits at that position in the session description
 * (the web's `transceiverForLane`), not its index: a peer that rolled back
 * its own offer holds extra, never-negotiated transceivers ahead of the real
 * ones. iOS only knows the first three; the fourth negotiates as unused there.
 */
enum class MeshLane { Audio, Camera, Screen, ScreenAudio }

/**
 * One `PeerConnection` to one other participant in a voice channel; the
 * Android port of iOS `MeshPeer`. WebRTC calls the observer on its own
 * threads, so every callback is handed to [post], which the owning
 * [VoiceSession] points at its main-thread scope.
 */
class MeshPeer(
    val remoteId: String,
    /** The web only plays a remote track that arrives with a stream. */
    private val streamId: String,
    factory: PeerConnectionFactory,
    iceServers: List<PeerConnection.IceServer>,
    private val post: (() -> Unit) -> Unit,
) {
    /** Whether the other side is a native app (learned from its signals). */
    var remoteIsNative = false
    val createdAt = System.currentTimeMillis()

    var onIceCandidate: (IceCandidate) -> Unit = {}
    /** A remote track arrived on a lane. Fires once per lane per negotiation. */
    var onTrack: (MeshLane, MediaStreamTrack) -> Unit = { _, _ -> }
    var onStateChange: (PeerConnection.PeerConnectionState) -> Unit = {}

    private val pendingCandidates = mutableListOf<IceCandidate>()
    private var hasRemoteDescription = false

    private val observer = object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) {
            post { this@MeshPeer.onIceCandidate(candidate) }
        }
        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
            post { this@MeshPeer.onStateChange(state) }
        }
        override fun onTrack(transceiver: RtpTransceiver) {
            val track = transceiver.receiver.track() ?: return
            val receiverId = transceiver.receiver.id()
            post {
                val lane = runCatching { laneOf(receiverId) }.getOrNull() ?: return@post
                // A screen lane must carry video, the mic and screen sound audio.
                val wantsVideo = lane == MeshLane.Camera || lane == MeshLane.Screen
                if ((track.kind() == MediaStreamTrack.VIDEO_TRACK_KIND) != wantsVideo) return@post
                this@MeshPeer.onTrack(lane, track)
            }
        }
        override fun onSignalingChange(state: PeerConnection.SignalingState) {}
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
        override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {}
        override fun onAddStream(stream: MediaStream) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onDataChannel(channel: DataChannel) {}
        override fun onRenegotiationNeeded() {}
    }

    val pc: PeerConnection = run {
        val config = PeerConnection.RTCConfiguration(iceServers)
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        factory.createPeerConnection(config, observer) ?: error("Failed to create PeerConnection")
    }

    val signalingState: PeerConnection.SignalingState get() = pc.signalingState()
    val connectionState: PeerConnection.PeerConnectionState get() = pc.connectionState()

    fun close() {
        runCatching { pc.dispose() }
    }

    // MARK: - Lanes

    /** The `a=mid:` values in m-line order, from whichever description exists. */
    private fun negotiatedMids(): List<String> {
        val sdp = pc.localDescription?.description ?: pc.remoteDescription?.description ?: return emptyList()
        return MID_LINE.findAll(sdp).map { it.groupValues[1] }.toList()
    }

    /** The transceiver carrying [lane], or null before it exists. */
    private fun transceiverFor(lane: MeshLane): RtpTransceiver? {
        val transceivers = pc.transceivers
        val mids = negotiatedMids()
        if (mids.size > lane.ordinal) {
            transceivers.firstOrNull { it.mid == mids[lane.ordinal] }?.let { return it }
        }
        return transceivers.getOrNull(lane.ordinal)
    }

    private fun laneOf(receiverId: String): MeshLane? {
        val transceivers = pc.transceivers
        val transceiver = transceivers.firstOrNull { it.receiver.id() == receiverId } ?: return null
        val mid = transceiver.mid
        if (mid != null) {
            val index = negotiatedMids().indexOf(mid)
            if (index >= 0) return MeshLane.entries.getOrNull(index)
        }
        return MeshLane.entries.getOrNull(transceivers.indexOf(transceiver))
    }

    /**
     * Put [track] on a lane without renegotiating (the web's `setLaneTrack`).
     * Works mid-call because every lane is negotiated send-and-receive.
     */
    fun setTrack(track: MediaStreamTrack?, lane: MeshLane) {
        runCatching { transceiverFor(lane)?.sender?.setTrack(track, false) }
    }

    /** Make every lane able to send, labelled with our stream id. */
    private fun openLanes() {
        for (lane in MeshLane.entries) {
            val transceiver = transceiverFor(lane) ?: continue
            if (transceiver.direction != RtpTransceiver.RtpTransceiverDirection.SEND_RECV) {
                runCatching { transceiver.setDirection(RtpTransceiver.RtpTransceiverDirection.SEND_RECV) }
            }
            runCatching { transceiver.sender.setStreams(listOf(streamId)) }
        }
    }

    /** Create the four lanes, in the web's order, if they don't exist yet. Mirrors `ensureLanes`. */
    fun prepareLanes(audio: AudioTrack) {
        if (pc.transceivers.isEmpty()) {
            val send = RtpTransceiver.RtpTransceiverDirection.SEND_RECV
            pc.addTransceiver(audio, RtpTransceiver.RtpTransceiverInit(send, listOf(streamId)))
            repeat(2) {
                pc.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
                    RtpTransceiver.RtpTransceiverInit(send, listOf(streamId)))
            }
            pc.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
                RtpTransceiver.RtpTransceiverInit(send, listOf(streamId)))
        }
    }

    /** Offer the four lanes. */
    suspend fun makeOffer(audio: AudioTrack, camera: MediaStreamTrack? = null): SessionDescription {
        prepareLanes(audio)
        setTrack(camera, MeshLane.Camera)
        val offer = create(offer = true)
        setLocal(offer)
        return offer
    }

    /** Answer an offer, including a renegotiation on an established connection. */
    suspend fun answer(offer: SessionDescription, audio: AudioTrack, camera: MediaStreamTrack? = null): SessionDescription {
        setRemote(offer)
        openLanes()
        setTrack(audio, MeshLane.Audio)
        setTrack(camera, MeshLane.Camera)
        val answer = create(offer = false)
        setLocal(answer)
        return answer
    }

    suspend fun acceptAnswer(answer: SessionDescription) = setRemote(answer)

    /** Abandon our own outstanding offer so the other side's can be applied. */
    suspend fun rollback() = setLocal(SessionDescription(SessionDescription.Type.ROLLBACK, ""))

    fun addCandidate(candidate: IceCandidate) {
        // Candidates routinely beat the description they belong to.
        if (!hasRemoteDescription) pendingCandidates.add(candidate)
        else runCatching { pc.addIceCandidate(candidate) }
    }

    /** Loudest inbound audio level (0..1), for speaking indicators. */
    suspend fun inboundAudioLevel(): Double = level("inbound-rtp")

    /** Our own microphone level as this connection sees it. */
    suspend fun outboundAudioLevel(): Double = level("media-source")

    private suspend fun level(type: String): Double = suspendCancellableCoroutine { cont ->
        pc.getStats { report ->
            var level = 0.0
            for (stat in report.statsMap.values) {
                if (stat.type != type || stat.members["kind"] != "audio") continue
                val value = (stat.members["audioLevel"] as? Number)?.toDouble() ?: continue
                level = maxOf(level, value)
            }
            if (cont.isActive) cont.resume(level)
        }
    }

    // MARK: - Plumbing

    private suspend fun create(offer: Boolean): SessionDescription = suspendCancellableCoroutine { cont ->
        val observer = sdpObserver(cont)
        if (offer) pc.createOffer(observer, MediaConstraints()) else pc.createAnswer(observer, MediaConstraints())
    }

    private suspend fun setLocal(description: SessionDescription) {
        suspendCancellableCoroutine<Unit> { cont -> pc.setLocalDescription(sdpObserver(cont), description) }
    }

    private suspend fun setRemote(description: SessionDescription) {
        suspendCancellableCoroutine<Unit> { cont -> pc.setRemoteDescription(sdpObserver(cont), description) }
        hasRemoteDescription = true
        val queued = pendingCandidates.toList()
        pendingCandidates.clear()
        // One stale candidate must not discard the rest.
        queued.forEach { runCatching { pc.addIceCandidate(it) } }
    }

    private companion object {
        val MID_LINE = Regex("""^a=mid:(\S+)\s*$""", RegexOption.MULTILINE)
    }

    private fun <T> sdpObserver(cont: kotlinx.coroutines.CancellableContinuation<T>): SdpObserver =
        object : SdpObserver {
            @Suppress("UNCHECKED_CAST")
            override fun onCreateSuccess(description: SessionDescription) {
                if (cont.isActive) cont.resume(description as T)
            }

            @Suppress("UNCHECKED_CAST")
            override fun onSetSuccess() {
                if (cont.isActive) cont.resume(Unit as T)
            }

            override fun onCreateFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(RuntimeException(error))
            }

            override fun onSetFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(RuntimeException(error))
            }
        }
}
