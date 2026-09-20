import AVFoundation
import Foundation
import Observation
import Supabase
import WebRTC

/// Where a multi-party call lives. Server voice channels and group calls share
/// one engine; they differ only in which tables and topics they use.
enum VoiceRoom: Hashable, Identifiable {
    case channel(id: String, name: String, serverId: String, serverName: String, serverIcon: String?)
    case group(id: String, name: String, iconUrl: String?)

    var id: String {
        switch self {
        case .channel(let id, _, _, _, _), .group(let id, _, _): return id
        }
    }

    var title: String {
        switch self {
        case .channel(_, let name, _, _, _), .group(_, let name, _): return name
        }
    }

    var subtitle: String {
        switch self {
        case .channel(_, _, _, let serverName, _): return serverName
        case .group: return "Group call"
        }
    }

    var iconUrl: String? {
        switch self {
        case .channel(_, _, _, _, let icon): return icon
        case .group(_, _, let icon): return icon
        }
    }

    var isGroup: Bool {
        if case .group = self { return true }
        return false
    }

    /// Mirrors the web: `voice:<id>`/`signal` and `group-call:<id>`/`group-call`.
    fileprivate var signalTopic: String {
        switch self {
        case .channel(let id, _, _, _, _): return "voice:\(id)"
        case .group(let id, _, _): return "group-call:\(id)"
        }
    }

    fileprivate var signalEvent: String { isGroup ? "group-call" : "signal" }
}

struct VoiceMember: Identifiable, Hashable {
    let userId: String
    var profile: Profile?
    var muted = false
    var deafened = false
    var id: String { userId }
    var name: String { profile?.name ?? "Someone" }
}

struct GroupRing: Identifiable, Equatable {
    let groupId: String
    let groupName: String
    let callerName: String
    let fromId: String
    let receivedAt = Date()
    var id: String { groupId }
}

enum VoicePhase: Equatable {
    case idle
    case connecting
    case connected
}

/// Server voice channels and group calls on iOS, interoperating with the web's
/// full-mesh WebRTC (one peer connection per other participant, signaled over
/// Supabase Realtime broadcasts).
///
/// **Who offers.** Whoever joins sends an offer to everyone already there;
/// people already in the room only answer. That is exactly the group-call
/// protocol. Server voice on the web *also* has existing members offer to the
/// newcomer, so an iPhone joining a voice channel will usually see a web
/// member's offer cross its own. The iPhone keeps its offer and ignores
/// theirs; the browser, receiving an offer while it has one outstanding,
/// performs an implicit rollback and answers. Both ends then agree on one
/// negotiation. Two iPhones break the same tie by user id.
///
/// **One call at a time.** A 1:1 call belongs to `CallManager` and CallKit.
/// Joining voice is refused while one is live, and voice leaves if one
/// connects.
@MainActor
@Observable
final class VoiceSession {
    // MARK: Observable state

    private(set) var room: VoiceRoom?
    private(set) var phase: VoicePhase = .idle
    private(set) var members: [VoiceMember] = []
    private(set) var speaking: Set<String> = []
    private(set) var micMuted = false
    private(set) var deafened = false
    private(set) var speakerOn = true
    private(set) var cameraOn = false
    private(set) var connectedAt: Date?
    /// Remote participants whose camera / screen is actually delivering frames.
    private(set) var liveCameras: Set<String> = []
    private(set) var liveScreens: Set<String> = []
    /// Members rung by this device who have not joined yet.
    private(set) var ringingIds: Set<String> = []
    var incomingRing: GroupRing?
    /// Stage (false) versus the floating pill (true).
    var minimized = false
    var error: String?

    private(set) var localCameraTrack: RTCVideoTrack?
    @ObservationIgnored private(set) var cameraTracks: [String: RTCVideoTrack] = [:]
    @ObservationIgnored private(set) var screenTracks: [String: RTCVideoTrack] = [:]

    var isActive: Bool { phase != .idle }

    func isIn(_ roomId: String) -> Bool { room?.id == roomId && isActive }

    /// Set by the app so voice never fights a 1:1 call for the audio session.
    @ObservationIgnored var isDirectCallActive: () -> Bool = { false }

    // MARK: Private machinery

    @ObservationIgnored private var client: SupabaseClient { SupabaseManager.client }
    @ObservationIgnored private var userId: String?
    @ObservationIgnored private var myName = "Someone"

    @ObservationIgnored private var factory: RTCPeerConnectionFactory?
    @ObservationIgnored private var audioTrack: RTCAudioTrack?
    @ObservationIgnored private var cameraSource: RTCVideoSource?
    @ObservationIgnored private var capturer: RTCCameraVideoCapturer?
    @ObservationIgnored private var iceServers: [RTCIceServer] = []

    @ObservationIgnored private var peers: [String: MeshPeer] = [:]
    @ObservationIgnored private var remoteAudio: [String: RTCAudioTrack] = [:]
    @ObservationIgnored private var frameWatchers: [String: FrameWatcher] = [:]
    /// Candidates that arrived before the offer that creates their peer.
    @ObservationIgnored private var earlyCandidates: [String: [RTCIceCandidate]] = [:]

    @ObservationIgnored private var signalChannel: RealtimeChannelV2?
    @ObservationIgnored private var signalSubscription: RealtimeSubscription?
    @ObservationIgnored private var presenceChannel: RealtimeChannelV2?
    @ObservationIgnored private var ringSubscription: RealtimeSubscription?
    @ObservationIgnored private var loops: [Task<Void, Never>] = []

    // MARK: - Lifecycle

    /// Listen for group-call rings for the signed-in user.
    ///
    /// Rings arrive on `call-user:<me>`, the same topic `CallManager` already
    /// holds open for 1:1 calls. `channel(_:)` returns that instance, so this
    /// only adds a second event handler to it — it never subscribes or
    /// unsubscribes the channel, which would take incoming 1:1 calls down.
    func start(userId: String?, displayName: String?) {
        ringSubscription = nil
        self.userId = userId
        self.myName = displayName ?? "Someone"
        guard let userId else {
            Task { await leave() }
            return
        }
        let channel = client.channel("call-user:\(userId)")
        ringSubscription = channel.onBroadcast(event: "group-call") { [weak self] json in
            guard let payload = json["payload"],
                  let signal = try? payload.decode(as: MeshSignal.self),
                  signal.type == "ring" else { return }
            Task { @MainActor [weak self] in self?.receiveRing(signal) }
        }
    }

    // MARK: - Joining and leaving

    func join(_ room: VoiceRoom) async {
        guard let userId else { return }
        if isIn(room.id) {
            minimized = false
            return
        }
        guard !isDirectCallActive() else {
            error = "Finish your call before joining voice."
            return
        }
        if isActive { await leave() }

        guard await microphoneAllowed() else {
            error = "Disband needs microphone access to join voice. Turn it on in Settings."
            return
        }

        error = nil
        self.room = room
        phase = .connecting
        minimized = false
        if case .group(let gid, _, _) = room, incomingRing?.groupId == gid { incomingRing = nil }

        CallAudioSession.activate()
        CallAudioSession.setSpeaker(speakerOn)

        let factory = RTCPeerConnectionFactory(
            encoderFactory: RTCDefaultVideoEncoderFactory(),
            decoderFactory: RTCDefaultVideoDecoderFactory()
        )
        self.factory = factory
        let mic = factory.audioTrack(withTrackId: "mic-\(UUID().uuidString.prefix(8))")
        mic.isEnabled = !micMuted
        audioTrack = mic
        iceServers = await TurnService.shared.iceServers()

        do {
            // Subscribe before announcing presence: existing members offer as
            // soon as they see the new row, and an offer sent before we are
            // listening is lost.
            try await subscribeSignals(for: room)
            try await writePresence(joining: true)
        } catch {
            self.error = "Couldn't join \(room.title). Check your connection and try again."
            await leave()
            return
        }

        phase = .connected
        connectedAt = Date()
        CallSounds.shared.playConnected()

        await reloadMembers()
        for member in members where member.userId != userId {
            await offer(to: member.userId)
        }
        startLoops()
    }

    /// Start a group call and ring everyone in the group who isn't in it.
    func startGroupCall(groupId: String, name: String, iconUrl: String?, memberIds: [String]) async {
        await join(.group(id: groupId, name: name, iconUrl: iconUrl))
        guard isIn(groupId), let userId else { return }

        let present = Set(members.map(\.userId))
        let toRing = memberIds.filter { $0 != userId && !present.contains($0) }
        ringingIds = Set(toRing)
        for memberId in toRing {
            let ring = MeshSignal(type: "ring", from: userId, groupId: groupId,
                                  groupName: name, callerName: myName)
            Task { await self.sendRing(ring, to: memberId) }
            Task {
                // Wakes members whose app is closed, exactly as the web does.
                struct PushBody: Encodable {
                    let calleeId: String, callId: String, callerName: String
                    let groupId: String, groupName: String
                }
                _ = try? await client.functions.invoke(
                    "send-call-push",
                    options: FunctionInvokeOptions(body: PushBody(
                        calleeId: memberId, callId: groupId, callerName: myName,
                        groupId: groupId, groupName: name))
                )
            }
        }
        Task {
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            ringingIds = []
        }
    }

    func leave() async {
        guard isActive || room != nil else { return }
        let leavingRoom = room
        loops.forEach { $0.cancel() }
        loops = []

        if let userId, signalChannel != nil {
            broadcast(MeshSignal(type: "leave", from: userId, client: MeshSignal.nativeClient))
        }
        if leavingRoom != nil { try? await writePresence(joining: false) }

        for peer in peers.values { peer.close() }
        peers = [:]
        remoteAudio = [:]
        earlyCandidates = [:]
        cameraTracks = [:]
        screenTracks = [:]
        frameWatchers = [:]
        stopCamera()
        audioTrack = nil
        factory = nil

        signalSubscription = nil
        if let signalChannel { await client.removeChannel(signalChannel) }
        signalChannel = nil
        if let presenceChannel { await client.removeChannel(presenceChannel) }
        presenceChannel = nil

        if phase == .connected { CallSounds.shared.playEnd() }
        if !isDirectCallActive() { CallAudioSession.deactivate() }

        room = nil
        phase = .idle
        members = []
        speaking = []
        liveCameras = []
        liveScreens = []
        ringingIds = []
        connectedAt = nil
        minimized = false
    }

    // MARK: - Controls

    func toggleMute() {
        micMuted.toggle()
        // Unmuting while deafened would transmit into a call you can't hear.
        if !micMuted && deafened { deafened = false; applyDeafen() }
        audioTrack?.isEnabled = !micMuted
        Task { await syncMuteState() }
    }

    func toggleDeafen() {
        deafened.toggle()
        if deafened { micMuted = true; audioTrack?.isEnabled = false }
        applyDeafen()
        Task { await syncMuteState() }
    }

    func toggleSpeaker() {
        speakerOn.toggle()
        CallAudioSession.setSpeaker(speakerOn)
    }

    func toggleCamera() {
        if cameraOn {
            stopCamera()
            for peer in peers.values { peer.setTrack(nil, on: .camera) }
        } else {
            startCamera()
        }
    }

    func declineRing() { incomingRing = nil }

    // MARK: - Signaling

    private func subscribeSignals(for room: VoiceRoom) async throws {
        let channel = client.channel(room.signalTopic)
        signalSubscription = channel.onBroadcast(event: room.signalEvent) { [weak self] json in
            guard let payload = json["payload"],
                  let signal = try? payload.decode(as: MeshSignal.self) else { return }
            Task { @MainActor [weak self] in await self?.handle(signal) }
        }
        try await channel.subscribeWithError()
        signalChannel = channel
    }

    private func broadcast(_ signal: MeshSignal) {
        guard let signalChannel, let room else { return }
        let event = room.signalEvent
        Task { try? await signalChannel.broadcast(event: event, message: signal) }
    }

    private func handle(_ signal: MeshSignal) async {
        guard let userId, isActive, signal.from != userId else { return }
        if let to = signal.to, to != userId { return }
        if signal.client == MeshSignal.nativeClient { peers[signal.from]?.remoteIsNative = true }

        switch signal.type {
        case "offer":
            guard let sdp = signal.sdp else { return }
            await handleOffer(from: signal.from, sdp: sdp, remoteIsNative: signal.client == MeshSignal.nativeClient)
        case "answer":
            guard let sdp = signal.sdp, let peer = peers[signal.from],
                  peer.signalingState == .haveLocalOffer else { return }
            try? await peer.acceptAnswer(RTCSessionDescription(type: .answer, sdp: sdp.sdp))
        case "ice":
            guard let c = signal.candidate else { return }
            let candidate = RTCIceCandidate(sdp: c.candidate, sdpMLineIndex: c.sdpMLineIndex, sdpMid: c.sdpMid)
            if let peer = peers[signal.from] {
                await peer.addCandidate(candidate)
            } else {
                earlyCandidates[signal.from, default: []].append(candidate)
            }
        case "leave":
            dropPeer(signal.from)
            members.removeAll { $0.userId == signal.from }
            CallSounds.shared.playLeave()
            // The web ends a group call once nobody else is connected.
            if room?.isGroup == true, peers.isEmpty, ringingIds.isEmpty { await leave() }
        case "screen":
            break // Frames, not flags, decide what is shown; see `sampleVideo`.
        default:
            break
        }
    }

    private func handleOffer(from remoteId: String, sdp: CallSdp, remoteIsNative: Bool) async {
        guard let audioTrack, let userId else { return }
        let peer = peers[remoteId] ?? makePeer(remoteId)
        peer.remoteIsNative = peer.remoteIsNative || remoteIsNative

        if peer.signalingState == .haveLocalOffer {
            // Offer collision (see the type comment). Against a browser this
            // device is always the side that keeps its offer. Between two
            // iPhones, the larger user id yields.
            let yield = peer.remoteIsNative && userId > remoteId
            guard yield else { return }
            do { try await peer.rollback() } catch { return }
        }

        do {
            let answer = try await peer.answer(RTCSessionDescription(type: .offer, sdp: sdp.sdp),
                                               audio: audioTrack, camera: localCameraTrack)
            broadcast(MeshSignal(type: "answer", from: userId, to: remoteId,
                                 sdp: CallSdp(type: answer.type.wireType, sdp: answer.sdp),
                                 client: MeshSignal.nativeClient))
        } catch {
            dropPeer(remoteId)
        }
    }

    private func offer(to remoteId: String) async {
        guard let audioTrack, let userId, peers[remoteId] == nil else { return }
        let peer = makePeer(remoteId)
        do {
            let offer = try await peer.makeOffer(audio: audioTrack, camera: localCameraTrack)
            broadcast(MeshSignal(type: "offer", from: userId, to: remoteId,
                                 sdp: CallSdp(type: offer.type.wireType, sdp: offer.sdp),
                                 client: MeshSignal.nativeClient))
        } catch {
            dropPeer(remoteId)
        }
    }

    private func makePeer(_ remoteId: String) -> MeshPeer {
        let peer = MeshPeer(remoteId: remoteId, streamId: userId ?? "ios",
                            factory: factory ?? RTCPeerConnectionFactory(), iceServers: iceServers)
        peer.onIceCandidate = { [weak self] candidate in
            guard let self, let userId = self.userId else { return }
            self.broadcast(MeshSignal(
                type: "ice", from: userId, to: remoteId,
                candidate: CallIceCandidate(candidate: candidate.sdp,
                                            sdpMLineIndex: candidate.sdpMLineIndex,
                                            sdpMid: candidate.sdpMid),
                client: MeshSignal.nativeClient))
        }
        peer.onTrack = { [weak self] lane, track in
            self?.attach(track, lane: lane, from: remoteId)
        }
        peer.onStateChange = { [weak self] state in
            // The reconcile loop re-offers to anyone still present, so a
            // dropped connection heals instead of leaving a silent tile.
            if state == .failed || state == .closed { self?.dropPeer(remoteId) }
        }
        peers[remoteId] = peer

        if let queued = earlyCandidates.removeValue(forKey: remoteId) {
            Task { for candidate in queued { await peer.addCandidate(candidate) } }
        }
        return peer
    }

    private func dropPeer(_ remoteId: String) {
        peers.removeValue(forKey: remoteId)?.close()
        remoteAudio[remoteId] = nil
        cameraTracks[remoteId] = nil
        screenTracks[remoteId] = nil
        frameWatchers["\(remoteId):camera"] = nil
        frameWatchers["\(remoteId):screen"] = nil
        liveCameras.remove(remoteId)
        liveScreens.remove(remoteId)
        speaking.remove(remoteId)
    }

    private func attach(_ track: RTCMediaStreamTrack, lane: MeshLane, from remoteId: String) {
        switch lane {
        case .audio:
            guard let audio = track as? RTCAudioTrack else { return }
            audio.isEnabled = !deafened
            remoteAudio[remoteId] = audio
        case .camera, .screen:
            guard let video = track as? RTCVideoTrack else { return }
            let key = "\(remoteId):\(lane == .camera ? "camera" : "screen")"
            if let old = frameWatchers[key] {
                (lane == .camera ? cameraTracks[remoteId] : screenTracks[remoteId])?.remove(old)
            }
            let watcher = FrameWatcher()
            video.add(watcher)
            frameWatchers[key] = watcher
            if lane == .camera { cameraTracks[remoteId] = video } else { screenTracks[remoteId] = video }
        }
    }

    private func applyDeafen() {
        for track in remoteAudio.values { track.isEnabled = !deafened }
    }

    // MARK: - Presence

    private struct VoicePresenceRow: Codable {
        let channel_id: String
        let user_id: String
        var muted: Bool?
        var deafened: Bool?
    }

    private struct GroupPresenceRow: Codable {
        let group_id: String
        let user_id: String
    }

    private func writePresence(joining: Bool) async throws {
        guard let userId, let room else { return }
        switch room {
        case .channel(let id, _, _, _, _):
            if joining {
                try await client.from("voice_presence")
                    .upsert(VoicePresenceRow(channel_id: id, user_id: userId,
                                             muted: micMuted, deafened: deafened))
                    .execute()
            } else {
                try await client.from("voice_presence").delete()
                    .eq("channel_id", value: id).eq("user_id", value: userId).execute()
            }
        case .group(let id, _, _):
            if joining {
                try await client.from("group_call_presence")
                    .upsert(GroupPresenceRow(group_id: id, user_id: userId)).execute()
            } else {
                try await client.from("group_call_presence").delete()
                    .eq("group_id", value: id).eq("user_id", value: userId).execute()
            }
        }
    }

    private func syncMuteState() async {
        guard let userId, case .channel(let id, _, _, _, _) = room else { return }
        struct Flags: Encodable { let muted: Bool; let deafened: Bool }
        _ = try? await client.from("voice_presence")
            .update(Flags(muted: micMuted, deafened: deafened))
            .eq("channel_id", value: id).eq("user_id", value: userId).execute()
        if let index = members.firstIndex(where: { $0.userId == userId }) {
            members[index].muted = micMuted
            members[index].deafened = deafened
        }
    }

    private func reloadMembers() async {
        guard let room else { return }
        let loaded = (try? await Self.fetchMembers(of: room)) ?? members
        guard self.room == room else { return }

        let previous = Set(members.map(\.userId))
        let now = Set(loaded.map(\.userId))
        if phase == .connected, !previous.isEmpty {
            if now.subtracting(previous).subtracting([userId ?? ""]).isEmpty == false {
                CallSounds.shared.playJoin()
            }
        }
        ringingIds.subtract(now)
        members = loaded
    }

    /// Who is in a room, for the lobby and the channel list as well as the
    /// stage. Server voice reads `voice_presence_live`, which hides rows whose
    /// client stopped heartbeating (the old direct read showed people who had
    /// closed the app hours earlier).
    static func fetchMembers(of room: VoiceRoom) async throws -> [VoiceMember] {
        let client = SupabaseManager.client
        switch room {
        case .channel(let id, _, _, _, _):
            let rows: [VoicePresenceRow] = try await client.from("voice_presence_live")
                .select("channel_id,user_id,muted,deafened")
                .eq("channel_id", value: id).execute().value
            let profiles = try await fetchProfiles(rows.map(\.user_id))
            return rows.map {
                VoiceMember(userId: $0.user_id, profile: profiles[$0.user_id],
                            muted: $0.muted ?? false, deafened: $0.deafened ?? false)
            }
        case .group(let id, _, _):
            let rows: [GroupPresenceRow] = try await client.from("group_call_presence")
                .select("group_id,user_id").eq("group_id", value: id).execute().value
            let profiles = try await fetchProfiles(rows.map(\.user_id))
            return rows.map { VoiceMember(userId: $0.user_id, profile: profiles[$0.user_id]) }
        }
    }

    /// Occupants of several voice channels in one round trip, for a server's
    /// channel list.
    static func occupants(channelIds: [String]) async -> [String: [VoiceMember]] {
        guard !channelIds.isEmpty else { return [:] }
        let client = SupabaseManager.client
        guard let rows: [VoicePresenceRow] = try? await client.from("voice_presence_live")
            .select("channel_id,user_id,muted,deafened")
            .in("channel_id", values: channelIds).execute().value else { return [:] }
        let profiles = (try? await fetchProfiles(rows.map(\.user_id))) ?? [:]
        var byChannel: [String: [VoiceMember]] = [:]
        for row in rows {
            byChannel[row.channel_id, default: []].append(
                VoiceMember(userId: row.user_id, profile: profiles[row.user_id],
                            muted: row.muted ?? false, deafened: row.deafened ?? false))
        }
        return byChannel
    }

    private static func fetchProfiles(_ ids: [String]) async throws -> [String: Profile] {
        guard !ids.isEmpty else { return [:] }
        let profiles: [Profile] = try await SupabaseManager.client.from("profiles")
            .select().in("id", values: Array(Set(ids))).execute().value
        return Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })
    }

    // MARK: - Background loops

    private func startLoops() {
        guard let room else { return }

        // Presence: react to joins/leaves immediately, with a slow poll as a
        // safety net for a dropped realtime connection.
        let (table, filter): (String, String) = {
            switch room {
            case .channel(let id, _, _, _, _): return ("voice_presence", "channel_id=eq.\(id)")
            case .group(let id, _, _): return ("group_call_presence", "group_id=eq.\(id)")
            }
        }()
        loops.append(Task { [weak self] in
            let (channel, stream) = await RealtimeService.observeChanges(table: table, filter: filter)
            await MainActor.run { self?.presenceChannel = channel }
            for await _ in stream {
                guard !Task.isCancelled else { break }
                await self?.reloadMembers()
            }
        })
        loops.append(Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                await self?.reloadMembers()
            }
        })

        // Heartbeat, so `voice_presence_live` keeps showing us. Group presence
        // has no heartbeat on the web either.
        if case .channel(let id, _, _, _, _) = room {
            loops.append(Task { [weak self] in
                while !Task.isCancelled {
                    _ = try? await self?.client.rpc("touch_voice_presence", params: ["p_channel": id]).execute()
                    try? await Task.sleep(nanoseconds: 30_000_000_000)
                }
            })
        }

        // Speaking indicators and live-video detection.
        loops.append(Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 400_000_000)
                await self?.sampleLevels()
                self?.sampleVideo()
            }
        })

        // Heal: offer to anyone present with no connection. The grace period
        // lets a newcomer's own offer arrive first, as it normally will.
        loops.append(Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                await self?.reconcile()
            }
        })
    }

    private func reconcile() async {
        guard let userId, phase == .connected else { return }
        for member in members where member.userId != userId {
            if let peer = peers[member.userId] {
                let stuck = peer.connectionState != .connected
                    && Date().timeIntervalSince(peer.createdAt) > 20
                if stuck { dropPeer(member.userId) } else { continue }
            }
            await offer(to: member.userId)
        }
        // Anyone connected who is no longer listed as present has gone.
        let present = Set(members.map(\.userId))
        for remoteId in peers.keys where !present.contains(remoteId) {
            if let peer = peers[remoteId], Date().timeIntervalSince(peer.createdAt) > 8 {
                dropPeer(remoteId)
            }
        }
    }

    private func sampleLevels() async {
        guard let userId else { return }
        var next: Set<String> = []
        var mine = 0.0
        for (remoteId, peer) in peers {
            if await peer.inboundAudioLevel() > 0.04 { next.insert(remoteId) }
            if !micMuted { mine = max(mine, await peer.outboundAudioLevel()) }
        }
        if mine > 0.04 { next.insert(userId) }
        if next != speaking { speaking = next }
    }

    private func sampleVideo() {
        var cameras: Set<String> = []
        var screens: Set<String> = []
        for (key, watcher) in frameWatchers where watcher.isLive {
            let parts = key.split(separator: ":")
            guard parts.count == 2 else { continue }
            if parts[1] == "camera" { cameras.insert(String(parts[0])) } else { screens.insert(String(parts[0])) }
        }
        if cameras != liveCameras { liveCameras = cameras }
        if screens != liveScreens { liveScreens = screens }
    }

    // MARK: - Rings

    private func receiveRing(_ signal: MeshSignal) {
        guard let groupId = signal.groupId, signal.from != userId, !isIn(groupId) else { return }
        let ring = GroupRing(groupId: groupId, groupName: signal.groupName ?? "Group call",
                             callerName: signal.callerName ?? "Someone", fromId: signal.from)
        incomingRing = ring
        CallHaptics.shared.startRingVibration()
        Task {
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            if incomingRing == ring { incomingRing = nil }
            CallHaptics.shared.stop()
        }
    }

    private func sendRing(_ ring: MeshSignal, to memberId: String) async {
        let channel = client.channel("call-user:\(memberId)") { config in
            config.broadcast.acknowledgeBroadcasts = true
        }
        await channel.subscribe()
        try? await channel.broadcast(event: "group-call", message: ring)
        await client.removeChannel(channel)
    }

    // MARK: - Camera

    private func startCamera() {
        guard let factory,
              let device = RTCCameraVideoCapturer.captureDevices().first(where: { $0.position == .front })
                ?? RTCCameraVideoCapturer.captureDevices().first else {
            error = "No camera is available."
            return
        }
        let source = factory.videoSource()
        let track = factory.videoTrack(with: source, trackId: "cam-\(UUID().uuidString.prefix(8))")
        let capturer = RTCCameraVideoCapturer(delegate: source)

        let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
        let format = formats.min { a, b in
            let da = a.formatDescription.dimensions, db = b.formatDescription.dimensions
            return abs(Int(da.width) - 640) + abs(Int(da.height) - 480)
                < abs(Int(db.width) - 640) + abs(Int(db.height) - 480)
        }
        guard let format else { return }
        let fps = min(max(Int(format.videoSupportedFrameRateRanges.first?.maxFrameRate ?? 30), 15), 30)

        cameraSource = source
        self.capturer = capturer
        localCameraTrack = track
        cameraOn = true
        capturer.startCapture(with: device, format: format, fps: fps) { [weak self] error in
            guard error != nil else { return }
            DispatchQueue.main.async { self?.stopCamera() }
        }
        for peer in peers.values { peer.setTrack(track, on: .camera) }
    }

    private func stopCamera() {
        capturer?.stopCapture()
        capturer = nil
        cameraSource = nil
        localCameraTrack = nil
        cameraOn = false
    }

    // MARK: - Permissions

    private func microphoneAllowed() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return true
        case .denied: return false
        default:
            return await withCheckedContinuation { cont in
                AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
            }
        }
    }
}

/// Notices whether a video track is delivering frames. The web switches a
/// camera off by replacing the track with nothing, so the receiving track
/// never ends — it just goes quiet. Frames are the only reliable signal.
final class FrameWatcher: NSObject, RTCVideoRenderer {
    private let lock = NSLock()
    private var lastFrame: Date = .distantPast

    var isLive: Bool {
        lock.lock(); defer { lock.unlock() }
        return Date().timeIntervalSince(lastFrame) < 1.5
    }

    func setSize(_ size: CGSize) {}

    func renderFrame(_ frame: RTCVideoFrame?) {
        guard frame != nil else { return }
        lock.lock(); lastFrame = Date(); lock.unlock()
    }
}
