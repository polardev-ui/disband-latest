import SwiftUI
import WebRTC

/// The full-screen stage for a voice channel or group call.
///
/// Deliberately not the 1:1 call screen: that one is built around a single
/// face. Here every participant gets a tile on a slow-moving aurora tinted by
/// the room, speaking lights a tile's rim, and screens get the widest tile.
struct VoiceStageView: View {
    @Environment(AppState.self) private var app
    @Environment(VoiceSession.self) private var voice

    var body: some View {
        VStack(spacing: 14) {
            topBar
            tiles
            controlBar
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // A background, not a ZStack sibling: the aurora's blurred circles
        // are wider than the phone, and as a sibling they set the stack's
        // width — every control was laid out for 520pt and ran off screen.
        .background { AuroraBackground(seed: voice.room?.id ?? "voice").ignoresSafeArea() }
        .gesture(
            DragGesture(minimumDistance: 30).onEnded { value in
                if value.translation.height > 120 { voice.minimized = true }
            }
        )
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 10) {
            glassButton("chevron.down", label: "Minimise") { voice.minimized = true }

            VStack(spacing: 1) {
                Text(voice.room?.title ?? "Voice")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    Text(statusLine)
                        .font(.caption.weight(.medium).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 44)
            .background(.ultraThinMaterial, in: Capsule())
            .frame(maxWidth: .infinity)

            glassButton(voice.speakerOn ? "speaker.wave.2.fill" : "iphone",
                        label: voice.speakerOn ? "Use earpiece" : "Use speaker") {
                voice.toggleSpeaker()
            }
        }
        .padding(.top, 6)
    }

    private var statusLine: String {
        if voice.phase == .connecting { return "Connecting…" }
        if voice.room?.isGroup == true, !voice.ringingIds.isEmpty, voice.members.count <= 1 {
            return "Ringing \(voice.ringingIds.count)…"
        }
        let base = voice.room?.subtitle ?? ""
        guard let start = voice.connectedAt else { return base }
        return base.isEmpty ? Self.elapsed(since: start) : "\(base) · \(Self.elapsed(since: start))"
    }

    // MARK: - Tiles

    private struct Tile: Identifiable {
        enum Kind { case person, screen }
        let id: String
        let member: VoiceMember
        let kind: Kind
    }

    private var tileList: [Tile] {
        let meId = app.currentUserId
        var people = voice.members
        // You always appear, even in the moment before presence reloads.
        if let meId, !people.contains(where: { $0.userId == meId }), let profile = app.profile {
            people.insert(VoiceMember(userId: meId, profile: profile,
                                      muted: voice.micMuted, deafened: voice.deafened), at: 0)
        }
        let screens = people.filter { voice.liveScreens.contains($0.userId) }
            .map { Tile(id: "screen:\($0.userId)", member: $0, kind: .screen) }
        return screens + people.map { Tile(id: $0.userId, member: $0, kind: .person) }
    }

    private var tiles: some View {
        let list = tileList
        return GeometryReader { geo in
            let spacing: CGFloat = 12
            let columns = list.count <= 2 ? 1 : 2
            let rows = max(1, Int(ceil(Double(list.count) / Double(columns))))
            let columnWidth = (geo.size.width - spacing * CGFloat(columns - 1)) / CGFloat(columns)
            let fitHeight = (geo.size.height - spacing * CGFloat(rows - 1)) / CGFloat(rows)
            // Tiles keep a shape — wide when alone, portrait in a grid — so
            // one person is a card, not the whole screen.
            let tileHeight = min(fitHeight, columnWidth * (columns == 1 ? 0.8 : 1.2))
            let scrolls = fitHeight < 160
            let grid = LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: spacing), count: columns),
                                 spacing: spacing) {
                ForEach(list) { tile in
                    tileView(tile)
                        .frame(height: scrolls ? 200 : tileHeight)
                        .transition(.scale(scale: 0.9).combined(with: .opacity))
                }
            }
            .animation(.snappy(duration: 0.3), value: list.map(\.id))

            if scrolls {
                ScrollView(showsIndicators: false) { grid }
            } else {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    grid
                    if let waiting = waitingLine {
                        Text(waiting)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.75))
                            .padding(.top, 18)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    /// Shown under your own tile while a group call rings.
    private var waitingLine: String? {
        guard voice.room?.isGroup == true, voice.members.count <= 1 else { return nil }
        if !voice.ringingIds.isEmpty {
            return "Ringing \(voice.ringingIds.count) \(voice.ringingIds.count == 1 ? "person" : "people")…"
        }
        return "Waiting for others to join…"
    }

    @ViewBuilder private func tileView(_ tile: Tile) -> some View {
        let isMe = tile.member.userId == app.currentUserId
        let speaking = tile.kind == .person && voice.speaking.contains(tile.member.userId)
        let muted = isMe ? voice.micMuted : tile.member.muted
        let deafened = isMe ? voice.deafened : tile.member.deafened

        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .fill(Color(seed: tile.member.userId).opacity(0.18))
                )

            if let track = videoTrack(for: tile, isMe: isMe) {
                MeshVideoView(track: track, mirrored: isMe && tile.kind == .person, fit: tile.kind == .screen)
                    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            } else {
                AvatarView(url: tile.member.profile?.avatarUrl, name: tile.member.name, size: 84)
                    .overlay(Circle().stroke(Brand.online, lineWidth: speaking ? 3 : 0).padding(-5))
                    .scaleEffect(speaking ? 1.04 : 1)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            HStack(spacing: 6) {
                if tile.kind == .screen {
                    Image(systemName: "rectangle.on.rectangle").font(.caption.weight(.bold))
                } else if deafened {
                    Image(systemName: "headphones.slash").font(.caption.weight(.bold)).foregroundStyle(Brand.dnd)
                } else if muted {
                    Image(systemName: "mic.slash.fill").font(.caption.weight(.bold)).foregroundStyle(Brand.dnd)
                }
                Text(tile.kind == .screen ? "\(tile.member.name)'s screen" : (isMe ? "\(tile.member.name) (you)" : tile.member.name))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(.black.opacity(0.35), in: Capsule())
            .padding(10)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .strokeBorder(speaking ? Brand.online : Color.white.opacity(0.08), lineWidth: speaking ? 3 : 1)
        )
        .shadow(color: speaking ? Brand.online.opacity(0.45) : .clear, radius: 14)
        .animation(.snappy(duration: 0.2), value: speaking)
    }

    private func videoTrack(for tile: Tile, isMe: Bool) -> RTCVideoTrack? {
        switch tile.kind {
        case .screen:
            return voice.screenTracks[tile.member.userId]
        case .person:
            if isMe { return voice.cameraOn ? voice.localCameraTrack : nil }
            return voice.liveCameras.contains(tile.member.userId) ? voice.cameraTracks[tile.member.userId] : nil
        }
    }

    // MARK: - Controls

    private var controlBar: some View {
        HStack(spacing: 10) {
            controlButton(voice.micMuted ? "mic.slash.fill" : "mic.fill",
                          label: voice.micMuted ? "Unmute" : "Mute",
                          active: !voice.micMuted, alert: voice.micMuted) { voice.toggleMute() }
            controlButton(voice.cameraOn ? "video.fill" : "video.slash.fill",
                          label: voice.cameraOn ? "Turn camera off" : "Turn camera on",
                          active: voice.cameraOn) { voice.toggleCamera() }
            controlButton(voice.deafened ? "headphones.slash" : "headphones",
                          label: voice.deafened ? "Undeafen" : "Deafen",
                          active: !voice.deafened, alert: voice.deafened) { voice.toggleDeafen() }
            Button {
                Task { await voice.leave() }
            } label: {
                Image(systemName: "phone.down.fill")
                    .font(.system(size: 21, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 58)
                    .background(Brand.dnd, in: Capsule())
            }
            .accessibilityLabel("Leave")
        }
        .padding(8)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.1), lineWidth: 1))
    }

    private func controlButton(_ symbol: String, label: String, active: Bool, alert: Bool = false,
                               action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(active ? Color.black : Color.white)
                .frame(width: 58, height: 58)
                .background(active ? Color.white : (alert ? Brand.dnd.opacity(0.85) : Color.white.opacity(0.14)),
                            in: Circle())
                .contentTransition(.symbolEffect(.replace))
        }
        .accessibilityLabel(label)
    }

    private func glassButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.ultraThinMaterial, in: Circle())
        }
        .accessibilityLabel(label)
    }

    static func elapsed(since start: Date) -> String {
        let seconds = max(0, Int(Date().timeIntervalSince(start)))
        let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}

/// Soft, slowly drifting colour fields — the room's own tint rather than a
/// flat black call screen. Two rooms never look quite alike.
struct AuroraBackground: View {
    let seed: String
    @State private var drift = false

    var body: some View {
        // Sized by `Color.black`, which takes whatever it's offered. The
        // circles overflow on purpose and are clipped, so they can never
        // widen whatever this is placed behind.
        Color.black
            .overlay {
                ZStack {
                    blob(Color(seed: seed).opacity(0.75), size: 520, blur: 120,
                         x: drift ? -120 : -60, y: drift ? -260 : -200)
                    blob(Brand.accent.opacity(0.7), size: 460, blur: 130,
                         x: drift ? 140 : 90, y: drift ? 240 : 300)
                    blob(Color(seed: seed + "~").opacity(0.5), size: 320, blur: 110,
                         x: drift ? 60 : 120, y: drift ? -20 : 40)
                }
            }
            .clipped()
            .onAppear {
                withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true)) { drift = true }
            }
    }

    private func blob(_ color: Color, size: CGFloat, blur: CGFloat, x: CGFloat, y: CGFloat) -> some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .blur(radius: blur)
            .offset(x: x, y: y)
    }
}
