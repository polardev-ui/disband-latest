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

    @State private var corner: PiPCorner = .topTrailing
    @State private var drag: CGSize = .zero
    @State private var pipEnlarged = false

    private var peerName: String { call.activePeer?.name ?? "Disband" }
    private var remoteVideo: RTCVideoTrack? {
        call.remoteHasVideo ? call.engine?.remoteVideoTrack : nil
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                peerLayer
                    // Pinned to the container so no avatar, however large or
                    // however it is decoded, can inflate the ZStack and drag
                    // the controls off-screen with it.
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()

                selfTile(in: geo.size, insets: geo.safeAreaInsets)

                if controlsVisible {
                    controlsLayer(insets: geo.safeAreaInsets)
                        .transition(.opacity)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .background(.black)
            // Tap anywhere (not on a control) to reveal or dismiss the chrome.
            .contentShape(Rectangle())
            .onTapGesture { toggleControls() }
        }
        .ignoresSafeArea()
        .onAppear { scheduleHide() }
        .onDisappear { hideTask?.cancel() }
        // Any state change worth looking at brings the controls back.
        .onChange(of: call.phase) { _, _ in showControls() }
        .onChange(of: call.error) { _, new in if new != nil { showControls() } }
    }

    // MARK: - Peer (full screen)

    @ViewBuilder private var peerLayer: some View {
        if let remoteVideo {
            RemoteCallVideoView(track: remoteVideo)
        } else {
            ZStack {
                BlurredAvatarBackdrop(url: call.activePeer?.avatarUrl, name: peerName)
                VStack(spacing: 18) {
                    AvatarView(url: call.activePeer?.avatarUrl, name: peerName, size: 132)
                        .shadow(color: .black.opacity(0.4), radius: 24, y: 8)
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
                                .foregroundStyle(.white.opacity(0.7))
                        }
                    }
                }
            }
        }
    }

    private func statusLine(at date: Date) -> String {
        if call.phase == .outgoing { return "Calling\u{2026}" }
        if let connectedAt = call.connectedAt {
            return formatElapsed(connectedAt, at: date)
        }
        return "Connecting\u{2026}"
    }

    // MARK: - Self view (draggable PiP)

    /// Height the bottom row of controls occupies, so the tile can be parked
    /// clear of it rather than sitting on the end-call button.
    private static let controlsHeight: CGFloat = 96

    private func selfTile(in container: CGSize, insets: EdgeInsets) -> some View {
        let tile = pipEnlarged
            ? CGSize(width: 190, height: 260)
            : CGSize(width: 112, height: 156)
        let base = corner.offset(
            in: container,
            tile: tile,
            inset: 18,
            topInset: insets.top,
            bottomInset: insets.bottom + (controlsVisible ? Self.controlsHeight : 0)
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

    private func controlsLayer(insets: EdgeInsets) -> some View {
        VStack(spacing: 0) {
            topBar
                .padding(.top, insets.top)
            Spacer()
            bottomControls
                .padding(.bottom, max(insets.bottom, 16))
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                call.minimized = true
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.black.opacity(0.35), in: .circle)
            }
            .accessibilityLabel("Minimise call")

            Spacer()

            if call.phase == .active, let connectedAt = call.connectedAt {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(formatElapsed(connectedAt, at: context.date))
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(.black.opacity(0.35), in: .capsule)
                }
            }

            Spacer()
            // Balances the minimise button so the timer stays centred.
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var bottomControls: some View {
        VStack(spacing: 14) {
            if let notice = call.callNotice {
                Text(notice)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.85))
            }
            if let error = call.error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Brand.dnd)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            HStack(spacing: 16) {
                glassButton(call.micMuted ? "mic.slash.fill" : "mic.fill",
                            on: call.micMuted, label: "Mute") { call.toggleMic() }
                glassButton(call.deafened ? "speaker.slash.fill" : "headphones",
                            on: call.deafened, label: "Deafen") { call.toggleDeafen() }
                glassButton(call.cameraEnabled ? "video.fill" : "video.slash.fill",
                            on: call.cameraEnabled, label: "Camera") { call.toggleCamera() }
                glassButton("bubble.left.fill", on: false, label: "Chat") {
                    // Opening the chat means leaving the call screen up but out
                    // of the way, which is exactly what minimising does.
                    call.minimized = true
                }
                Button {
                    Task { await call.endCall() }
                } label: {
                    Image(systemName: "phone.down.fill")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 62, height: 62)
                        .background(Brand.danger, in: .circle)
                }
                .accessibilityLabel("End call")
            }
        }
        .frame(maxWidth: .infinity)
        .background {
            LinearGradient(colors: [.clear, .black.opacity(0.55)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
    }

    private func glassButton(_ icon: String, on: Bool, label: String,
                             action: @escaping () -> Void) -> some View {
        Button {
            action()
            showControls()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(on ? .black : .white)
                .frame(width: 56, height: 56)
                .background(on ? AnyShapeStyle(.white) : AnyShapeStyle(.ultraThinMaterial),
                            in: .circle)
        }
        .accessibilityLabel(label)
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
/// not trap you on one screen.
struct MinimisedCallBar: View {
    let call: CallManager

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "phone.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)

            VStack(alignment: .leading, spacing: 1) {
                Text(call.activePeer?.name ?? "In call")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if call.phase == .active, let connectedAt = call.connectedAt {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Text(formatElapsed(connectedAt, at: context.date))
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.white.opacity(0.8))
                    }
                } else {
                    Text("Calling\u{2026}")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.8))
                }
            }

            Spacer(minLength: 8)

            Button { call.toggleMic() } label: {
                Image(systemName: call.micMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(.white.opacity(call.micMuted ? 0.28 : 0.12), in: .circle)
            }
            .accessibilityLabel(call.micMuted ? "Unmute" : "Mute")

            Button { Task { await call.endCall() } } label: {
                Image(systemName: "phone.down.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(Brand.danger, in: .circle)
            }
            .accessibilityLabel("End call")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Brand.online.opacity(0.9), in: .capsule)
        .overlay(Capsule().stroke(.white.opacity(0.15), lineWidth: 1))
        .shadow(color: .black.opacity(0.3), radius: 10, y: 4)
        .padding(.horizontal, 12)
        // Tapping the pill (but not its buttons) returns to the call.
        .onTapGesture { call.minimized = false }
    }
}
