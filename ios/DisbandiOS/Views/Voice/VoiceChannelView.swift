import SwiftUI

/// Voice channel screen. Live presence (who's connected) works today via the
/// `voice_presence` table; real-time audio streaming is the next phase (WebRTC).
struct VoiceChannelView: View {
    let channel: Channel
    @Environment(AppState.self) private var app

    @State private var participants: [VoiceParticipant] = []
    @State private var joined = false
    @State private var muted = false
    @State private var loading = true
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 24) {
            if loading {
                StateView(kind: .loading)
            } else {
                header
                participantGrid
                Spacer()
                controls
            }
        }
        .padding()
        .background(Brand.background)
        .navigationTitle(channel.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await start() }
        .onDisappear { stop() }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "speaker.wave.2.fill")
                .font(.system(size: 40)).foregroundStyle(Brand.accent)
            Text(channel.name).font(.title2.bold()).foregroundStyle(Brand.textPrimary)
            Text(participants.isEmpty ? "No one's here yet" : "\(participants.count) connected")
                .font(.subheadline).foregroundStyle(Brand.textMuted)
        }
        .padding(.top, 24)
    }

    private var participantGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96))], spacing: 20) {
            ForEach(participants) { p in
                VStack(spacing: 8) {
                    AvatarView(url: p.profile?.avatarUrl, name: p.profile?.name ?? "?", size: 72)
                        .overlay(RoundedRectangle(cornerRadius: 40).stroke(Brand.online, lineWidth: 3))
                    Text(p.profile?.name ?? "Unknown")
                        .font(.caption).foregroundStyle(Brand.textSecondary).lineLimit(1)
                }
            }
        }
        .padding(.top, 12)
    }

    private var controls: some View {
        VStack(spacing: 12) {
            if !joined {
                Button { Task { await join() } } label: {
                    Label("Join Voice", systemImage: "phone.fill")
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(Brand.online, in: .rect(cornerRadius: 14)).foregroundStyle(.white)
                }
            } else {
                HStack(spacing: 16) {
                    Button { muted.toggle() } label: {
                        Image(systemName: muted ? "mic.slash.fill" : "mic.fill")
                            .font(.title2).frame(width: 60, height: 60)
                            .background(muted ? Brand.dnd : Brand.elevated, in: .circle)
                            .foregroundStyle(.white)
                    }
                    Button { Task { await leave() } } label: {
                        Image(systemName: "phone.down.fill")
                            .font(.title2).frame(width: 60, height: 60)
                            .background(Brand.dnd, in: .circle).foregroundStyle(.white)
                    }
                }
                Text("🎙️ Live audio is coming soon — you're shown as connected to others now.")
                    .font(.caption2).foregroundStyle(Brand.textMuted)
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: - Presence

    private func start() async {
        await refresh()
        loading = false
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                await refresh()
            }
        }
    }

    private func stop() {
        pollTask?.cancel()
        if joined, let uid = app.currentUserId {
            Task { try? await DatabaseService.leaveVoice(channelId: channel.id, userId: uid) }
        }
    }

    private func refresh() async {
        participants = (try? await DatabaseService.voiceParticipants(channelId: channel.id)) ?? []
        if let uid = app.currentUserId {
            joined = participants.contains { $0.userId == uid }
        }
    }

    private func join() async {
        guard let uid = app.currentUserId else { return }
        try? await DatabaseService.joinVoice(channelId: channel.id, userId: uid)
        await refresh()
    }

    private func leave() async {
        guard let uid = app.currentUserId else { return }
        try? await DatabaseService.leaveVoice(channelId: channel.id, userId: uid)
        await refresh()
    }
}
