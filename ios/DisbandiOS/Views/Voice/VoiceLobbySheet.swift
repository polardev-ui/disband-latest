import SwiftUI

/// Peek into a voice channel before you're heard in it: who's there, and one
/// big button to join. Muting first is a tap away, so nobody hears you arrive.
struct VoiceLobbySheet: View {
    let room: VoiceRoom
    var initialMembers: [VoiceMember] = []

    @Environment(VoiceSession.self) private var voice
    @Environment(\.dismiss) private var dismiss
    @State private var members: [VoiceMember] = []
    @State private var joinMuted = false
    @State private var joining = false

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 14) {
                AvatarCluster(members: members, size: 64)
                    .frame(height: 104)
                    .padding(.top, 28)

                VStack(spacing: 4) {
                    Text(room.title)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(Brand.textPrimary)
                    Text(summary)
                        .font(.subheadline)
                        .foregroundStyle(Brand.textMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 24)
            }

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(members) { member in
                        HStack(spacing: 12) {
                            AvatarView(url: member.profile?.avatarUrl, name: member.name, size: 36)
                            Text(member.name)
                                .font(.body.weight(.medium))
                                .foregroundStyle(Brand.textPrimary)
                            Spacer()
                            if member.deafened {
                                Image(systemName: "headphones.slash").foregroundStyle(Brand.dnd)
                            } else if member.muted {
                                Image(systemName: "mic.slash.fill").foregroundStyle(Brand.textMuted)
                            }
                        }
                        .padding(.vertical, 10)
                        if member.id != members.last?.id {
                            Divider().overlay(Brand.divider)
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 18)
            }

            controls
        }
        .background(Brand.surface.ignoresSafeArea())
        .onAppear { members = initialMembers }
        .task { await poll() }
    }

    private var summary: String {
        switch members.count {
        case 0: return "No one's here yet — be the first."
        case 1: return "\(members[0].name) is hanging out"
        case 2: return "\(members[0].name) and \(members[1].name)"
        default: return "\(members[0].name), \(members[1].name) and \(members.count - 2) other\(members.count == 3 ? "" : "s")"
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button {
                joinMuted.toggle()
                UISelectionFeedbackGenerator().selectionChanged()
            } label: {
                Image(systemName: joinMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(joinMuted ? Color.white : Brand.textPrimary)
                    .frame(width: 58, height: 58)
                    .background(joinMuted ? Brand.dnd : Brand.elevated, in: Circle())
            }
            .accessibilityLabel(joinMuted ? "Join muted" : "Join unmuted")

            Button {
                joining = true
                Task {
                    if joinMuted != voice.micMuted { voice.toggleMute() }
                    await voice.join(room)
                    joining = false
                    if voice.isIn(room.id) { dismiss() }
                }
            } label: {
                HStack(spacing: 8) {
                    if joining {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "waveform")
                    }
                    Text(joining ? "Joining…" : "Join Voice")
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 58)
                .background(Brand.online.gradient, in: Capsule())
            }
            .disabled(joining)
        }
        .padding(16)
        .background(.ultraThinMaterial)
    }

    private func poll() async {
        while !Task.isCancelled {
            if let loaded = try? await VoiceSession.fetchMembers(of: room) { members = loaded }
            try? await Task.sleep(nanoseconds: 4_000_000_000)
        }
    }
}

/// Up to four faces in an overlapping cluster, or a speaker glyph when empty.
struct AvatarCluster: View {
    let members: [VoiceMember]
    var size: CGFloat = 56

    var body: some View {
        let shown = Array(members.prefix(4))
        ZStack {
            if shown.isEmpty {
                Image(systemName: "speaker.wave.2.fill")
                    .font(.system(size: size * 0.5, weight: .semibold))
                    .foregroundStyle(Brand.accent)
                    .frame(width: size * 1.5, height: size * 1.5)
                    .background(Brand.accent.opacity(0.15), in: Circle())
            } else {
                ForEach(Array(shown.enumerated()), id: \.element.id) { index, member in
                    AvatarView(url: member.profile?.avatarUrl, name: member.name,
                               size: index == 0 ? size : size * 0.72)
                        .overlay(Circle().stroke(Brand.surface, lineWidth: 4))
                        .offset(Self.offsets[shown.count - 1][index].applying(
                            CGAffineTransform(scaleX: size / 64, y: size / 64)))
                }
            }
        }
    }

    /// Hand-placed so a cluster of any size reads as a group, not a row.
    private static let offsets: [[CGSize]] = [
        [CGSize(width: 0, height: 0)],
        [CGSize(width: -18, height: -6), CGSize(width: 26, height: 14)],
        [CGSize(width: -14, height: -12), CGSize(width: 32, height: -18), CGSize(width: 22, height: 30)],
        [CGSize(width: -16, height: -12), CGSize(width: 34, height: -22),
         CGSize(width: -30, height: 32), CGSize(width: 28, height: 30)],
    ]
}

private extension CGSize {
    func applying(_ t: CGAffineTransform) -> CGSize {
        CGSize(width: width * t.a, height: height * t.d)
    }
}
