import Foundation
import WebRTC

/// The web's fixed transceiver layout (`src/lib/webrtc.ts`). Every peer
/// connection in a voice channel or group call carries exactly these three
/// m-lines, in this order, and each side identifies a track by its
/// transceiver's *index* — so an iPhone that offered them in any other order,
/// or offered fewer, would have its microphone shown as someone's screen.
enum MeshLane: Int, CaseIterable {
    case audio = 0
    case camera = 1
    case screen = 2
}

/// One `RTCPeerConnection` to one other participant.
///
/// Called only from the main actor (the owning `VoiceSession` is
/// `@MainActor`). WebRTC delivers delegate callbacks on its own threads, so
/// every closure below is re-dispatched to main before it runs.
final class MeshPeer: NSObject, RTCPeerConnectionDelegate {
    let remoteId: String
    let pc: RTCPeerConnection
    /// The stream id this device labels its tracks with. The web only keeps a
    /// remote track when `ontrack` hands it a stream (`ev.streams[0]`), so an
    /// unlabeled microphone is received and then silently never played.
    private let streamId: String

    /// Whether the other side is the iOS app (learned from its signals).
    var remoteIsNative = false
    /// When this peer was created, for the reconnect grace period.
    let createdAt = Date()

    var onIceCandidate: (RTCIceCandidate) -> Void = { _ in }
    var onTrack: (MeshLane, RTCMediaStreamTrack) -> Void = { _, _ in }
    var onStateChange: (RTCPeerConnectionState) -> Void = { _ in }

    private var pendingCandidates: [RTCIceCandidate] = []
    private(set) var hasRemoteDescription = false

    init(remoteId: String, streamId: String, factory: RTCPeerConnectionFactory, iceServers: [RTCIceServer]) {
        self.remoteId = remoteId
        self.streamId = streamId

        let config = RTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        config.iceServers = iceServers
        config.continualGatheringPolicy = .gatherContinually
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )
        guard let pc = factory.peerConnection(with: config, constraints: constraints, delegate: nil) else {
            fatalError("Failed to create RTCPeerConnection")
        }
        self.pc = pc
        super.init()
        pc.delegate = self
    }

    func close() {
        pc.delegate = nil
        pc.close()
    }

    var signalingState: RTCSignalingState { pc.signalingState }
    var connectionState: RTCPeerConnectionState { pc.connectionState }

    // MARK: - Lanes

    private func lane(of receiverId: String) -> MeshLane? {
        guard let index = pc.transceivers.firstIndex(where: { $0.receiver.receiverId == receiverId }) else {
            return nil
        }
        return MeshLane(rawValue: index)
    }

    /// Put `track` on a lane without renegotiating — the web's `setLaneTrack`.
    /// Works mid-call because every lane is negotiated `sendrecv` up front.
    func setTrack(_ track: RTCMediaStreamTrack?, on lane: MeshLane) {
        guard pc.transceivers.indices.contains(lane.rawValue) else { return }
        pc.transceivers[lane.rawValue].sender.track = track
    }

    /// Make every lane able to send, and label it with our stream id.
    private func openLanes() {
        for transceiver in pc.transceivers.prefix(MeshLane.allCases.count) {
            var error: NSError?
            if transceiver.direction != .sendRecv {
                transceiver.setDirection(.sendRecv, error: &error)
            }
            transceiver.sender.streamIds = [streamId]
        }
    }

    // MARK: - Negotiation

    /// Offer the three lanes, in the web's order. Mirrors `ensureLanes`.
    func makeOffer(audio: RTCAudioTrack, camera: RTCVideoTrack?) async throws -> RTCSessionDescription {
        if pc.transceivers.isEmpty {
            let audioInit = RTCRtpTransceiverInit()
            audioInit.direction = .sendRecv
            audioInit.streamIds = [streamId]
            pc.addTransceiver(with: audio, init: audioInit)

            for _ in [MeshLane.camera, .screen] {
                let videoInit = RTCRtpTransceiverInit()
                videoInit.direction = .sendRecv
                videoInit.streamIds = [streamId]
                pc.addTransceiver(of: .video, init: videoInit)
            }
        }
        setTrack(camera, on: .camera)

        let offer = try await describe { self.pc.offer(for: Self.noConstraints, completionHandler: $0) }
        try await setLocal(offer)
        return offer
    }

    /// Answer an offer. Also handles renegotiation offers on an established
    /// connection, which the web sends when a group-call peer toggles media.
    func answer(_ offer: RTCSessionDescription, audio: RTCAudioTrack, camera: RTCVideoTrack?) async throws -> RTCSessionDescription {
        try await setRemote(offer)
        openLanes()
        setTrack(audio, on: .audio)
        setTrack(camera, on: .camera)

        let answer = try await describe { self.pc.answer(for: Self.noConstraints, completionHandler: $0) }
        try await setLocal(answer)
        return answer
    }

    func acceptAnswer(_ answer: RTCSessionDescription) async throws {
        try await setRemote(answer)
    }

    /// Abandon our own outstanding offer so the other side's can be applied.
    func rollback() async throws {
        try await setLocal(RTCSessionDescription(type: .rollback, sdp: ""))
    }

    func addCandidate(_ candidate: RTCIceCandidate) async {
        guard hasRemoteDescription else {
            // The signaling channel routinely delivers candidates ahead of the
            // description they belong to; dropping them loses the best routes.
            pendingCandidates.append(candidate)
            return
        }
        try? await add(candidate)
    }

    // MARK: - Stats

    /// Current inbound audio level (0...1), for speaking indicators.
    func inboundAudioLevel() async -> Double {
        await withCheckedContinuation { cont in
            pc.statistics { report in
                var level = 0.0
                for stat in report.statistics.values where stat.type == "inbound-rtp" {
                    if (stat.values["kind"] as? String) == "audio",
                       let value = stat.values["audioLevel"] as? NSNumber {
                        level = max(level, value.doubleValue)
                    }
                }
                cont.resume(returning: level)
            }
        }
    }

    /// Our own microphone level as this connection sees it.
    func outboundAudioLevel() async -> Double {
        await withCheckedContinuation { cont in
            pc.statistics { report in
                var level = 0.0
                for stat in report.statistics.values where stat.type == "media-source" {
                    if (stat.values["kind"] as? String) == "audio",
                       let value = stat.values["audioLevel"] as? NSNumber {
                        level = max(level, value.doubleValue)
                    }
                }
                cont.resume(returning: level)
            }
        }
    }

    // MARK: - Plumbing

    private static let noConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)

    private func describe(
        _ body: @escaping (@escaping (RTCSessionDescription?, Error?) -> Void) -> Void
    ) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { cont in
            body { description, error in
                if let description {
                    cont.resume(returning: description)
                } else {
                    cont.resume(throwing: error ?? Self.error("session description failed"))
                }
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

    private func setRemote(_ sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sdp) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            }
        }
        hasRemoteDescription = true
        let queued = pendingCandidates
        pendingCandidates = []
        for candidate in queued {
            // One stale candidate must not discard the rest.
            try? await add(candidate)
        }
    }

    private func add(_ candidate: RTCIceCandidate) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.add(candidate) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume() }
            }
        }
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: "MeshPeer", code: -1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    // MARK: - RTCPeerConnectionDelegate

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        DispatchQueue.main.async { [weak self] in self?.onIceCandidate(candidate) }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        DispatchQueue.main.async { [weak self] in self?.onStateChange(newState) }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection,
                        didAdd rtpReceiver: RTCRtpReceiver,
                        streams mediaStreams: [RTCMediaStream]) {
        report(rtpReceiver)
    }

    func peerConnection(_ peerConnection: RTCPeerConnection,
                        didStartReceivingOn transceiver: RTCRtpTransceiver) {
        report(transceiver.receiver)
    }

    private func report(_ receiver: RTCRtpReceiver) {
        let receiverId = receiver.receiverId
        guard let track = receiver.track else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, let lane = self.lane(of: receiverId) else { return }
            self.onTrack(lane, track)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
