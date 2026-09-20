import SwiftUI

/// A connected call, minimised: always reachable, never in the way. Tap to
/// return to the stage; mute and leave without opening it.
struct VoicePill: View {
    @Environment(VoiceSession.self) private var voice

    var body: some View {
        HStack(spacing: 10) {
            Button { voice.minimized = false } label: {
                HStack(spacing: 10) {
                    SpeakingPulse(active: !voice.speaking.isEmpty)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(voice.room?.title ?? "Voice")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.textPrimary)
                            .lineLimit(1)
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(Brand.online)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Return to \(voice.room?.title ?? "voice")")

            Button { voice.toggleMute() } label: {
                Image(systemName: voice.micMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(voice.micMuted ? Color.white : Brand.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(voice.micMuted ? Brand.dnd : Brand.elevated, in: Circle())
                    .contentTransition(.symbolEffect(.replace))
            }
            .accessibilityLabel(voice.micMuted ? "Unmute" : "Mute")

            Button { Task { await voice.leave() } } label: {
                Image(systemName: "phone.down.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Brand.dnd, in: Circle())
            }
            .accessibilityLabel("Leave")
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .frame(height: 50)
        .background {
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Brand.surface.opacity(0.6)))
                .overlay(Capsule().strokeBorder(Brand.online.opacity(0.35), lineWidth: 1))
                .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
        }
    }

    private var subtitle: String {
        if voice.phase == .connecting { return "Connecting…" }
        let count = voice.members.count
        return "Voice connected · \(count) \(count == 1 ? "person" : "people")"
    }
}

/// A live dot that breathes while anyone is talking.
struct SpeakingPulse: View {
    var active: Bool
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Brand.online.opacity(0.35))
                .frame(width: 22, height: 22)
                .scaleEffect(active && pulse ? 1.25 : 0.7)
                .opacity(active ? 1 : 0)
            Image(systemName: "waveform")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Brand.online, in: Circle())
                .symbolEffect(.variableColor.iterative, isActive: active)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}
