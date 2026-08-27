import AVFoundation
import Foundation
import WebRTC

extension RTCSdpType {
    /// Wire format used by the desktop app's `RTCSessionDescriptionInit.type`.
    var wireType: String {
        switch self {
        case .offer: return "offer"
        case .answer: return "answer"
        case .prAnswer: return "pranswer"
        case .rollback: return "rollback"
        @unknown default: return "offer"
        }
    }
}

/// Wraps a single `RTCPeerConnection` for a 1:1 voice/video call, mirroring the
/// desktop app's WebRTC flow: voice-first, camera togglable mid-call, and ICE
/// candidates re-sent over the Supabase Realtime signaling channel.
///
/// All public methods must be called from the main actor (the owning
/// `CallManager` is `@MainActor`). Peer-connection delegate callbacks arrive on
/// background threads and are forwarded to the main actor via the closures.
final class WebRTCEngine: NSObject, RTCPeerConnectionDelegate {
    let callId: String
    let peerId: String
    private let senderId: String

    /// Raised when ICE candidates are generated (already main-actor).
    var onSignal: (CallSignal) -> Void
    /// Raised when the remote video track appears/disappears (main-actor).
    var onRemoteVideoTrack: (RTCVideoTrack?) -> Void
    /// Raised when the remote audio track appears (main-actor).
    var onRemoteAudioTrack: (RTCAudioTrack?) -> Void
    /// Raised when the peer connection fails or disconnects (main-actor).
    var onConnectionFailed: () -> Void

    private let factory: RTCPeerConnectionFactory
    private let pc: RTCPeerConnection

    private(set) var audioTrack: RTCAudioTrack
    private(set) var remoteAudioTrack: RTCAudioTrack?
    private(set) var remoteVideoTrack: RTCVideoTrack?

    private var videoSource: RTCVideoSource?
    private var videoTrack: RTCVideoTrack?
    private var capturer: RTCCameraVideoCapturer?
    private var videoSender: RTCRtpSender?

    /// The camera's AVCaptureSession, for the local preview view.
    var captureSession: AVCaptureSession? { capturer?.captureSession }

    init(callId: String,
         peerId: String,
         senderId: String,
         onSignal: @escaping (CallSignal) -> Void,
         onRemoteVideoTrack: @escaping (RTCVideoTrack?) -> Void,
         onRemoteAudioTrack: @escaping (RTCAudioTrack?) -> Void,
         onConnectionFailed: @escaping () -> Void) {
        self.callId = callId
        self.peerId = peerId
        self.senderId = senderId
        self.onSignal = onSignal
        self.onRemoteVideoTrack = onRemoteVideoTrack
        self.onRemoteAudioTrack = onRemoteAudioTrack
        self.onConnectionFailed = onConnectionFailed

        RTCPeerConnectionFactory.initialize()
        let factory = RTCPeerConnectionFactory()
        self.factory = factory

        let config = RTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        config.iceServers = AppConfig.iceServers
        config.continualGatheringPolicy = .gatherContinually
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )

        guard let pc = factory.peerConnection(with: config, constraints: constraints, delegate: nil) else {
            fatalError("Failed to create RTCPeerConnection")
        }
        self.pc = pc

        audioTrack = factory.audioTrack(withTrackId: "audio0")
        pc.add(audioTrack, streamIds: ["stream0"])

        super.init()
        pc.delegate = self
    }

    deinit {
        capturer?.stopCapture()
        pc.close()
    }

    /// Stops the camera and tears down the peer connection. Safe to call once.
    func dispose() {
        capturer?.stopCapture()
        capturer = nil
        videoSender = nil
        videoSource = nil
        videoTrack = nil
        pc.delegate = nil
        pc.close()
    }

    // MARK: - Local controls

    func setMicEnabled(_ enabled: Bool) {
        audioTrack.isEnabled = enabled
    }

    func setRemoteAudioEnabled(_ enabled: Bool) {
        remoteAudioTrack?.isEnabled = enabled
    }

    /// Enable or disable the local camera mid-call. Starts/stops the AVCapture
    /// session and renegotiates so the peer picks up the change.
    func setCameraEnabled(_ enabled: Bool, completion: @escaping (Bool) -> Void) {
        if enabled {
            guard videoTrack == nil else {
                videoTrack?.isEnabled = true
                completion(true)
                return
            }
            let source = factory.videoSource()
            let track = factory.videoTrack(with: source, trackId: "video0")
            videoSource = source
            videoTrack = track
            let capturer = RTCCameraVideoCapturer(delegate: source)
            self.capturer = capturer
            videoSender = pc.add(track, streamIds: ["stream0"])
            startCapture { [weak self] ok in
                DispatchQueue.main.async {
                    self?.videoTrack?.isEnabled = ok
                    completion(ok)
                }
            }
        } else {
            capturer?.stopCapture()
            capturer = nil
            videoTrack?.isEnabled = false
            if let videoSender {
                pc.removeTrack(videoSender)
            }
            videoSender = nil
            videoSource = nil
            videoTrack = nil
            completion(true)
        }
    }

    private func startCapture(completion: @escaping (Bool) -> Void) {
        guard let capturer,
              let device = RTCCameraVideoCapturer.captureDevices().first else {
            completion(false)
            return
        }
        let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
        let target = CGSize(width: 640, height: 480)
        var selected = formats.first
        var currentDiff = Int.max
        for format in formats {
            let dim = format.formatDescription.dimensions
            guard dim.width > 0 else { continue }
            let diff = abs(Int(dim.width) - Int(target.width)) + abs(Int(dim.height) - Int(target.height))
            if diff < currentDiff {
                currentDiff = diff
                selected = format
            }
        }
        guard let format = selected else {
            completion(false)
            return
        }
        let maxFps = Int(format.videoSupportedFrameRateRanges.first?.maxFrameRate ?? 30)
        let fps = min(max(maxFps, 15), 30)
        capturer.startCapture(with: device, format: format, fps: fps) { error in
            completion(error == nil)
        }
    }

    // MARK: - Signaling (offer / answer / ice)

    func setRemote(sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sdp) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            }
        }
    }

    func makeOffer() async throws -> RTCSessionDescription {
        await waitUntilStable()
        let offer = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<RTCSessionDescription, Error>) in
            pc.offer(for: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)) { description, error in
                if let description {
                    cont.resume(returning: description)
                } else {
                    cont.resume(throwing: error ?? Self.engineError("offer failed"))
                }
            }
        }
        try await setLocal(offer)
        return offer
    }

    func makeAnswer() async throws -> RTCSessionDescription {
        let answer = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<RTCSessionDescription, Error>) in
            pc.answer(for: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)) { description, error in
                if let description {
                    cont.resume(returning: description)
                } else {
                    cont.resume(throwing: error ?? Self.engineError("answer failed"))
                }
            }
        }
        try await setLocal(answer)
        return answer
    }

    func addIceCandidate(_ candidate: RTCIceCandidate) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.add(candidate) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            }
        }
    }

    private func setLocal(_ sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setLocalDescription(sdp) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            }
        }
    }

    private func waitUntilStable() async {
        let deadline = Date().addingTimeInterval(5)
        while pc.signalingState != .stable && Date() < deadline {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    // MARK: - RTCPeerConnectionDelegate

    func peerConnection(_ peerConnection: RTCPeerConnection,
                        didGenerate candidate: RTCIceCandidate) {
        let payload = CallIceCandidate(candidate: candidate.sdp,
                                       sdpMLineIndex: candidate.sdpMLineIndex,
                                       sdpMid: candidate.sdpMid)
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            onSignal(CallSignal(type: "ice", from: senderId, to: peerId,
                                callId: callId, sdp: nil, candidate: payload))
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection,
                        didChange newState: RTCPeerConnectionState) {
        if newState == .disconnected || newState == .failed || newState == .closed {
            DispatchQueue.main.async { [weak self] in
                self?.onConnectionFailed()
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection,
                        didAdd stream: RTCMediaStream) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let audio = stream.audioTracks.first, remoteAudioTrack !== audio {
                remoteAudioTrack = audio
                onRemoteAudioTrack(audio)
            }
            if let video = stream.videoTracks.first, remoteVideoTrack !== video {
                remoteVideoTrack = video
                onRemoteVideoTrack(video)
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection,
                        didAdd rtpReceiver: RTCRtpReceiver,
                        streams: [RTCMediaStream]) {
        handle(rtpReceiver.track)
    }

    func peerConnection(_ peerConnection: RTCPeerConnection,
                        didStartReceivingOn transceiver: RTCRtpTransceiver) {
        handle(transceiver.receiver.track)
    }

    private func handle(_ track: RTCMediaStreamTrack?) {
        guard let track else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let audio = track as? RTCAudioTrack, remoteAudioTrack !== audio {
                remoteAudioTrack = audio
                onRemoteAudioTrack(audio)
            } else if let video = track as? RTCVideoTrack, remoteVideoTrack !== video {
                remoteVideoTrack = video
                onRemoteVideoTrack(video)
            }
        }
    }

    // Unused delegate callbacks.

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCIceConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    private static func engineError(_ message: String) -> NSError {
        NSError(domain: "WebRTCEngine", code: -1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
