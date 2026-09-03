import AVFoundation
import SwiftUI
import WebRTC

/* ------------------------------------------------------------------ */
/*  Video renderers                                                    */
/* ------------------------------------------------------------------ */

/// Renders the remote peer's WebRTC video track (Metal-backed).
struct RemoteCallVideoView: UIViewRepresentable {
    let track: RTCVideoTrack?

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.videoContentMode = .scaleAspectFill
        if let track { track.add(view) }
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        if let track { track.add(uiView) }
    }
}

/// Shows the local camera preview while a call is active.
struct LocalCallVideoView: UIViewRepresentable {
    let session: AVCaptureSession?

    func makeUIView(context: Context) -> RTCCameraPreviewView {
        let view = RTCCameraPreviewView(frame: .zero)
        view.captureSession = session
        return view
    }

    func updateUIView(_ uiView: RTCCameraPreviewView, context: Context) {
        uiView.captureSession = session
    }
}

/// MM:SS (or H:MM:SS) elapsed timer, matching the desktop panel.
func formatElapsed(_ start: Date, at now: Date = .now) -> String {
    let total = max(0, Int(now.timeIntervalSince(start)))
    let h = total / 3600
    let m = (total % 3600) / 60
    let s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
}

/* ------------------------------------------------------------------ */
/*  Incoming call overlay                                              */
/* ------------------------------------------------------------------ */

/// Full-screen overlay shown while a call is ringing in.
///
/// Answering is a swipe rather than a tap: a ringing phone is picked up in a
/// hurry, often without looking, and a 64pt target next to an identical one
/// that hangs up is easy to hit wrongly. Dragging the knob commits to a
/// direction before anything happens, and the gesture can be abandoned by
/// letting go anywhere short of the ends.
struct IncomingCallOverlay: View {
    let call: CallManager

    @State private var pulse = false
    @State private var reveal: Reveal?
    @State private var revealProgress: CGFloat = 0
    @State private var revealOpacity: Double = 1

    /// The circle that opens out of the button the finger was on.
    private struct Reveal: Equatable {
        enum Kind { case answer, decline }
        let kind: Kind
        let origin: CGPoint
    }

    /// Long enough to read as a transition rather than a cut, short enough
    /// that it never delays picking up a call.
    private static let revealDuration: Double = 0.42
    private static let fadeDuration: Double = 0.22

    var body: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                Text("INCOMING VOICE CALL")
                    .font(.caption.weight(.heavy))
                    .tracking(2)
                    .foregroundStyle(Brand.textMuted)
                    .padding(.bottom, 28)

                ZStack {
                    Circle()
                        .fill(Brand.accent.opacity(0.2))
                        .frame(width: 150, height: 150)
                        .scaleEffect(pulse ? 1.4 : 1.0)
                        .opacity(pulse ? 0 : 0.8)
                    if let profile = call.incoming?.profile {
                        AvatarView(url: profile.avatarUrl, name: profile.name, size: 108)
                    } else {
                        Circle()
                            .fill(Brand.accent)
                            .frame(width: 108, height: 108)
                            .overlay(
                                Text(call.incoming?.callerName.prefix(1).uppercased() ?? "?")
                                    .font(.system(size: 44, weight: .bold))
                                    .foregroundStyle(.white)
                            )
                    }
                }
                .padding(.bottom, 28)

                Text(call.incoming?.callerName ?? "Someone")
                    .font(.title2.bold())
                    .foregroundStyle(Brand.textPrimary)
                Text("is calling you...")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textMuted)
                    .padding(.top, 6)

                Spacer()

                SwipeToAnswerControl(
                    onDecline: { origin in begin(.init(kind: .decline, origin: origin)) },
                    onAnswer: { origin in begin(.init(kind: .answer, origin: origin)) }
                )
                .padding(.bottom, 56)
                // The reveal covers the screen from here on; leaving the
                // control live would let a second gesture land mid-animation.
                .disabled(reveal != nil)
            }

            revealLayer
        }
        .onAppear {
            pulse = true
            dismissKeyboard()
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) {
                pulse = false
            }
        }
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                        to: nil, from: nil, for: nil)
    }

    // MARK: - Circular reveal

    @ViewBuilder private var revealLayer: some View {
        if let reveal {
            GeometryReader { geo in
                let diameter = 2 * maxRadius(from: reveal.origin, in: geo.size) * revealProgress

                Group {
                    switch reveal.kind {
                    case .answer:
                        // The same backdrop the call screen is about to draw,
                        // so the circle opens directly onto it rather than
                        // onto a placeholder that then swaps.
                        BlurredAvatarBackdrop(url: call.incoming?.profile?.avatarUrl,
                                              name: call.incoming?.callerName ?? "Disband")
                    case .decline:
                        Brand.dnd
                    }
                }
                .mask {
                    Circle()
                        .frame(width: diameter, height: diameter)
                        .position(reveal.origin)
                }
            }
            .ignoresSafeArea()
            .opacity(revealOpacity)
            .allowsHitTesting(false)
            .transition(.identity)
        }
    }

    /// Radius that reaches the farthest corner, so the circle always finishes
    /// covering the screen no matter which button it started from.
    private func maxRadius(from origin: CGPoint, in size: CGSize) -> CGFloat {
        let dx = max(origin.x, size.width - origin.x)
        let dy = max(origin.y, size.height - origin.y)
        return (dx * dx + dy * dy).squareRoot()
    }

    private func begin(_ next: Reveal) {
        guard reveal == nil else { return }
        reveal = next
        revealProgress = 0
        revealOpacity = 1

        withAnimation(.easeOut(duration: Self.revealDuration)) {
            revealProgress = 1
        }

        Task {
            try? await Task.sleep(for: .seconds(Self.revealDuration))
            switch next.kind {
            case .answer:
                // Accept once the screen is covered: the call view appears
                // underneath the circle, so the two never cross-fade.
                await call.acceptCall()
            case .decline:
                withAnimation(.easeIn(duration: Self.fadeDuration)) { revealOpacity = 0 }
                try? await Task.sleep(for: .seconds(Self.fadeDuration))
                await call.rejectCall()
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Swipe-to-answer control                                            */
/* ------------------------------------------------------------------ */

/// Decline on the left, answer on the right, and a knob between them that is
/// dragged toward one of the two.
///
/// Both ends stay tappable. The swipe is the safeguard against a mis-hit, not
/// a hoop to jump through, and someone who has already looked at the screen
/// should not have to drag.
struct SwipeToAnswerControl: View {
    var onDecline: (CGPoint) -> Void
    var onAnswer: (CGPoint) -> Void

    @State private var drag: CGFloat = 0
    @State private var dragging = false

    private let trackHeight: CGFloat = 84
    private let knob: CGFloat = 64
    private let endButton: CGFloat = 62
    private let padding: CGFloat = 10

    /// How far the knob travels before either end commits.
    private var travel: CGFloat { 104 }

    /// Committing at 78% leaves room to change your mind, while not demanding
    /// the finger land exactly on the target.
    private var threshold: CGFloat { travel * 0.78 }

    private var progress: CGFloat { min(1, abs(drag) / threshold) }

    var body: some View {
        ZStack {
            // The gray bed that visually connects decline, knob and answer.
            Capsule()
                .fill(.white.opacity(0.12))
                .frame(height: trackHeight)
                .overlay(Capsule().stroke(.white.opacity(0.08), lineWidth: 1))

            HStack {
                endCap(icon: "phone.down.fill",
                       tint: Brand.dnd,
                       active: drag < 0,
                       action: onDecline)
                Spacer()
                endCap(icon: "phone.fill",
                       tint: Brand.online,
                       active: drag > 0,
                       action: onAnswer)
            }
            .padding(.horizontal, padding)

            knobView
        }
        .frame(width: travel * 2 + knob + padding * 2, height: trackHeight)
        .accessibilityElement(children: .contain)
    }

    private func endCap(icon: String, tint: Color, active: Bool,
                        action: @escaping (CGPoint) -> Void) -> some View {
        GeometryReader { geo in
            Button {
                action(CGPoint(x: geo.frame(in: .global).midX,
                               y: geo.frame(in: .global).midY))
            } label: {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: endButton, height: endButton)
                    .background(tint.opacity(active ? 1 : 0.85), in: Circle())
                    // Brightens as the knob approaches, so the committed
                    // direction is obvious before letting go.
                    .scaleEffect(active ? 1 + progress * 0.12 : 1)
                    .shadow(color: tint.opacity(0.45), radius: active ? 14 : 8)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(icon == "phone.fill" ? "Answer" : "Decline")
        }
        .frame(width: endButton, height: endButton)
    }

    private var knobView: some View {
        GeometryReader { geo in
            let centre = CGPoint(x: geo.frame(in: .global).midX,
                                 y: geo.frame(in: .global).midY)
            Circle()
                .fill(.white)
                .frame(width: knob, height: knob)
                .shadow(color: .black.opacity(0.35), radius: dragging ? 16 : 8, y: 3)
                .overlay {
                    Image(systemName: "chevron.left.chevron.right")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.black.opacity(0.35))
                        .opacity(dragging ? 0 : 1)
                }
                .scaleEffect(dragging ? 1.06 : 1)
                .offset(x: drag)
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            dragging = true
                            // Clamped so the knob cannot be flung past the
                            // ends and lose its relationship to the targets.
                            drag = max(-travel, min(travel, value.translation.width))
                        }
                        .onEnded { _ in
                            dragging = false
                            let landed = CGPoint(x: centre.x + drag, y: centre.y)
                            if drag >= threshold {
                                onAnswer(landed)
                            } else if drag <= -threshold {
                                onDecline(landed)
                            } else {
                                withAnimation(.spring(response: 0.32, dampingFraction: 0.7)) {
                                    drag = 0
                                }
                            }
                        }
                )
                .animation(.spring(response: 0.25, dampingFraction: 0.8), value: dragging)
        }
        .frame(width: knob, height: knob)
    }
}
