import AVFoundation
import Foundation
import Observation
import Realtime
import Supabase
import UIKit
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
    var speakerOn = false
    var error: String?
    var callNotice: String?
    /// Set only when the peer connection reaches `.connected`. `connectedAt`
    /// is deliberately not set on answer: otherwise the call screen started a
    /// timer while ICE was still negotiating and the other person could not
    /// hear you yet.
    private(set) var rtcConnected = false
    var connectedAt: Date?

    /// True while the call is collapsed to a banner so the rest of Disband
    /// stays navigable — the desktop app never traps you on the call screen.
    var minimized = false
    var remoteHasVideo = false

    /// True once the ring has been sent to the server, switching the outgoing
    /// header from "Connecting…" to "Calling…".
    var callSignaled = false

    /// The connection dropped mid-call and is being recovered (an ICE
    /// restart), rather than the call being hung up on the spot.
    var reconnecting = false

    private(set) var engine: WebRTCEngine?

    // MARK: - Private state

    private let app: AppState
    private var listenChannel: RealtimeChannelV2?
    private var signalChannel: RealtimeChannelV2?
    private var listenTask: Task<Void, Never>?
    private var noticeTask: Task<Void, Never>?
    private var ringWatchdog: Task<Void, Never>?
    private var activeCallId: String?
    private var activePeerId: String?

    /// Bumped whenever a call is torn down, so work started for an earlier
    /// call (a connection still being prepared) knows to stop.
    private var callGeneration = 0
    /// This side sent the offer (it placed the call).
    private var isCaller = false
    /// The caller's outgoing offer and ICE, held while the call is still
    /// ringing: the connection is prepared during the ring, and everything it
    /// produced goes out the moment the other side answers. Nil means send
    /// straight away.
    private var heldSignals: [CallSignal]?
    /// The connection being prepared while ringing.
    private var prepareTask: Task<Void, Never>?
    /// Re-sends the offer until an answer lands (broadcasts aren't stored, so
    /// one sent before the other side had joined is simply lost).
    private var offerRetryTask: Task<Void, Never>?
    /// Recovering a dropped connection.
    private var recoveryTask: Task<Void, Never>?
    /// Signals that arrived before the peer connection existed.
    private var earlySignals: [CallSignal] = []
    /// The last offer applied (without its candidates) and the answer given
    /// to it, so a repeated offer gets the same answer instead of a second
    /// negotiation.
    private var lastRemoteOffer: String?
    private var lastAnswer: CallSdp?
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

    /// A VoIP push that reopened the app before the session was restored.
    private var pendingPush: VoipPushPayload?
    /// A call answered from the system UI before a session was available.
    private var pendingAnswer: IncomingCall?

    nonisolated(unsafe) private var didEnterBackgroundObserver: NSObjectProtocol?
    nonisolated(unsafe) private var willEnterForegroundObserver: NSObjectProtocol?

    init(app: AppState) {
        self.app = app
        // Pause ringing while backgrounded and recover it on return, so a call
        // that outlives the suspension isn't killed the instant the user comes back.
        didEnterBackgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handleAppDidBackground()
            }
        }
        willEnterForegroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.handleAppReturnedToForeground()
            }
        }
        // CallKit calls the shots when the app is off-screen: answering
        // here hands the pending call to the normal accept flow, ending hands
        // it to the normal decline flow.
        let callKit = CallKitProvider.shared
        callKit.onAnswer = { [weak self] call in
            Task { @MainActor [weak self] in
                guard let self else { return }
                // CallKit can be answered during a cold start woken by the
                // push, before the Supabase session has come back from the
                // keychain. `acceptCall` needs a user id and quietly gives up
                // without one, which left the system call UI up and connected
                // to nothing. Hold the answer and replay it the moment a
                // session exists.
                if self.app.currentUserId == nil {
                    PushDiag.log("callkit.answer.held", "callId=\(call.callId)")
                    self.pendingAnswer = call
                    return
                }
                await self.acceptCall(call)
            }
        }
        callKit.onEnd = { [weak self] call in
            Task { @MainActor [weak self] in
                await self?.rejectCall(call)
            }
        }
        callKit.onEndActive = { [weak self] callId in
            Task { @MainActor [weak self] in
                // Ignore our own programmatic end: by the time the delegate
                // runs, reset() has already cleared activeCallId.
                guard let self, self.phase == .active, self.activeCallId == callId else { return }
                await self.endCall()
            }
        }
        VoipPushService.shared.onReceiveIncomingPush = { [weak self] payload in
            Task { @MainActor [weak self] in
                await self?.handleVoipPush(payload)
            }
        }
    }

    deinit {
        if let didEnterBackgroundObserver {
            NotificationCenter.default.removeObserver(didEnterBackgroundObserver)
        }
        if let willEnterForegroundObserver {
            NotificationCenter.default.removeObserver(willEnterForegroundObserver)
        }
    }

    // MARK: - App lifecycle

    /// The ring watchdog's `Task.sleep` keeps ticking while the app is
    /// suspended, so a call the phone sat on for a few minutes would have been
    /// torn down the instant the user returns. Pause it in the background; the
    /// CallKit ring is a system process and keeps ringing on its own, and the
    /// in-app tone is suspended with the rest of the app anyway.
    private func handleAppDidBackground() {
        cancelRingWatchdog()
        stopRingtone()
    }

    /// Recover when the user returns: drain a cold-start push, re-arm the ring
    /// watchdog, and restart the in-app tone so a call that outlived the
    /// background period looks and sounds alive again.
    private func handleAppReturnedToForeground() async {
        if let pendingAnswer {
            self.pendingAnswer = nil
            self.pendingPush = nil
            PushDiag.log("callkit.answer.replay", "callId=\(pendingAnswer.callId)")
            await acceptCall(pendingAnswer)
        } else if let pendingPush {
            await handleVoipPush(pendingPush)
        }
        switch phase {
        case .incoming:
            armRingWatchdog()
            startRingtone()
        case .outgoing:
            armRingWatchdog()
            startCallingTone()
        case .active, .idle:
            break
        }
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
        // A VoIP push can bring the app back from a cold start before the
        // session is restored; now that it is, ring the waiting call.
        if let pendingAnswer {
            self.pendingAnswer = nil
            self.pendingPush = nil
            PushDiag.log("callkit.answer.replay", "callId=\(pendingAnswer.callId)")
            await acceptCall(pendingAnswer)
        } else if let pendingPush {
            await handleVoipPush(pendingPush)
        }
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
        if heldSignals != nil {
            heldSignals?.append(signal)
            return
        }
        guard let signalChannel else { return }
        Task { try? await signalChannel.broadcast(event: "call", message: signal) }
    }

    /// Sends what was prepared during the ring, offer first, in order.
    private func releaseHeldSignals() {
        guard let held = heldSignals else { return }
        heldSignals = nil
        guard let signalChannel else { return }
        let ordered = held.filter { $0.type == "offer" } + held.filter { $0.type != "offer" }
        Task {
            for signal in ordered {
                try? await signalChannel.broadcast(event: "call", message: signal)
            }
        }
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
        callSignaled = false
        // Registered with the system now, not on connect: swiping up during
        // the ring would otherwise suspend the app before the call is up.
        CallKitProvider.shared.startActiveCall(id: callId, title: peer.name)
        armRingWatchdog()
        startCallingTone()
        // Build the connection while it rings: relay lookup, signalling
        // channel, offer and candidate gathering all happen now, and the
        // answer only has to release them. This used to start after the
        // answer, which is most of the wait between "accepted" and hearing
        // each other.
        heldSignals = []
        prepareTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.setupRtc(callId: callId, peerId: peer.id, asCaller: true, prewarm: true)
            } catch {
                // The answer path builds it again from scratch if this failed.
                if self.activeCallId == callId, self.phase == .outgoing { await self.teardownRtc() }
            }
        }
        await send(to: peer.id,
                   CallSignal(type: "ring", from: uid, to: peer.id, callId: callId,
                              callerName: profile.name))
        callSignaled = true
        // Belt-and-braces: the realtime ring rings whatever is foregrounded at
        // the callee, but a killed/backgrounded phone needs a VoIP push to
        // ring at all. Fired best-effort; the call itself never depends on it.
        fireCallPush(callId: callId, calleeId: peer.id, callerName: profile.name)
    }

    /// Best-effort VoIP push so the callee's phones ring even if the app is
    /// backgrounded or killed. Uses the signed-in access token, so the edge
    /// function can refuse pushes sent by anyone other than the caller.
    private func fireCallPush(callId: String, calleeId: String, callerName: String) {
        guard let session = client.auth.currentSession else { return }
        var request = URLRequest(url: AppConfig.supabaseURL
            .appendingPathComponent("functions/v1/send-call-push"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "calleeId": calleeId,
            "callId": callId,
            "callerName": callerName,
        ])
        Task {
            _ = try? await URLSession.shared.data(for: request)
        }
    }

    /// `given` is set when answering via CallKit (the system UI carries the
    /// call in, possibly while the app was backgrounded), nil for the in-app
    /// overlay.
    func acceptCall(_ given: IncomingCall? = nil) async {
        guard let incoming = given ?? self.incoming, let uid = app.currentUserId else { return }
        stopRingtone()
        activeCallId = incoming.callId
        activePeerId = incoming.fromId
        activePeer = incoming.profile
        phase = .active
        cancelRingWatchdog()
        CallKitProvider.shared.markCallConnected(for: incoming)
        CallKitProvider.shared.startActiveCall(
            id: incoming.callId, title: activePeer?.name ?? incoming.callerName)
        self.incoming = nil
        rtcConnected = false
        connectedAt = nil
        // Fill in a profile the ring did not carry, but never hold up the
        // accept or the local peer connection on this second query.
        Task { [weak self] in
            guard let self,
                  let profile = try? await DatabaseService.profile(id: incoming.fromId),
                  self.activeCallId == incoming.callId else { return }
            self.activePeer = profile
        }

        // Send the accept and start media at the same time. Waiting for the
        // accept broadcast — a fresh Realtime subscribe each time — left the
        // caller retrying offers against a callee that had not opened its
        // microphone yet.
        async let accepted: Void = send(
            to: incoming.fromId,
            CallSignal(type: "accept", from: uid, to: incoming.fromId,
                       callId: incoming.callId))
        // Stop this account's other devices ringing.
        async let handled: Void = send(
            to: uid,
            CallSignal(type: "handled", from: uid, to: uid,
                       callId: incoming.callId))
        do {
            try await setupRtc(callId: incoming.callId, peerId: incoming.fromId, asCaller: false)
        } catch {
            self.error = error.localizedDescription
            await reset()
        }
        _ = await (accepted, handled)
    }

    func rejectCall(_ given: IncomingCall? = nil) async {
        guard let incoming = given ?? self.incoming, let uid = app.currentUserId else { return }
        stopRingtone()
        await send(to: incoming.fromId,
                   CallSignal(type: "reject", from: uid, to: incoming.fromId,
                              callId: incoming.callId,
                              rejecterName: app.profile?.name ?? "User"))
        // Declining on one device dismisses the ring on the rest of them.
        await send(to: uid,
                   CallSignal(type: "handled", from: uid, to: uid,
                              callId: incoming.callId))
        CallKitProvider.shared.dismissIncomingCall(for: incoming)
        self.incoming = nil
        phase = .idle
        cancelRingWatchdog()
    }

    func endCall() async {
        stopRingtone()
        if let id = activeCallId { CallKitProvider.shared.endActiveCall(id: id) }
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

    func toggleSpeaker() {
        speakerOn.toggle()
        CallAudioSession.setSpeaker(speakerOn)
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

    func switchCamera() {
        engine?.switchCamera()
    }

    // MARK: - Incoming signal handling

    // MARK: - Phase watchdog

    /// How long a call may sit ringing before it gives up.
    private static let ringTimeout: Duration = .seconds(60)

    /// Resets the call if it never leaves `.outgoing` or `.incoming`.
    ///
    /// Nothing else ever cleared these states on its own. If the far end went
    /// away mid-handshake — the app was killed, the network dropped, the
    /// accept was lost — the phase stayed non-idle for the rest of the
    /// session, and because an incoming ring is auto-rejected whenever the
    /// phase is not idle, *every subsequent call silently failed to ring*
    /// with nothing on screen to explain why.
    private func armRingWatchdog() {
        ringWatchdog?.cancel()
        ringWatchdog = Task { [weak self] in
            try? await Task.sleep(for: Self.ringTimeout)
            guard !Task.isCancelled, let self else { return }
            guard self.phase == .outgoing || self.phase == .incoming else { return }
            let unanswered = self.phase == .outgoing
            await self.reset()
            // After the reset, which clears notices.
            if unanswered { self.showNotice("No answer") }
        }
    }

    private func cancelRingWatchdog() {
        ringWatchdog?.cancel()
        ringWatchdog = nil
    }

    /// Start the incoming-call ring, shared by the realtime signal and the
    /// VoIP push. Presents CallKit's lock-screen ring whenever the app is
    /// off-screen: the realtime ring can beat the push, but only CallKit
    /// reaches the lock screen, so whichever arrives first must hand the call
    /// over or a backgrounded phone never rings at all.
    private func ringIncoming(call: IncomingCall) {
        incoming = call
        phase = .incoming
        armRingWatchdog()
        startRingtone()
        // Relay credentials ready before the answer, so answering doesn't wait on them.
        Task { await TurnService.shared.prewarm() }
        if UIApplication.shared.applicationState != .active {
            PushDiag.log("callkit.present", "callId=\(call.callId) state=\(UIApplication.shared.applicationState.rawValue)")
            CallKitProvider.shared.presentIncomingCall(call)
        }
    }

    private func handleSignal(_ p: CallSignal) async {
        guard let uid = app.currentUserId else { return }

        // "handled" is the one signal a user sends to themselves. A ring is
        // broadcast to `call-user:<id>`, so every session that account is
        // signed into rings at once, and the accept goes only to the caller —
        // leaving the other sessions ringing after the call was already picked
        // up elsewhere. Checked before the self-filter below precisely because
        // it comes from this same account.
        if p.type == "handled" {
            if phase == .incoming, incoming?.callId == p.callId {
                stopRingtone()
                await reset()
            }
            return
        }

        guard p.from != uid else { return }
        switch p.type {
        case "ring" where p.callId != nil:
            /*
             The same call arrives more than once by design — the realtime
             ring and the VoIP push both carry it, and the caller keeps
             ringing until it hears back. Any of those repeats that is about
             a call this device is ALREADY dealing with is a duplicate, not a
             second caller.

             Only the `.incoming` case was recognised. Once the call had been
             answered the phase is `.active`, so a repeat ring for that very
             call fell through to the busy branch below and sent the caller a
             `reject` — telling them you declined the call you were sitting
             in. It showed up as "declined" on the desktop moments after
             picking up on the phone, and it was worst on a cold start, where
             answering through CallKit takes long enough for a repeat to
             arrive in between.
             */
            if p.callId == incoming?.callId || p.callId == activeCallId {
                return
            }
            if phase != .idle {
                Task {
                    await send(to: p.from,
                               CallSignal(type: "reject", from: uid, to: p.from,
                                          callId: p.callId,
                                          rejecterName: app.profile?.name ?? "User"))
                }
                return
            }
            // Ring first, enrich later: the profile query used to delay the
            // ringtone and the CallKit overlay by a full round trip.
            ringIncoming(call: IncomingCall(fromId: p.from,
                                            callerName: p.callerName ?? "Someone",
                                            callId: p.callId!))
            if let profile = try? await DatabaseService.profile(id: p.from),
               incoming?.callId == p.callId {
                incoming?.profile = profile
            }

        case "accept" where p.callId != nil && phase == .outgoing:
            stopRingtone()
            phase = .active
            cancelRingWatchdog()
            rtcConnected = false
            connectedAt = nil
            CallAudioSession.activate()
            // Usually finished long before the answer; if not, it is closer
            // to done than a fresh start would be.
            await prepareTask?.value
            prepareTask = nil
            guard phase == .active, activeCallId == p.callId else { return }
            if engine != nil, signalChannel != nil {
                releaseHeldSignals()
                startOfferRetry()
            } else {
                heldSignals = nil
                do {
                    try await setupRtc(callId: p.callId!, peerId: p.from, asCaller: true)
                } catch {
                    self.error = error.localizedDescription
                    await self.reset()
                }
            }

        case "reject":
            let declined = phase == .outgoing
            CallSounds.shared.playEnd()
            await reset()
            // After the reset, which clears notices.
            if declined { showNotice("\(p.rejecterName ?? "They") declined your call") }

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

    /// Ring from a VoIP push — the path that fires when the callee's app was
    /// backgrounded or killed, where the realtime `ring` could never arrive.
    ///
    /// Foreground: the in-app overlay is the ring, so this mirrors the normal
    /// `ring` path (plus haptics). Backgrounded/off-screen: the phone has no
    /// overlay to swipe, so the call is handed to CallKit for the lock-screen
    /// ring and swipe-to-answer.
    func handleVoipPush(_ payload: VoipPushPayload) async {
        PushDiag.log("push.handle", "callId=\(payload.callId)")
        guard app.currentUserId != nil else {
            // Cold-start push before the session was restored: hold it until
            // start(userId:) runs with a session in hand.
            PushDiag.log("push.held.unsigned", "callId=\(payload.callId)")
            pendingPush = payload
            return
        }
        // A held cold-start push is now being handled (or dropped), so the
        // foreground recovery path must not re-ring it forever.
        pendingPush = nil
        if phase == .incoming, incoming?.callId == payload.callId {
            // The realtime ring beat the push and only put up an in-app ring.
            // With the app off-screen that ring is invisible — iOS suspends a
            // backgrounded app and its audio shortly after. Hand the already-
            // ringing call to CallKit now that the push has confirmed it, so
            // the lock screen shows a real ring regardless of arrival order.
            if UIApplication.shared.applicationState != .active,
               !CallKitProvider.shared.isPresented(callId: payload.callId),
               let ringing = incoming {
                PushDiag.log("push.upgrade.callkit", "callId=\(payload.callId)")
                CallKitProvider.shared.presentIncomingCall(ringing)
            }
            return
        }
        guard phase == .idle else {
            PushDiag.log("push.dropped.nonidle", "phase=\(phase) callId=\(payload.callId)")
            return
        }
        PushDiag.log("push.ringing", "callId=\(payload.callId) appState=\(UIApplication.shared.applicationState.rawValue)")
        // Present BEFORE any network work: a backgrounded app that has to wait
        // on a Supabase round trip to show the lock-screen ring misses Apple's
        // VoIP-enforcement deadline and the call is silently dropped — exactly
        // how "rings in the foreground, nothing on the lock screen" happened.
        ringIncoming(call: IncomingCall(fromId: payload.from, callerName: payload.callerName,
                                        callId: payload.callId))
        // CallKit already shows callerName from the push; fetch the full profile
        // only to enrich the in-app overlay, never gate the ring on it.
        if let profile = try? await DatabaseService.profile(id: payload.from) {
            incoming?.profile = profile
        }
        return
    }

    // MARK: - WebRTC setup / teardown

    /// Builds the peer connection and joins `call:<callId>`.
    ///
    /// `prewarm` is the caller preparing during the ring: the audio unit is
    /// left alone (the calling tone owns the speaker) and the offer is held
    /// until the answer, instead of being sent and re-sent into a channel
    /// nobody has joined yet.
    private func setupRtc(callId: String, peerId: String, asCaller: Bool, prewarm: Bool = false) async throws {
        guard let uid = app.currentUserId else { return }
        let generation = callGeneration
        isCaller = asCaller
        if !prewarm {
            rtcConnected = false
            connectedAt = nil
            // Hands the session to WebRTC's own wrapper and starts its audio
            // unit; the previous raw AVAudioSession calls left the two
            // disagreeing and the unit never ran, so both sides heard silence.
            CallAudioSession.activate()
        }

        // Join the signalling channel first and alongside everything else:
        // the subscribe round trip was the slowest step and needs neither the
        // relay nor the peer connection. Anything that arrives before the
        // connection exists waits in `earlySignals`.
        let channel = client.channel("call:\(callId)")
        signalChannel = channel
        signalSubscription = channel.onBroadcast(event: "call") { [weak self] json in
            guard let payload = json["payload"],
                  let p = try? payload.decode(as: CallSignal.self) else { return }
            Task { @MainActor [weak self] in
                self?.handleCallSignal(p)
            }
        }
        async let subscribed: Void = channel.subscribeWithError()

        // Resolved before the peer connection exists: ICE servers cannot be
        // added after gathering starts, so a call created without the relay
        // stays without it for its whole life. Usually cached already.
        let ice = await TurnService.shared.iceServers()
        guard callGeneration == generation else {
            if signalChannel !== channel { Task { await channel.unsubscribe() } }
            throw CancellationError()
        }

        let engine = WebRTCEngine(callId: callId, peerId: peerId, senderId: uid,
                                  iceServers: ice,
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
        engine.onConnectionStateChange = { [weak self] state in
            self?.connectionStateChanged(state)
        }
        engine.setMicEnabled(!micMuted)
        engine.setRemoteAudioEnabled(!deafened)
        self.engine = engine

        // If the camera was left on from a previous call (or toggled while
        // ringing), surface it to the peer on the very first negotiation.
        if cameraEnabled {
            engine.setCameraEnabled(true) { _ in }
        }

        try await subscribed
        guard callGeneration == generation, self.engine === engine else {
            engine.dispose()
            if signalChannel !== channel { Task { await channel.unsubscribe() } }
            throw CancellationError()
        }

        // What came in while the connection was being built.
        let early = earlySignals
        earlySignals = []
        for signal in early { handleCallSignal(signal) }

        if asCaller {
            let offer = try await engine.makeOffer()
            guard callGeneration == generation else { throw CancellationError() }
            sendOnSignalChannel(CallSignal(type: "offer", from: uid, to: peerId,
                                           callId: callId,
                                           sdp: CallSdp(type: offer.type.wireType, sdp: offer.sdp)))
            if !prewarm { startOfferRetry() }
        }
    }

    /// Re-sends the current offer until the answer lands. Broadcasts aren't
    /// stored, so an offer sent a moment before the other side joined the
    /// channel is gone; the desktop app does the same. The re-sent offer
    /// carries every candidate gathered so far.
    private func startOfferRetry() {
        offerRetryTask?.cancel()
        let generation = callGeneration
        offerRetryTask = Task { [weak self] in
            for delay in [0.7, 1.0, 1.0, 1.5, 2.0] {
                try? await Task.sleep(for: .seconds(delay))
                guard let self, !Task.isCancelled, self.callGeneration == generation,
                      let engine = self.engine, engine.awaitingAnswer,
                      let offer = engine.localDescription,
                      let uid = self.app.currentUserId, let peerId = self.activePeerId else { return }
                self.sendOnSignalChannel(CallSignal(type: "offer", from: uid, to: peerId,
                                                    callId: self.activeCallId,
                                                    sdp: CallSdp(type: "offer", sdp: offer.sdp)))
            }
        }
    }

    private func handleCallSignal(_ p: CallSignal) {
        guard let uid = app.currentUserId, p.from != uid else { return }
        if let to = p.to, to != uid { return }
        guard let engine else {
            // The connection is still being built. Keep only the newest offer.
            if p.type == "offer" { earlySignals.removeAll { $0.type == "offer" } }
            earlySignals.append(p)
            return
        }

        if p.type == "offer", let sdp = p.sdp {
            // The same offer again (the other side re-sends until it hears
            // back): answer it the same way, and pick up any candidates it
            // now lists, instead of renegotiating the call.
            let key = Self.withoutCandidates(sdp.sdp)
            if key == lastRemoteOffer {
                if let lastAnswer {
                    sendOnSignalChannel(CallSignal(type: "answer", from: uid, to: p.from,
                                                   callId: activeCallId, sdp: lastAnswer))
                }
                Task { await Self.addCandidates(in: sdp.sdp, to: engine) }
                return
            }
            lastRemoteOffer = key
            Task {
                do {
                    let remote = RTCSessionDescription(type: .offer, sdp: sdp.sdp)
                    try await engine.setRemote(sdp: remote)
                    let answer = try await engine.makeAnswer()
                    let wire = CallSdp(type: answer.type.wireType, sdp: answer.sdp)
                    lastAnswer = wire
                    sendOnSignalChannel(CallSignal(type: "answer", from: uid, to: p.from,
                                                   callId: activeCallId, sdp: wire))
                } catch {
                    self.error = error.localizedDescription
                }
            }
        } else if p.type == "answer", let sdp = p.sdp {
            // A repeat of an answer already applied: nothing to do.
            guard engine.awaitingAnswer else { return }
            Task {
                // An answer racing a duplicate of itself fails harmlessly; it
                // is not worth an error on the call screen.
                try? await engine.setRemote(sdp: RTCSessionDescription(type: .answer, sdp: sdp.sdp))
                if !engine.awaitingAnswer { offerRetryTask?.cancel() }
            }
        } else if p.type == "ice", let candidate = p.candidate {
            let ice = RTCIceCandidate(sdp: candidate.candidate,
                                      sdpMLineIndex: candidate.sdpMLineIndex,
                                      sdpMid: candidate.sdpMid)
            Task { try? await engine.addIceCandidate(ice) }
        } else if p.type == "leave" {
            Task { await reset() }
        }
    }

    /// An SDP without its candidate lines: two copies of one offer, sent
    /// moments apart, differ only in how many candidates had been gathered.
    private static func withoutCandidates(_ sdp: String) -> String {
        sdp.split(whereSeparator: \.isNewline)
            .filter { !$0.hasPrefix("a=candidate:") && !$0.hasPrefix("a=end-of-candidates") }
            .joined(separator: "\n")
    }

    /// Adds the candidates an SDP lists (by media section).
    private static func addCandidates(in sdp: String, to engine: WebRTCEngine) async {
        var index: Int32 = -1
        var mid: String?
        for line in sdp.split(whereSeparator: \.isNewline) {
            if line.hasPrefix("m=") {
                index += 1
                mid = nil
            } else if line.hasPrefix("a=mid:") {
                mid = String(line.dropFirst("a=mid:".count))
            } else if line.hasPrefix("a=candidate:"), index >= 0 {
                let candidate = RTCIceCandidate(sdp: String(line.dropFirst(2)), sdpMLineIndex: index, sdpMid: mid)
                try? await engine.addIceCandidate(candidate)
            }
        }
    }

    // MARK: - Keeping the call up

    private func connectionStateChanged(_ state: RTCPeerConnectionState) {
        guard phase == .active else { return }
        switch state {
        case .connected:
            rtcConnected = true
            recoveryTask?.cancel()
            recoveryTask = nil
            if reconnecting {
                reconnecting = false
                CallSounds.shared.playConnected()
            }
            if connectedAt == nil {
                connectedAt = Date()
                CallSounds.shared.playConnected()
            }
        case .disconnected:
            rtcConnected = false
            beginRecovery(failed: false)
        case .failed:
            rtcConnected = false
            beginRecovery(failed: true)
        default:
            break
        }
    }

    /// The connection dropped. Before, any drop ended the call on the spot,
    /// so a lift, a tunnel or Wi-Fi handing over to mobile data hung up on
    /// you. Now a blip gets a moment to heal by itself, then the caller
    /// restarts ICE to find a new route, and the call only ends if nothing
    /// works for a while.
    private func beginRecovery(failed: Bool) {
        if connectedAt != nil { reconnecting = true }
        // A drop already being handled; a hard failure skips the wait.
        if recoveryTask != nil, !failed { return }
        recoveryTask?.cancel()
        let generation = callGeneration
        recoveryTask = Task { [weak self] in
            if !failed { try? await Task.sleep(for: .seconds(2)) }
            guard let self, !Task.isCancelled, self.callGeneration == generation,
                  self.phase == .active, !self.rtcConnected else { return }
            if self.isCaller { await self.restartIce() }
            try? await Task.sleep(for: .seconds(14))
            guard !Task.isCancelled, self.callGeneration == generation,
                  self.phase == .active, !self.rtcConnected else { return }
            if let peerId = self.activePeerId {
                await self.notifyPeerLeave(peerId, callId: self.activeCallId)
            }
            CallSounds.shared.playEnd()
            await self.reset()
            self.showNotice("Call dropped. The connection was lost.")
        }
    }

    private func restartIce() async {
        guard let engine, phase == .active,
              let peerId = activePeerId, let uid = app.currentUserId else { return }
        do {
            let offer = try await engine.makeOffer(iceRestart: true)
            sendOnSignalChannel(CallSignal(type: "offer", from: uid, to: peerId,
                                           callId: activeCallId,
                                           sdp: CallSdp(type: offer.type.wireType, sdp: offer.sdp)))
            startOfferRetry()
        } catch {
            // The deadline in beginRecovery ends the call if this can't recover.
        }
    }

    private func showNotice(_ text: String) {
        callNotice = text
        noticeTask?.cancel()
        noticeTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            self?.callNotice = nil
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
            startOfferRetry()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The peer connection, its channel and everything held for them.
    private func teardownRtc() async {
        offerRetryTask?.cancel()
        offerRetryTask = nil
        recoveryTask?.cancel()
        recoveryTask = nil
        engine?.onConnectionFailed = {}
        engine?.onConnectionStateChange = { _ in }
        engine?.dispose()
        engine = nil
        remoteHasVideo = false
        rtcConnected = false
        reconnecting = false
        heldSignals = nil
        earlySignals = []
        lastRemoteOffer = nil
        lastAnswer = nil
        signalSubscription = nil
        if let signalChannel {
            await signalChannel.unsubscribe()
        }
        signalChannel = nil
    }

    private func reset() async {
        callGeneration += 1
        prepareTask?.cancel()
        prepareTask = nil
        stopRingtone()
        await teardownRtc()
        phase = .idle
        cancelRingWatchdog()
        // Every way a call ends comes through here — including the far side
        // hanging up — so this is where the system call is released. Leaving
        // it registered keeps a dead call in the switcher and the audio
        // session held open.
        if let id = activeCallId { CallKitProvider.shared.endActiveCall(id: id) }
        if let incoming { CallKitProvider.shared.dismissIncomingCall(for: incoming) }
        incoming = nil
        activePeer = nil
        minimized = false
        cameraEnabled = false
        speakerOn = false
        callSignaled = false
        connectedAt = nil
        error = nil
        activeCallId = nil
        activePeerId = nil
        isCaller = false
        noticeTask?.cancel()
        callNotice = nil
        CallAudioSession.deactivate()
    }

    // MARK: - Ringtone

    private func startRingtone() {
        guard soundEnabled else { return }
        // Deliberately NOT `.playback`: that category cannot capture the
        // microphone, and answering from it left the mic dead for the whole
        // call.
        CallAudioSession.prepareForRinging()
        CallSounds.shared.startRingtone()
        CallHaptics.shared.startRingVibration()
    }

    private func startCallingTone() {
        guard soundEnabled else { return }
        CallAudioSession.prepareForRinging()
        CallSounds.shared.startCallingTone()
        CallHaptics.shared.startCallingVibration()
    }

    private func stopRingtone() {
        CallSounds.shared.stopRingtone()
        CallHaptics.shared.stop()
    }
}
