import AVFoundation
import Foundation
import Observation
import Realtime
import Supabase
import WebRTC

enum CallPhase: Equatable {
    case idle
    case outgoing
    case incoming
    case active
}

struct IncomingCall: Identifiable, Equatable {
    let fromId: String
    let callerName: String
    let callId: String
    var profile: Profile?

    var id: String { callId }
}

/// App-wide 1:1 DM call manager. Mirrors the desktop app's `useCallManager`:
/// an incoming-call listener on `call-user:<selfId>` plus WebRTC signaling on
/// `call:<callId>`, all over Supabase Realtime broadcasts (event "call").
@MainActor
@Observable
final class CallManager {
    // MARK: - Observable state

    var phase: CallPhase = .idle
    var incoming: IncomingCall?
    var activePeer: Profile?
    var cameraEnabled = false
    var micMuted = false
    var deafened = false
    var error: String?
    var callNotice: String?
    var connectedAt: Date?
    var remoteHasVideo = false

    private(set) var engine: WebRTCEngine?

    // MARK: - Private state

    private let app: AppState
    private var listenChannel: RealtimeChannelV2?
    private var signalChannel: RealtimeChannelV2?
    private var listenTask: Task<Void, Never>?
    private var noticeTask: Task<Void, Never>?
    private var activeCallId: String?
    private var activePeerId: String?
    private var listenSubscribed = false
    private var listeningUserId: String?

    /// Broadcast-callback tokens.
    ///
    /// These MUST be retained: `onBroadcast` cancels the subscription when its
    /// returned token deallocates. Dropping them left both channels correctly
    /// subscribed but with no callback attached, so every inbound signal — ring,
    /// accept, leave — was silently discarded while everything looked healthy.
    private var listenSubscription: RealtimeSubscription?
    private var signalSubscription: RealtimeSubscription?

    private var client: SupabaseClient { SupabaseManager.client }
    private var soundEnabled: Bool { app.profile?.soundEnabled ?? true }

    init(app: AppState) {
        self.app = app
    }

    // MARK: - Auth lifecycle

    /// Bind the incoming-call listener to `userId`.
    ///
    /// Driven from the view tree with `.task(id:)` rather than
    /// `withObservationTracking`. That observation fires exactly once and
    /// re-registered itself asynchronously, so any auth change landing between
    /// the callback and re-registration was dropped — and because the old code
    /// only subscribed when `listenChannel == nil`, missing the sign-in
    /// transition left incoming calls dead for the entire session with nothing
    /// on screen to suggest it.
    func start(userId: String?) async {
        guard listeningUserId != userId else { return }
        stopListening()
        listeningUserId = userId

        guard let userId else {
            if phase != .idle { await reset() }
            return
        }
        startListening(for: userId)
    }

    private func startListening(for uid: String) {
        let channel = client.channel("call-user:\(uid)")
        listenChannel = channel
        listenSubscription = channel.onBroadcast(event: "call") { [weak self] json in
            guard let payload = json["payload"],
                  let signal = try? payload.decode(as: CallSignal.self) else { return }
            Task { @MainActor [weak self] in
                await self?.handleSignal(signal)
            }
        }

        // Keep retrying. A single failed subscribe used to silently disable
        // incoming calls for the whole session — the app looked fine and calls
        // just never arrived. Backs off, but never gives up while signed in.
        listenTask = Task { [weak self] in
            var attempt = 0
            while !Task.isCancelled {
                do {
                    try await channel.subscribeWithError()
                    await MainActor.run { self?.listenSubscribed = true }
                    return
                } catch {
                    attempt += 1
                    await MainActor.run {
                        self?.listenSubscribed = false
                        if attempt >= 3 {
                            self?.error = "Could not connect call signaling"
                        }
                    }
                    let delay = min(UInt64(attempt) * 2_000_000_000, 10_000_000_000)
                    try? await Task.sleep(nanoseconds: delay)
                }
            }
        }
    }

    private func stopListening() {
        listenTask?.cancel()
        listenTask = nil
        listenSubscription = nil
        listenSubscribed = false
        if let listenChannel {
            Task { await listenChannel.unsubscribe() }
        }
        listenChannel = nil
    }

    // MARK: - Sending signals

    /// Ephemeral broadcast to a user's `call-user:<id>` topic (subscribe → send → unsubscribe).
    ///
    /// Acknowledgement is enabled so `broadcast` waits for the server to accept
    /// the message. Without it, the `unsubscribe` below raced the send and
    /// signals were silently dropped — an `accept` lost this way leaves the
    /// caller ringing forever, and a lost `cancel`/`leave` strands the peer in
    /// a dead call.
    private func send(to targetId: String, _ signal: CallSignal) async {
        // Never tear down the channel we receive our own calls on.
        if targetId == app.currentUserId {
            try? await listenChannel?.broadcast(event: "call", message: signal)
            return
        }

        let channel = client.channel("call-user:\(targetId)") { config in
            config.broadcast.acknowledgeBroadcasts = true
        }
        await channel.subscribe()
        try? await channel.broadcast(event: "call", message: signal)
        await channel.unsubscribe()
    }

    private func sendOnSignalChannel(_ signal: CallSignal) {
        guard let signalChannel else { return }
        Task { try? await signalChannel.broadcast(event: "call", message: signal) }
    }

    // MARK: - Call actions

    func startCall(peer: Profile) async {
        guard let uid = app.currentUserId, let profile = app.profile else { return }
        error = nil
        let callId = directCallId(uid, peer.id)
        activeCallId = callId
        activePeerId = peer.id
        activePeer = peer
        phase = .outgoing
        startRingtone()
        await send(to: peer.id,
                   CallSignal(type: "ring", from: uid, to: peer.id, callId: callId,
                              callerName: profile.name))
    }

    func acceptCall() async {
        guard let incoming, let uid = app.currentUserId else { return }
        stopRingtone()
        activeCallId = incoming.callId
        activePeerId = incoming.fromId
        if let profile = try? await DatabaseService.profile(id: incoming.fromId) {
            activePeer = profile
        }
        phase = .active
        self.incoming = nil
        connectedAt = Date()
        CallSounds.shared.playConnected()
        await send(to: incoming.fromId,
                   CallSignal(type: "accept", from: uid, to: incoming.fromId,
                              callId: incoming.callId))
        do {
            try await setupRtc(callId: incoming.callId, peerId: incoming.fromId, asCaller: false)
        } catch {
            self.error = error.localizedDescription
            await reset()
        }
    }

    func rejectCall() async {
        guard let incoming, let uid = app.currentUserId else { return }
        stopRingtone()
        await send(to: incoming.fromId,
                   CallSignal(type: "reject", from: uid, to: incoming.fromId,
                              callId: incoming.callId,
                              rejecterName: app.profile?.name ?? "User"))
        self.incoming = nil
        phase = .idle
    }

    func endCall() async {
        stopRingtone()
        if let peerId = activePeerId, let uid = app.currentUserId {
            if phase == .outgoing {
                await send(to: peerId,
                           CallSignal(type: "cancel", from: uid, to: peerId,
                                      callId: activeCallId))
            } else if phase == .active {
                await notifyPeerLeave(peerId, callId: activeCallId)
            }
        }
        await reset()
    }

    func toggleMic() {
        micMuted.toggle()
        engine?.setMicEnabled(!micMuted)
    }

    func toggleDeafen() {
        deafened.toggle()
        if deafened {
            micMuted = true
            engine?.setMicEnabled(false)
        }
        engine?.setRemoteAudioEnabled(!deafened)
    }

    func toggleCamera() {
        guard phase == .active else { return }
        cameraEnabled.toggle()
        guard let engine else { return }
        engine.setCameraEnabled(cameraEnabled) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.renegotiate()
            }
        }
    }

    // MARK: - Incoming signal handling

    private func handleSignal(_ p: CallSignal) async {
        guard let uid = app.currentUserId, p.from != uid else { return }
        switch p.type {
        case "ring" where p.callId != nil:
            if phase != .idle {
                Task {
                    await send(to: p.from,
                               CallSignal(type: "reject", from: uid, to: p.from,
                                          callId: p.callId,
                                          rejecterName: app.profile?.name ?? "User"))
                }
                return
            }
            if let profile = try? await DatabaseService.profile(id: p.from) {
                incoming = IncomingCall(fromId: p.from,
                                        callerName: p.callerName ?? "Someone",
                                        callId: p.callId!,
                                        profile: profile)
            } else {
                incoming = IncomingCall(fromId: p.from,
                                        callerName: p.callerName ?? "Someone",
                                        callId: p.callId!)
            }
            phase = .incoming
            startRingtone()

        case "accept" where p.callId != nil && phase == .outgoing:
            stopRingtone()
            phase = .active
            connectedAt = Date()
            CallSounds.shared.playConnected()
            do {
                try await setupRtc(callId: p.callId!, peerId: p.from, asCaller: true)
            } catch {
                self.error = error.localizedDescription
                await self.reset()
            }

        case "reject":
            if phase == .outgoing {
                let name = p.rejecterName ?? "They"
                callNotice = "\(name) declined your call"
                noticeTask?.cancel()
                noticeTask = Task { [weak self] in
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    self?.callNotice = nil
                }
            }
            CallSounds.shared.playEnd()
            await reset()

        // Both mean "the other side is gone". They cross in practice: if our
        // `accept` is lost the caller still thinks it is ringing and sends
        // `cancel` while we are already active, so keying each type to a single
        // phase left one side stuck in a call by itself.
        case "cancel", "leave":
            if phase == .active {
                guard activePeerId == p.from else { return }
                CallSounds.shared.playLeave()
                await reset()
            } else if phase != .idle {
                CallSounds.shared.playEnd()
                await reset()
            }

        default:
            break
        }
    }

    // MARK: - WebRTC setup / teardown

    private func setupRtc(callId: String, peerId: String, asCaller: Bool) async throws {
        guard let uid = app.currentUserId else { return }
        configureAudioSession()
        try? AVAudioSession.sharedInstance().setActive(true)

        let engine = WebRTCEngine(callId: callId, peerId: peerId, senderId: uid,
                                  onSignal: { [weak self] signal in
                                      self?.sendOnSignalChannel(signal)
                                  },
                                  onRemoteVideoTrack: { [weak self] track in
                                      self?.remoteHasVideo = track != nil
                                  },
                                  onRemoteAudioTrack: { [weak self] _ in
                                      self?.engine?.setRemoteAudioEnabled(!(self?.deafened ?? false))
                                  },
                                  onConnectionFailed: { [weak self] in
                                      Task { @MainActor [weak self] in
                                          await self?.reset()
                                      }
                                  })
        engine.setMicEnabled(!micMuted)
        engine.setRemoteAudioEnabled(!deafened)
        self.engine = engine

        // If the camera was left on from a previous call (or toggled while
        // ringing), surface it to the peer on the very first negotiation.
        if cameraEnabled {
            engine.setCameraEnabled(true) { _ in }
        }

        let channel = client.channel("call:\(callId)")
        signalChannel = channel
        signalSubscription = channel.onBroadcast(event: "call") { [weak self] json in
            guard let payload = json["payload"],
                  let p = try? payload.decode(as: CallSignal.self) else { return }
            Task { @MainActor [weak self] in
                self?.handleCallSignal(p)
            }
        }
        try await channel.subscribeWithError()

        if asCaller {
            let offer = try await engine.makeOffer()
            sendOnSignalChannel(CallSignal(type: "offer", from: uid, to: peerId,
                                           callId: callId,
                                           sdp: CallSdp(type: offer.type.wireType, sdp: offer.sdp)))
        }
    }

    private func handleCallSignal(_ p: CallSignal) {
        guard let uid = app.currentUserId, p.from != uid else { return }
        if let to = p.to, to != uid { return }
        guard let engine else { return }
        Task {
            do {
                if p.type == "offer", let sdp = p.sdp {
                    let remote = RTCSessionDescription(type: .offer, sdp: sdp.sdp)
                    try await engine.setRemote(sdp: remote)
                    let answer = try await engine.makeAnswer()
                    sendOnSignalChannel(CallSignal(type: "answer", from: uid, to: p.from,
                                                   callId: activeCallId,
                                                   sdp: CallSdp(type: answer.type.wireType, sdp: answer.sdp)))
                } else if p.type == "answer", let sdp = p.sdp {
                    let remote = RTCSessionDescription(type: .answer, sdp: sdp.sdp)
                    try await engine.setRemote(sdp: remote)
                } else if p.type == "ice", let candidate = p.candidate {
                    let ice = RTCIceCandidate(sdp: candidate.candidate,
                                              sdpMLineIndex: candidate.sdpMLineIndex,
                                              sdpMid: candidate.sdpMid)
                    try await engine.addIceCandidate(ice)
                } else if p.type == "leave" {
                    await reset()
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func notifyPeerLeave(_ peerId: String, callId: String?) async {
        guard let uid = app.currentUserId else { return }
        let signal = CallSignal(type: "leave", from: uid, to: peerId, callId: callId)
        sendOnSignalChannel(signal)
        await send(to: peerId, signal)
    }

    private func renegotiate() async {
        guard let engine, phase == .active,
              let peerId = activePeerId, let uid = app.currentUserId else { return }
        do {
            let offer = try await engine.makeOffer()
            sendOnSignalChannel(CallSignal(type: "offer", from: uid, to: peerId,
                                           callId: activeCallId,
                                           sdp: CallSdp(type: offer.type.wireType, sdp: offer.sdp)))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func reset() async {
        stopRingtone()
        engine?.onConnectionFailed = {}
        engine?.dispose()
        engine = nil
        remoteHasVideo = false
        signalSubscription = nil
        if let signalChannel {
            await signalChannel.unsubscribe()
        }
        signalChannel = nil
        phase = .idle
        incoming = nil
        activePeer = nil
        cameraEnabled = false
        connectedAt = nil
        error = nil
        activeCallId = nil
        activePeerId = nil
        noticeTask?.cancel()
        callNotice = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord,
                                 mode: .voiceChat,
                                 options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker])
    }

    // MARK: - Ringtone

    private func startRingtone() {
        guard soundEnabled else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
        CallSounds.shared.startRingtone()
    }

    private func stopRingtone() {
        CallSounds.shared.stopRingtone()
    }
}
