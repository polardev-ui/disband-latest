package com.wsgpolar.disband.call

import android.content.Context
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.AudioTrack
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Android port of the iOS `WebRTCEngine` — a single audio-only `PeerConnection`
 * with bundled ICE buffering, the exact same signal grammar as iOS/web
 * (offer/answer/ice over the `call:<callId>` bus), and the same track ids.
 */
class WebRTCEngine(
    private val appContext: Context,
    private val iceServers: List<PeerConnection.IceServer>,
    private val onSignal: (CallSignal) -> Unit,
    private val onRemoteAudioTrack: (AudioTrack?) -> Unit,
    private val onConnectionFailed: () -> Unit,
) {
    private val factory: PeerConnectionFactory
    private val pc: PeerConnection
    private val audioModule: JavaAudioDeviceModule
    private val localAudio: AudioTrack

    private var remoteAudio: AudioTrack? = null

    /** The other person's camera, and whether frames are arriving (it goes quiet, not away). */
    var remoteVideo: org.webrtc.VideoTrack? = null
        private set
    private val remoteWatcher = FrameWatcher()
    val remoteVideoLive: Boolean get() = remoteVideo != null && remoteWatcher.isLive

    /** Our own camera while it is on. */
    var localVideo: org.webrtc.VideoTrack? = null
        private set
    private var videoSender: org.webrtc.RtpSender? = null
    private var capturer: org.webrtc.CameraVideoCapturer? = null
    private var videoSource: org.webrtc.VideoSource? = null
    private var textureHelper: org.webrtc.SurfaceTextureHelper? = null

    // Candidates that arrive before the remote description exist cannot be
    // added — buffer them and flush once setRemoteDescription succeeds.
    private val pendingCandidates = mutableListOf<IceCandidate>()
    private var hasRemoteDescription = false

    private val observer = object : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState) {}

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            if (state == PeerConnection.IceConnectionState.CONNECTED ||
                state == PeerConnection.IceConnectionState.COMPLETED
            ) {
                remoteAudio?.setEnabled(true)
            }
        }

        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
            // DISCONNECTED is transient (ICE restart can recover) — only FAILED/CLOSED
            // should tear down the call. Otherwise a brief network blip kills it.
            if (state == PeerConnection.PeerConnectionState.FAILED ||
                state == PeerConnection.PeerConnectionState.CLOSED
            ) {
                onConnectionFailed()
            }
        }

        override fun onIceConnectionReceivingChange(receiving: Boolean) {}

        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}

        override fun onIceCandidate(candidate: IceCandidate) {
            onSignal(
                CallSignal(
                    type = "ice",
                    from = "",
                    to = null,
                    callId = null,
                    sdp = null,
                    candidate = CallIceCandidate(
                        candidate = candidate.sdp ?: "",
                        sdpMLineIndex = candidate.sdpMLineIndex,
                        sdpMid = candidate.sdpMid,
                    ),
                ),
            )
        }

        override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {}

        override fun onAddStream(stream: MediaStream) {}

        override fun onRemoveStream(stream: MediaStream) {}

        override fun onDataChannel(channel: DataChannel) {}

        override fun onRenegotiationNeeded() {}

        override fun onTrack(transceiver: RtpTransceiver) {
            val track = transceiver.receiver.track()
            if (track is AudioTrack) {
                // The first audio lane is the voice; a later one is screen sound.
                if (remoteAudio == null) {
                    remoteAudio = track
                    onRemoteAudioTrack(track)
                }
            } else if (track is org.webrtc.VideoTrack && remoteVideo == null) {
                // The first video lane is the camera (web lane 1, iOS's only video track).
                remoteVideo = track
                runCatching { track.addSink(remoteWatcher) }
            }
        }
    }

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext)
                .setEnableInternalTracer(false)
                .createInitializationOptions(),
        )
        audioModule = JavaAudioDeviceModule.builder(appContext)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()

        val egl = VideoEgl.base.eglBaseContext
        factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(audioModule)
            .setVideoEncoderFactory(org.webrtc.DefaultVideoEncoderFactory(egl, true, true))
            .setVideoDecoderFactory(org.webrtc.DefaultVideoDecoderFactory(egl))
            .createPeerConnectionFactory()

        val config = PeerConnection.RTCConfiguration(iceServers)
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY

        pc = factory.createPeerConnection(config, observer) ?: error("Failed to create PeerConnection")

        localAudio = factory.createAudioTrack("audio0", factory.createAudioSource(MediaConstraints()))
        pc.addTrack(localAudio, listOf("stream0"))
    }

    suspend fun makeOffer(): SessionDescription = createSdp(offer = true)

    suspend fun makeAnswer(): SessionDescription = createSdp(offer = false)

    private suspend fun createSdp(offer: Boolean): SessionDescription {
        val description = suspendCancellableCoroutine { cont ->
            val observer = sdpObserver(cont)
            if (offer) pc.createOffer(observer, MediaConstraints())
            else pc.createAnswer(observer, MediaConstraints())
        }
        setLocalDescription(description)
        return description
    }

    suspend fun setRemote(sdp: CallSdp) {
        val type = when (sdp.type) {
            "offer" -> SessionDescription.Type.OFFER
            "pranswer" -> SessionDescription.Type.PRANSWER
            "rollback" -> SessionDescription.Type.ROLLBACK
            else -> SessionDescription.Type.ANSWER
        }
        suspendCancellableCoroutine<Unit> { cont ->
            pc.setRemoteDescription(setObserver(cont), SessionDescription(type, sdp.sdp))
        }
        hasRemoteDescription = true
        flushPendingCandidates()
    }

    suspend fun addIceCandidate(candidate: CallIceCandidate) {
        val ice = IceCandidate(candidate.sdpMid, candidate.sdpMLineIndex, candidate.candidate)
        if (!hasRemoteDescription) {
            pendingCandidates.add(ice)
            return
        }
        add(ice)
    }

    /**
     * Camera on or off mid-call, as iOS: add or remove a video track; the
     * caller renegotiates with a fresh offer. Returns false if it couldn't start.
     */
    fun setCameraEnabled(enabled: Boolean): Boolean {
        if (!enabled) {
            runCatching { capturer?.stopCapture() }
            runCatching { capturer?.dispose() }
            capturer = null
            videoSender?.let { runCatching { pc.removeTrack(it) } }
            videoSender = null
            runCatching { localVideo?.dispose() }
            localVideo = null
            runCatching { videoSource?.dispose() }
            videoSource = null
            runCatching { textureHelper?.dispose() }
            textureHelper = null
            return true
        }
        if (localVideo != null) return true
        return try {
            val enumerator = org.webrtc.Camera2Enumerator(appContext)
            val name = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) } ?: enumerator.deviceNames.firstOrNull()
                ?: return false
            val cam = enumerator.createCapturer(name, null) ?: return false
            val helper = org.webrtc.SurfaceTextureHelper.create("call-camera", VideoEgl.base.eglBaseContext)
            val source = factory.createVideoSource(false)
            cam.initialize(helper, appContext, source.capturerObserver)
            cam.startCapture(640, 480, 24)
            val track = factory.createVideoTrack("video0", source)
            capturer = cam
            textureHelper = helper
            videoSource = source
            localVideo = track
            videoSender = pc.addTrack(track, listOf("stream0"))
            true
        } catch (_: Exception) {
            setCameraEnabled(false)
            false
        }
    }

    fun switchCamera() {
        runCatching { capturer?.switchCamera(null) }
    }

    fun setMicEnabled(enabled: Boolean) {
        localAudio.setEnabled(enabled)
    }

    fun setRemoteAudioEnabled(enabled: Boolean) {
        remoteAudio?.setEnabled(enabled)
    }

    private var previousAudioMode: Int? = null

    fun setSpeaker(on: Boolean) {
        // Route with AudioManager only. JavaAudioDeviceModule.setSpeakerMute
        // silences playout entirely, so calling it with !on made the default
        // earpiece mode play nothing until you tapped Speaker.
        try {
            val am = appContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            // Earpiece/speaker routing only applies in communication mode.
            if (previousAudioMode == null) {
                // A voice channel may already have switched to communication
                // mode. Saving that as "previous" left the phone stuck in it
                // after the call ended.
                previousAudioMode = am.mode.takeIf { it != android.media.AudioManager.MODE_IN_COMMUNICATION }
                    ?: android.media.AudioManager.MODE_NORMAL
                am.mode = android.media.AudioManager.MODE_IN_COMMUNICATION
            }
            am.isSpeakerphoneOn = on
        } catch (_: Exception) { }
    }

    fun dispose() {
        setCameraEnabled(false)
        remoteVideo?.let { runCatching { it.removeSink(remoteWatcher) } }
        remoteVideo = null
        previousAudioMode?.let { mode ->
            runCatching {
                val am = appContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
                am.isSpeakerphoneOn = false
                am.mode = mode
            }
            previousAudioMode = null
        }
        runCatching {
            pc.close()
            localAudio.dispose()
            remoteAudio?.let { runCatching { it.dispose() } }
        }
    }

    private suspend fun setLocalDescription(description: SessionDescription) {
        suspendCancellableCoroutine<Unit> { cont ->
            pc.setLocalDescription(setObserver(cont), description)
        }
    }

    private suspend fun add(ice: IceCandidate) {
        runCatching { pc.addIceCandidate(ice) }
    }

    private fun flushPendingCandidates() {
        val queued = pendingCandidates.toList()
        pendingCandidates.clear()
        queued.forEach { runCatching { pc.addIceCandidate(it) } }
    }

    private fun sdpObserver(cont: CancellableContinuation<SessionDescription>): SdpObserver =
        object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {
                if (cont.isActive) cont.resume(description)
            }

            override fun onCreateFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(RuntimeException(error))
            }

            override fun onSetSuccess() {}

            override fun onSetFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(RuntimeException(error))
            }
        }

    /**
     * For setLocal/setRemoteDescription. These used to share the create
     * observer, whose onSetSuccess did nothing, so the coroutine never
     * resumed: the caller never sent its offer and the callee never answered.
     */
    private fun setObserver(cont: CancellableContinuation<Unit>): SdpObserver =
        object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {}
            override fun onCreateFailure(error: String) {}
            override fun onSetSuccess() {
                if (cont.isActive) cont.resume(Unit)
            }
            override fun onSetFailure(error: String) {
                if (cont.isActive) cont.resumeWithException(RuntimeException(error))
            }
        }
}

private typealias CancellableContinuation<T> = kotlinx.coroutines.CancellableContinuation<T>
private typealias MediaStream = org.webrtc.MediaStream
private typealias DataChannel = org.webrtc.DataChannel