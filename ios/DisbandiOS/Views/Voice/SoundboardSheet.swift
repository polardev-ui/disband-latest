import Supabase
import SwiftUI

/// A space's soundboard (`server_sounds`), as the web's `Soundboard.tsx`:
/// tap a clip and everyone in the voice channel hears it. The room's own
/// space comes first, then your other spaces' sounds.
struct SoundboardSheet: View {
    @Environment(VoiceSession.self) private var voice
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var sounds: [Sound]?
    @State private var serverNames: [String: String] = [:]

    struct Sound: Decodable, Identifiable, Hashable {
        let id: String
        let serverId: String
        let name: String
        let emoji: String?
        let url: String
        enum CodingKeys: String, CodingKey {
            case id, name, emoji, url
            case serverId = "server_id"
        }
    }

    private var groups: [(serverId: String, sounds: [Sound])] {
        let all = sounds ?? []
        let ids = Array(Set(all.map(\.serverId))).sorted { a, b in
            if a == voice.soundboardServerId { return true }
            if b == voice.soundboardServerId { return false }
            return (serverNames[a] ?? "") < (serverNames[b] ?? "")
        }
        return ids.map { id in (id, all.filter { $0.serverId == id }) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if sounds == nil {
                    StateView(kind: .loading)
                } else if sounds?.isEmpty == true {
                    StateView(kind: .empty, title: "None of your spaces has any sounds yet.",
                              systemImage: "speaker.wave.2")
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            ForEach(groups, id: \.serverId) { group in
                                VStack(alignment: .leading, spacing: 8) {
                                    DSCaption(text: serverNames[group.serverId] ?? "Space sounds")
                                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                                        ForEach(group.sounds) { sound in
                                            Button {
                                                Haptics.tap()
                                                voice.playSoundboard(sound.url)
                                            } label: {
                                                HStack(spacing: 6) {
                                                    Text(sound.emoji ?? "🔊").font(.system(size: 18))
                                                    Text(sound.name)
                                                        .font(.system(size: 13, weight: .medium))
                                                        .foregroundStyle(Brand.textPrimary)
                                                        .lineLimit(1)
                                                    Spacer(minLength: 0)
                                                }
                                                .padding(.horizontal, 10)
                                                .frame(height: 40)
                                                .background(Brand.elevated, in: .rect(cornerRadius: 10))
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .background(Brand.surface)
            .navigationTitle("Soundboard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .task { await load() }
    }

    private func load() async {
        guard let uid = app.currentUserId,
              let servers = try? await DatabaseService.myServers(currentUserId: uid) else {
            sounds = []
            return
        }
        for s in servers { serverNames[s.id] = s.name }
        let ids = servers.map(\.id)
        guard !ids.isEmpty else { sounds = []; return }
        let rows: [Sound]? = try? await SupabaseManager.client.from("server_sounds")
            .select("id, server_id, name, emoji, url").in("server_id", values: ids)
            .order("created_at", ascending: false).limit(200).execute().value
        sounds = (rows ?? []).filter { VoiceSession.isSoundboardURL($0.url) }
    }
}
