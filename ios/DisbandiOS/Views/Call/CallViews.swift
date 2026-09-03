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
