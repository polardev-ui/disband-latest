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

/* ------------------------------------------------------------------ */
/*  Participant circle                                                 */
/* ------------------------------------------------------------------ */

/// A circular participant tile: avatar by default, live video when available.
struct ParticipantCircleView: View {
    let profile: Profile?
    let label: String
    var isSelf = false
    var ring = false
    var videoTrack: RTCVideoTrack?
    var previewSession: AVCaptureSession?
    var size: CGFloat = 96

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(Brand.surface)
                if isSelf, let previewSession {
                    LocalCallVideoView(session: previewSession)
                        .clipShape(Circle())
                } else if !isSelf, let videoTrack {
                    RemoteCallVideoView(track: videoTrack)
                        .clipShape(Circle())
                        .id(videoTrack)
                } else if let profile {
                    AvatarView(url: profile.avatarUrl, name: profile.name, size: size)
                } else {
                    Text(label.prefix(1).uppercased())
                        .font(.system(size: size * 0.4, weight: .bold))
                        .foregroundStyle(Brand.textMuted)
                }
            }
            .frame(width: size, height: size)
            .overlay {
                Circle().strokeBorder(
                    ring ? Brand.online : Color.white.opacity(0.15),
                    lineWidth: 3
                )
            }
            .shadow(color: ring ? Brand.online.opacity(0.35) : .clear, radius: 14)
            Text(label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Brand.textPrimary)
                .lineLimit(1)
        }
        .frame(maxWidth: size + 20)
    }
}

/* ------------------------------------------------------------------ */
/*  Controls                                                           */
/* ------------------------------------------------------------------ */

struct CallControlButton: View {
    let icon: String
    let title: String
    var active = false
    var danger = false
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .frame(width: 56, height: 56)
                .background(background, in: Circle())
                .foregroundStyle(.white)
                .shadow(color: danger ? Brand.dnd.opacity(0.4) : .clear, radius: 8)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }

    private var background: Color {
        if danger { return Brand.dnd }
        if active { return Brand.dnd.opacity(0.25) }
        return Brand.elevated
    }
}

struct CallControlsRow: View {
    let call: CallManager

    var body: some View {
        HStack(spacing: 20) {
            CallControlButton(icon: call.micMuted ? "mic.slash.fill" : "mic.fill",
                              title: call.micMuted ? "Unmute" : "Mute",
                              active: call.micMuted) {
                call.toggleMic()
            }
            ZStack {
                CallControlButton(icon: "headphones",
                                 title: call.deafened ? "Undeafen" : "Deafen",
                                 active: call.deafened) {
                    call.toggleDeafen()
                }
                if call.deafened {
                    Rectangle()
                        .fill(Brand.dnd)
                        .frame(width: 40, height: 3)
                        .rotationEffect(.degrees(-45))
                }
            }
            CallControlButton(icon: call.cameraEnabled ? "video.fill" : "video.slash.fill",
                              title: call.cameraEnabled ? "Stop video" : "Start video",
                              active: call.cameraEnabled) {
                call.toggleCamera()
            }
            CallControlButton(icon: "phone.down.fill", title: "End call", danger: true) {
                Task { await call.endCall() }
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Active / outgoing call screen                                      */
/* ------------------------------------------------------------------ */

/// Full-screen call screen for the `outgoing` and `active` phases.
struct ActiveCallView: View {
    @Environment(AppState.self) private var app
    let call: CallManager

    var body: some View {
        ZStack {
            Brand.background.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                    .padding(.top, 24)
                Spacer()
                participants
                Spacer()
                if let callNotice = call.callNotice {
                    Text(callNotice)
                        .font(.subheadline)
                        .foregroundStyle(Brand.textSecondary)
                        .padding(.bottom, 16)
                }
                if let error = call.error {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Brand.dnd)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 16)
                }
                CallControlsRow(call: call)
                    .padding(.bottom, 40)
            }
        }
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text(call.phase == .outgoing ? "CALLING" : "VOICE CONNECTED")
                .font(.caption.weight(.heavy))
                .tracking(2)
                .foregroundStyle(Brand.textMuted)
            if call.phase == .active, let connectedAt = call.connectedAt {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(formatElapsed(connectedAt, at: context.date))
                        .font(.footnote)
                        .foregroundStyle(Brand.textMuted)
                }
            } else {
                Text("Ringing...")
                    .font(.footnote)
                    .foregroundStyle(Brand.textMuted)
            }
        }
    }

    private var participants: some View {
        HStack(spacing: 28) {
            ParticipantCircleView(profile: app.profile,
                                  label: "You",
                                  isSelf: true,
                                  previewSession: call.cameraEnabled ? call.engine?.captureSession : nil)
            ParticipantCircleView(profile: call.activePeer,
                                  label: call.activePeer?.name ?? "Peer",
                                  ring: call.phase == .outgoing,
                                  videoTrack: call.remoteHasVideo ? call.engine?.remoteVideoTrack : nil)
        }
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
struct IncomingCallOverlay: View {
    let call: CallManager

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
                HStack(spacing: 48) {
                    Button {
                        Task { await call.rejectCall() }
                    } label: {
                        Image(systemName: "phone.down.fill")
                            .font(.title2)
                            .frame(width: 64, height: 64)
                            .background(Brand.dnd, in: Circle())
                            .foregroundStyle(.white)
                            .shadow(color: Brand.dnd.opacity(0.4), radius: 10)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Decline")

                    Button {
                        Task { await call.acceptCall() }
                    } label: {
                        Image(systemName: "phone.fill")
                            .font(.title2)
                            .frame(width: 64, height: 64)
                            .background(Brand.online, in: Circle())
                            .foregroundStyle(.white)
                            .shadow(color: Brand.online.opacity(0.4), radius: 10)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Accept")
                }
                .padding(.bottom, 56)
            }
        }
        .onAppear {
            pulse = true
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) {
                pulse = false
            }
        }
    }

    @State private var pulse = false
}
