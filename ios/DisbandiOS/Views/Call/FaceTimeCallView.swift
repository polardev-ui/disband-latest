import AVFoundation
import SwiftUI
import WebRTC

/* ------------------------------------------------------------------ */
/*  Blurred avatar backdrop                                            */
/* ------------------------------------------------------------------ */

/// Fills the space behind a participant with a heavily blurred, enlarged copy
/// of their avatar — the FaceTime treatment for someone with no camera on.
///
/// The image is scaled up before blurring because a blur samples outside the
/// view's bounds and would otherwise fade to transparent at the edges.
struct BlurredAvatarBackdrop: View {
    let url: String?
    let name: String
    var blur: CGFloat = 60

    var body: some View {
        ZStack {
            // Colour derived from the name, so a participant with no avatar
            // still gets a stable backdrop rather than flat black.
            LinearGradient(
                colors: [Color(seed: name).opacity(0.85), Color(seed: name + "2").opacity(0.6)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )

            if url != nil {
                RemoteImage(url: url, contentMode: .fill) { Color.clear }
                    .scaleEffect(1.6)
                    .blur(radius: blur, opaque: false)
            }

            // Keeps foreground avatar, name and controls legible over any image.
            LinearGradient(
                colors: [.black.opacity(0.35), .black.opacity(0.55)],
                startPoint: .top, endPoint: .bottom
            )
        }
        // Fill whatever is offered and clip; never grow to the source image.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
}

/* ------------------------------------------------------------------ */
/*  Avatar with ripples                                                */
/* ------------------------------------------------------------------ */

/// The other person's avatar on the call screen. While the call is still
/// ringing or connecting, rings ripple out from it; once you're talking it
/// sits still. Still with reduce motion.
struct CallPulseAvatar: View {
    let url: String?
    let name: String
    var size: CGFloat = 132
    var waiting: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if waiting && !reduceMotion {
                TimelineView(.animation) { context in
                    let t = context.date.timeIntervalSinceReferenceDate
                    ZStack {
                        ForEach(0..<3, id: \.self) { ring in
                            let phase = (t / 2.4 + Double(ring) / 3).truncatingRemainder(dividingBy: 1)
                            Circle()
                                .stroke(Color.white.opacity(0.32 * (1 - phase)), lineWidth: 2)
                                .frame(width: size, height: size)
                                .scaleEffect(1 + phase * 0.75)
                        }
                    }
                }
                .transition(.opacity)
            }
            AvatarView(url: url, name: name, size: size)
                .shadow(color: .black.opacity(0.4), radius: 24, y: 8)
                .scaleEffect(waiting ? 1 : 1.04)
        }
        .frame(width: size * 1.8, height: size * 1.8)
        .animation(.spring(response: 0.5, dampingFraction: 0.7), value: waiting)
        .accessibilityHidden(true)
    }
}

/// Three bars that bob while a call is live: at a glance, the call is on.
struct LiveAudioBars: View {
    var color: Color = .white
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: 2) {
                ForEach(0..<3, id: \.self) { bar in
                    let wave = (sin(t * 5.2 + Double(bar) * 1.9) + 1) / 2
                    Capsule()
                        .fill(color)
                        .frame(width: 3, height: 5 + 9 * wave)
                }
            }
            .frame(height: 14)
        }
        .accessibilityHidden(true)
    }
}

/// A notice about a call that has ended ("declined", "No answer"), shown
/// after the call screen has gone. It used to be set and cleared in the same
/// moment, so nobody ever saw it.
struct CallNoticeToast: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "phone.down.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Brand.dnd)
            Text(text)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.textPrimary)
                .lineLimit(2)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(Brand.elevated, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.08)))
        .shadow(color: .black.opacity(0.35), radius: 14, y: 6)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }
}

/* ------------------------------------------------------------------ */
/*  Picture-in-picture tile                                            */
/* ------------------------------------------------------------------ */

/// Which corner the self-view is parked in.
enum PiPCorner: CaseIterable {
    case topLeading, topTrailing, bottomLeading, bottomTrailing

    /// Offset from the container's centre that parks the tile in this corner.
    ///
    /// `topInset` and `bottomInset` keep it clear of the status bar and of the
    /// call controls, which otherwise sit underneath it.
    func offset(in size: CGSize, tile: CGSize, inset: CGFloat,
                topInset: CGFloat = 0, bottomInset: CGFloat = 0) -> CGSize {
        let x = (size.width - tile.width) / 2 - inset
        let y = (size.height - tile.height) / 2 - inset
        switch self {
        case .topLeading:     return CGSize(width: -x, height: -y + topInset)
        case .topTrailing:    return CGSize(width:  x, height: -y + topInset)
        case .bottomLeading:  return CGSize(width: -x, height:  y - bottomInset)
        case .bottomTrailing: return CGSize(width:  x, height:  y - bottomInset)
        }
    }

    /// Nearest corner to a point expressed as an offset from centre.
    static func nearest(to offset: CGSize) -> PiPCorner {
        switch (offset.width < 0, offset.height < 0) {
        case (true, true):   return .topLeading
        case (false, true):  return .topTrailing
        case (true, false):  return .bottomLeading
        case (false, false): return .bottomTrailing
        }
    }
}

/* ------------------------------------------------------------------ */
/*  FaceTime-style call screen                                         */
/* ------------------------------------------------------------------ */

/// Full-screen call UI modelled on FaceTime.
///
/// - The peer fills the screen: their video when they have a camera on,
///   otherwise their avatar over a blurred blow-up of it.
/// - Your own view is a draggable tile that snaps to the nearest corner and
///   stays there; tapping it enlarges.
/// - Controls are hidden until you tap the screen, then fade out again.
/// - The whole thing can be minimised so the rest of the app stays usable
///   during a call.
struct FaceTimeCallView: View {
    @Environment(AppState.self) private var app
    let call: CallManager

    @State private var controlsVisible = true
    @State private var hideTask: Task<Void, Never>?

    @State private var corner: PiPCorner = .bottomTrailing
    @State private var drag: CGSize = .zero
    @State private var pipEnlarged = false
    /// How far the screen has been pulled down; past a point it minimises.
    @State private var pull: CGFloat = 0

    /// Still ringing or getting connected (or reconnecting).
    private var waiting: Bool {
        call.phase == .outgoing || !call.rtcConnected || call.reconnecting
    }

    private var peerName: String { call.activePeer?.name ?? "Disband" }
    private var remoteVideo: RTCVideoTrack? {
        call.remoteHasVideo ? call.engine?.remoteVideoTrack : nil
    }

    var body: some View {
        // The reader deliberately does NOT ignore the safe area: a view that
        // ignores it reports `safeAreaInsets` as zero, which is how the
        // minimise chevron ended up drawn on top of the status bar clock.
        // Only the backdrop is allowed outside the safe area; everything the
        // user touches lays out inside it.
        GeometryReader { geo in
            ZStack {
                peerLayer
                    // Pinned to the container so no avatar, however large or
                    // however it is decoded, can inflate the ZStack and drag
                    // the controls off-screen with it. Grown by the insets so
                    // it still bleeds under the status bar and home indicator
                    // rather than leaving a black strip.
                    .frame(
                        width: geo.size.width + geo.safeAreaInsets.leading + geo.safeAreaInsets.trailing,
                        height: geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom
                    )
                    .clipped()
                    .ignoresSafeArea()

                selfTile(in: geo.size)

                if controlsVisible {
                    controlsLayer
                        .transition(.opacity)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .background(Color.black.ignoresSafeArea())
            // Tap anywhere (not on a control) to reveal or dismiss the chrome.
            .contentShape(Rectangle())
            .onTapGesture { toggleControls() }
            // Pull the call down to tuck it away, like the system's own call
            // screen; it shrinks a little under the finger as it goes. The
            // self-view's own drag takes priority over this one.
            .gesture(
                DragGesture(minimumDistance: 16)
                    .onChanged { value in
                        guard value.translation.height > 0,
                              value.translation.height > abs(value.translation.width) else { return }
                        pull = value.translation.height
                    }
                    .onEnded { value in
                        if pull > 140 || value.predictedEndTranslation.height > 420 {
                            Haptics.soft()
                            withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                                call.minimized = true
                            }
                        } else {
                            withAnimation(.spring(response: 0.32, dampingFraction: 0.8)) { pull = 0 }
                        }
                    }
            )
            .scaleEffect(1 - min(pull, 400) / 2200, anchor: .top)
            .offset(y: pull * 0.6)
            .clipShape(RoundedRectangle(cornerRadius: pull > 0 ? 44 : 0, style: .continuous))
        }
        .onAppear { pull = 0; scheduleHide(); dismissKeyboard() }
        .onDisappear { hideTask?.cancel() }
        // Any state change worth looking at brings the controls back.
        .onChange(of: call.phase) { _, _ in showControls() }
        .onChange(of: call.error) { _, new in if new != nil { showControls() } }
        .onChange(of: call.reconnecting) { _, now in if now { showControls() } }
        .onChange(of: call.rtcConnected) { _, now in if now { Haptics.success() } }
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                        to: nil, from: nil, for: nil)
    }

    // MARK: - Peer (full screen)

    @ViewBuilder private var peerLayer: some View {
        if let remoteVideo {
            RemoteCallVideoView(track: remoteVideo)
        } else {
            ZStack {
                BlurredAvatarBackdrop(url: call.activePeer?.avatarUrl, name: peerName)
                VStack(spacing: 6) {
                    CallPulseAvatar(url: call.activePeer?.avatarUrl, name: peerName,
                                    size: 132, waiting: waiting)
                    VStack(spacing: 4) {
                        Text(peerName)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.white)
                        // Driven by a timeline rather than recomputed on the
                        // next unrelated redraw, which is why the duration used
                        // to advance only when the screen was tapped.
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            Text(statusLine(at: context.date))
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(call.reconnecting ? Brand.idle : .white.opacity(0.7))
                                .contentTransition(.numericText())
                        }
                    }
                }
            }
        }
    }

    private func statusLine(at date: Date) -> String {
        if call.phase == .outgoing {
            return call.callSignaled ? "Calling\u{2026}" : "Connecting\u{2026}"
        }
        if call.reconnecting { return "Reconnecting\u{2026}" }
        if let connectedAt = call.connectedAt {
            return formatElapsed(connectedAt, at: date)
        }
        return "Connecting\u{2026}"
    }

    // MARK: - Self view (draggable PiP)

    /// Height the bottom row of controls occupies, so the tile can be parked
    /// clear of it rather than sitting on the end-call button.
    private static let controlsHeight: CGFloat = 110

    private func selfTile(in container: CGSize) -> some View {
        let tile = pipEnlarged
            ? CGSize(width: 190, height: 260)
            : CGSize(width: 112, height: 156)
        let base = corner.offset(
            in: container,
            tile: tile,
            inset: 18,
            bottomInset: controlsVisible ? Self.controlsHeight : 0
        )

        return selfContent
            .frame(width: tile.width, height: tile.height)
            .clipShape(.rect(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.18), lineWidth: 1))
            .shadow(color: .black.opacity(0.45), radius: 14, y: 6)
            .offset(x: base.width + drag.width, y: base.height + drag.height)
            .gesture(
                DragGesture()
                    .onChanged { drag = $0.translation }
                    .onEnded { value in
                        // Snap to whichever corner the tile ended up closest to,
                        // then keep it there.
                        let landed = CGSize(width: base.width + value.translation.width,
                                            height: base.height + value.translation.height)
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.78)) {
                            corner = PiPCorner.nearest(to: landed)
                            drag = .zero
                        }
                    }
            )
            .onTapGesture {
                withAnimation(.spring(response: 0.34, dampingFraction: 0.8)) {
                    pipEnlarged.toggle()
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.78), value: pipEnlarged)
    }

    @ViewBuilder private var selfContent: some View {
        if call.cameraEnabled, let session = call.engine?.captureSession {
            LocalCallVideoView(session: session)
        } else {
            ZStack {
                BlurredAvatarBackdrop(url: app.profile?.avatarUrl,
                                      name: app.profile?.name ?? "You",
                                      blur: 26)
                AvatarView(url: app.profile?.avatarUrl,
                           name: app.profile?.name ?? "You",
                           size: pipEnlarged ? 74 : 46)
                if call.micMuted {
                    VStack {
                        Spacer()
                        Image(systemName: "mic.slash.fill")
                            .font(.caption)
                            .foregroundStyle(.white)
                            .padding(6)
                            .background(.black.opacity(0.5), in: .circle)
                            .padding(8)
                    }
                }
            }
        }
    }

    // MARK: - Controls

    private var controlsLayer: some View {
        VStack(spacing: 0) {
            topBar
            Spacer()
            bottomControls
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                Haptics.soft()
                withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) { call.minimized = true }
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: .circle)
            }
            .accessibilityLabel("Minimise call")

            Spacer()

            statusPill

            Spacer()

            // Only when there is a camera to flip; an empty slot keeps the
            // pill centred.
            Group {
                if call.cameraEnabled {
                    Button {
                        Haptics.select()
                        call.switchCamera()
                        showControls()
                    } label: {
                        Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(.ultraThinMaterial, in: .circle)
                    }
                    .accessibilityLabel("Switch camera")
                    .transition(.scale.combined(with: .opacity))
                } else {
                    Color.clear.frame(width: 44, height: 44)
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: call.cameraEnabled)
        }
        // Nudged in from the corner: at the very top-left the chevron sits
        // under the status bar clock on a notched phone, and its tap target
        // fights the pull-down gesture area.
        .padding(.horizontal, 16)
        .padding(.leading, 6)
        .padding(.top, 40)
    }

    /// Where the call is: the timer once you're talking, otherwise calling,
    /// connecting or reconnecting (amber, with a spinner).
    @ViewBuilder private var statusPill: some View {
        Group {
            if call.reconnecting {
                HStack(spacing: 7) {
                    ProgressView().controlSize(.mini).tint(.black)
                    Text("Reconnecting\u{2026}")
                }
                .foregroundStyle(.black)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Brand.idle, in: .capsule)
            } else if call.phase == .active, call.rtcConnected, let connectedAt = call.connectedAt {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    HStack(spacing: 7) {
                        LiveAudioBars(color: Brand.online)
                        Text(formatElapsed(connectedAt, at: context.date))
                            .monospacedDigit()
                            .contentTransition(.numericText())
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(.ultraThinMaterial, in: .capsule)
                }
            } else if call.phase == .outgoing || call.phase == .active {
                // Keep the connection state visible even when the peer's
                // camera is on. Without this, the only "Connecting…" label
                // lived under the avatar and disappeared behind video.
                Text(call.phase == .outgoing && call.callSignaled ? "Calling\u{2026}" : "Connecting\u{2026}")
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(.ultraThinMaterial, in: .capsule)
            }
        }
        .font(.subheadline.weight(.semibold))
        .transition(.scale(scale: 0.9).combined(with: .opacity))
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: call.reconnecting)
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: call.rtcConnected)
        .accessibilityElement(children: .combine)
    }

    private var bottomControls: some View {
        VStack(spacing: 14) {
            if let notice = call.callNotice {
                Text(notice)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.white.opacity(0.9))
                    .transition(.opacity)
            }
            if let error = call.error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Brand.dnd)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            // One glass tray, FaceTime-style: mute, camera, speaker, chat,
            // then hang up.
            HStack(spacing: 12) {
                trayButton(call.micMuted ? "mic.slash.fill" : "mic.fill",
                           on: call.micMuted, label: call.micMuted ? "Unmute" : "Mute") { call.toggleMic() }
                trayButton(call.cameraEnabled ? "video.fill" : "video.slash.fill",
                           on: call.cameraEnabled, label: "Camera") { call.toggleCamera() }
                    .opacity(call.phase == .active ? 1 : 0.45)
                    .disabled(call.phase != .active)
                trayButton(call.speakerOn ? "speaker.wave.3.fill" : "speaker.wave.2.fill",
                           on: call.speakerOn, label: "Speaker") { call.toggleSpeaker() }
                trayButton("bubble.left.fill", on: false, label: "Chat") {
                    // Opening the chat means leaving the call screen up but out
                    // of the way, which is exactly what minimising does.
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) { call.minimized = true }
                }
                Button {
                    Haptics.warning()
                    Task { await call.endCall() }
                } label: {
                    Image(systemName: "phone.down.fill")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 56, height: 56)
                        .background(Brand.danger, in: .circle)
                        .shadow(color: Brand.danger.opacity(0.45), radius: 12, y: 4)
                }
                .buttonStyle(PressScaleStyle(scale: 0.9))
                .accessibilityLabel("End call")
            }
            .padding(10)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.12), lineWidth: 1))
            .shadow(color: .black.opacity(0.35), radius: 20, y: 8)
            // Lifts the tray clear of the home indicator.
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity)
        .animation(.easeOut(duration: 0.2), value: call.callNotice)
        .background {
            LinearGradient(colors: [.clear, .black.opacity(0.5)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
    }

    private func trayButton(_ icon: String, on: Bool, label: String,
                            action: @escaping () -> Void) -> some View {
        Button {
            Haptics.select()
            action()
            showControls()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(on ? .black : .white)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 52, height: 52)
                .background(on ? AnyShapeStyle(.white) : AnyShapeStyle(.white.opacity(0.14)), in: .circle)
                .animation(.spring(response: 0.28, dampingFraction: 0.75), value: on)
        }
        .buttonStyle(PressScaleStyle(scale: 0.9))
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: - Control auto-hide

    private func toggleControls() {
        withAnimation(.easeInOut(duration: 0.2)) { controlsVisible.toggle() }
        if controlsVisible { scheduleHide() } else { hideTask?.cancel() }
    }

    private func showControls() {
        withAnimation(.easeInOut(duration: 0.2)) { controlsVisible = true }
        scheduleHide()
    }

    /// Controls stay put while the call is still connecting — hiding them
    /// during "Calling…" would leave no way to cancel without a blind tap.
    private func scheduleHide() {
        hideTask?.cancel()
        guard call.phase == .active else { return }
        hideTask = Task {
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation(.easeInOut(duration: 0.25)) { controlsVisible = false }
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Minimised pill                                                     */
/* ------------------------------------------------------------------ */

/// Compact call banner shown while the call is minimised, so the rest of
/// Disband stays navigable — matching the desktop behaviour where a call does
/// not trap you on one screen. Their avatar, the timer (or where the call
/// is), live bars, mute and hang up; the edge glows green when connected and
/// amber while connecting. Tap it to go back to the call.
struct MinimisedCallBar: View {
    let call: CallManager

    private var connected: Bool {
        call.phase == .active && call.rtcConnected && !call.reconnecting && call.connectedAt != nil
    }
    private var tint: Color { connected ? Brand.online : Brand.idle }

    var body: some View {
        HStack(spacing: 10) {
            AvatarView(url: call.activePeer?.avatarUrl, name: call.activePeer?.name ?? "Call", size: 34)
                .overlay(Circle().strokeBorder(tint, lineWidth: 2))

            VStack(alignment: .leading, spacing: 1) {
                Text(call.activePeer?.name ?? "In call")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if connected, let connectedAt = call.connectedAt {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Text(formatElapsed(connectedAt, at: context.date))
                            .font(.system(size: 12).monospacedDigit())
                            .foregroundStyle(Brand.online)
                            .contentTransition(.numericText())
                    }
                } else {
                    // "Calling…" means the ring is out; "Connecting…" means
                    // media is still negotiating, including after answer.
                    Text(call.reconnecting ? "Reconnecting\u{2026}"
                         : call.callSignaled && call.phase == .outgoing ? "Calling\u{2026}" : "Connecting\u{2026}")
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.idle)
                }
            }

            Spacer(minLength: 8)

            if connected {
                LiveAudioBars(color: Brand.online)
                    .padding(.trailing, 4)
                    .transition(.scale.combined(with: .opacity))
            }

            Button {
                Haptics.select()
                call.toggleMic()
            } label: {
                Image(systemName: call.micMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(call.micMuted ? .black : .white)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 36, height: 36)
                    .background(call.micMuted ? AnyShapeStyle(.white) : AnyShapeStyle(.white.opacity(0.14)), in: .circle)
            }
            .buttonStyle(PressScaleStyle(scale: 0.9))
            .accessibilityLabel(call.micMuted ? "Unmute" : "Mute")

            Button {
                Haptics.warning()
                Task { await call.endCall() }
            } label: {
                Image(systemName: "phone.down.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Brand.danger, in: .circle)
            }
            .buttonStyle(PressScaleStyle(scale: 0.9))
            .accessibilityLabel("End call")
        }
        .padding(.leading, 6)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .background(Color(hex: 0x16151A).opacity(0.96), in: .capsule)
        .overlay(Capsule().strokeBorder(tint.opacity(0.55), lineWidth: 1.5))
        .shadow(color: tint.opacity(0.25), radius: 14, y: 4)
        .shadow(color: .black.opacity(0.35), radius: 12, y: 6)
        .padding(.horizontal, 12)
        .animation(.spring(response: 0.35, dampingFraction: 0.82), value: connected)
        // Tapping the bar (but not its buttons) returns to the call.
        .contentShape(Capsule())
        .onTapGesture {
            Haptics.soft()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) { call.minimized = false }
        }
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Return to the call")
    }
}
