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
 * The web's fixed transceiver layout (`src/lib/webrtc.ts`). Every peer
 * connection in a voice channel carries exactly these three m-lines, in this
 * order, and each side identifies a track by its transceiver's index. Android
 * only sends audio, but still negotiates all three so the indexes line up.
 */
enum class MeshLane { Audio, Camera, Screen }

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
    var onAudioTrack: (AudioTrack) -> Unit = {}
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
            val track = transceiver.receiver.track() as? AudioTrack ?: return
            val receiverId = transceiver.receiver.id()
            post {
                // Only lane 0 is a microphone; the others are camera and screen.
                val lane: Int = runCatching { pc.transceivers.indexOfFirst { it.receiver.id() == receiverId } }.getOrDefault(-1)
                if (lane == MeshLane.Audio.ordinal) this@MeshPeer.onAudioTrack(track)
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

    /** Offer the three lanes, in the web's order. Mirrors `ensureLanes`. */
    suspend fun makeOffer(audio: AudioTrack): SessionDescription {
        if (pc.transceivers.isEmpty()) {
            val send = RtpTransceiver.RtpTransceiverDirection.SEND_RECV
            pc.addTransceiver(audio, RtpTransceiver.RtpTransceiverInit(send, listOf(streamId)))
            repeat(2) {
                pc.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
                    RtpTransceiver.RtpTransceiverInit(send, listOf(streamId)))
            }
        }
        val offer = create(offer = true)
        setLocal(offer)
        return offer
    }

    /** Answer an offer, including a renegotiation on an established connection. */
    suspend fun answer(offer: SessionDescription, audio: AudioTrack): SessionDescription {
        setRemote(offer)
        pc.transceivers.take(MeshLane.entries.size).forEachIndexed { index, transceiver ->
            if (transceiver.direction != RtpTransceiver.RtpTransceiverDirection.SEND_RECV) {
                transceiver.setDirection(RtpTransceiver.RtpTransceiverDirection.SEND_RECV)
            }
            transceiver.sender.setStreams(listOf(streamId))
            if (index == MeshLane.Audio.ordinal) transceiver.sender.setTrack(audio, false)
        }
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
