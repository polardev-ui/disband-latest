import Supabase
import SwiftUI

/**
 A space's notification settings, the web's `SpaceNotificationsModal`
 (migration 0230): mute for a while or until turned back on, what to be
 notified about, and whether @everyone counts. Saved through
 `set_server_notification_settings`, and enforced by the server, so a muted
 space is quiet (no pushes, no unread dots) on every device.
 */
struct SpaceNotificationsSheet: View {
    let server: Server

    @Environment(\.dismiss) private var dismiss
    @State private var settings = Settings()
    @State private var loaded = false
    @State private var error: String?

    struct Settings: Codable, Equatable {
        var level = "mentions"
        var suppressEveryone = false
        var mutedUntil: String?
        enum CodingKeys: String, CodingKey {
            case level
            case suppressEveryone = "suppress_everyone"
            case mutedUntil = "muted_until"
        }

        var isMuted: Bool {
            guard let mutedUntil, let date = RelativeTime.date(from: mutedUntil) else {
                return mutedUntil?.hasPrefix("9999") == true
            }
            return date > Date()
        }
    }

    /// "Until I turn it back on".
    static let forever = "9999-12-31T00:00:00Z"
    private static let muteOptions: [(label: String, minutes: Int?)] = [
        ("For 15 minutes", 15), ("For 1 hour", 60), ("For 8 hours", 480),
        ("For 24 hours", 1440), ("Until I turn it back on", nil),
    ]

    private struct Args: Encodable, Sendable {
        let p_server_id: String
        let p_level: String
        let p_suppress_everyone: Bool
        let p_muted_until: String?
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(p_server_id, forKey: .p_server_id)
            try c.encode(p_level, forKey: .p_level)
            try c.encode(p_suppress_everyone, forKey: .p_suppress_everyone)
            try c.encode(p_muted_until, forKey: .p_muted_until)
        }
        enum CodingKeys: String, CodingKey { case p_server_id, p_level, p_suppress_everyone, p_muted_until }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if settings.isMuted {
                        HStack {
                            Label(mutedText, systemImage: "bell.slash.fill").foregroundStyle(Brand.textPrimary)
                            Spacer()
                            Button("Unmute") { save { $0.mutedUntil = nil } }
                        }
                        .listRowBackground(Brand.surface)
                    } else {
                        Menu {
                            ForEach(Self.muteOptions, id: \.label) { option in
                                Button(option.label) {
                                    let until = option.minutes.map {
                                        ISO8601DateFormatter().string(from: Date().addingTimeInterval(Double($0) * 60))
                                    } ?? Self.forever
                                    save { $0.mutedUntil = until }
                                }
                            }
                        } label: {
                            Label("Mute \(server.name)", systemImage: "bell.slash")
                        }
                        .disabled(!loaded)
                        .listRowBackground(Brand.surface)
                    }
                } footer: {
                    Text("A muted space sends no notifications and shows no unread dots.")
                }

                Section("Notify me about") {
                    level("all", "Everything", "Every message in channels you can see, plus all pings.")
                    level("mentions", "Only @mentions", "Pings for you, your roles and @everyone.")
                    level("nothing", "Nothing", "No notifications from this space.")
                }
                .disabled(settings.isMuted || !loaded)

                Section {
                    Toggle(isOn: Binding(get: { settings.suppressEveryone },
                                         set: { value in save { $0.suppressEveryone = value } })) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Suppress @everyone")
                            Text("Ignore @everyone pings in this space.").font(.caption).foregroundStyle(Brand.textMuted)
                        }
                    }
                    .listRowBackground(Brand.surface)
                }
                .disabled(settings.isMuted || settings.level == "nothing" || !loaded)

                if let error {
                    Text(error).font(.footnote).foregroundStyle(Brand.dnd).listRowBackground(Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Notification Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .task { await load() }
    }

    private var mutedText: String {
        guard let until = settings.mutedUntil, !until.hasPrefix("9999"),
              let date = RelativeTime.date(from: until) else { return "Muted" }
        return "Muted until \(date.formatted(date: .abbreviated, time: .shortened))"
    }

    private func level(_ value: String, _ title: String, _ detail: String) -> some View {
        Button { save { $0.level = value } } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: settings.level == value ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(settings.level == value ? Brand.accent : Brand.textMuted)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(Brand.textPrimary)
                    Text(detail).font(.caption).foregroundStyle(Brand.textMuted)
                }
            }
        }
        .listRowBackground(Brand.surface)
    }

    private func load() async {
        let rows: [Settings]? = try? await SupabaseManager.client.from("server_notification_settings")
            .select("level, suppress_everyone, muted_until").eq("server_id", value: server.id)
            .limit(1).execute().value
        settings = rows?.first ?? Settings()
        loaded = true
    }

    private func save(_ change: (inout Settings) -> Void) {
        let previous = settings
        var next = settings
        change(&next)
        settings = next
        error = nil
        Task {
            do {
                try await SupabaseManager.client.rpc("set_server_notification_settings", params: Args(
                    p_server_id: server.id, p_level: next.level,
                    p_suppress_everyone: next.suppressEveryone, p_muted_until: next.mutedUntil
                )).execute()
                // A muted space drops out of the unread dots and pings.
                ChannelUnreadStore.shared.refreshSoon()
            } catch {
                settings = previous
                self.error = "Couldn't save that. Try again."
            }
        }
    }
}
