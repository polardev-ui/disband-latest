import SwiftUI

extension Notification.Name {
    /// Posted after you show or hide one of your badges, so badge rows that
    /// are already on screen reload.
    static let ownBadgesChanged = Notification.Name("disband.ownBadgesChanged")
}

/// Choose which of your badges appear beside your name. Hiding one only takes
/// it off your profile; you keep it and can show it again any time.
struct BadgeSettingsView: View {
    @Environment(AppState.self) private var app

    @State private var badges: [(badge: AwardedBadge, visible: Bool)] = []
    @State private var loading = true
    @State private var busyKey: String?
    @State private var error: String?

    var body: some View {
        List {
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
                    .listRowBackground(Color.clear)
            } else if badges.isEmpty {
                Section {
                    Text("You don't have any badges yet.")
                        .foregroundStyle(Brand.textMuted)
                } footer: {
                    Link("See every badge and how to get it", destination: AppConfig.webAppURL.appendingPathComponent("badges"))
                }
            } else {
                Section {
                    ForEach(badges, id: \.badge.id) { entry in
                        Toggle(isOn: binding(for: entry.badge.def.key)) {
                            HStack(spacing: 12) {
                                BadgeIcon(key: entry.badge.def.key, color: entry.badge.def.color, size: 28)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.badge.def.name)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Brand.textPrimary)
                                    Text(entry.badge.def.description)
                                        .font(.caption)
                                        .foregroundStyle(Brand.textMuted)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        .disabled(busyKey == entry.badge.def.key)
                        .listRowBackground(Brand.surface)
                    }
                } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Hidden badges stay yours. Turn them back on whenever you like.")
                        Link("See every badge and how to get it", destination: AppConfig.webAppURL.appendingPathComponent("badges"))
                    }
                }
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(Brand.dnd)
                    .listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Badges")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let uid = app.currentUserId else { return }
        badges = await BadgeService.shared.ownBadges(uid)
        loading = false
    }

    private func binding(for key: String) -> Binding<Bool> {
        Binding(
            get: { badges.first { $0.badge.def.key == key }?.visible ?? true },
            set: { value in Task { await set(key, visible: value) } }
        )
    }

    private func set(_ key: String, visible: Bool) async {
        guard let uid = app.currentUserId,
              let index = badges.firstIndex(where: { $0.badge.def.key == key }) else { return }
        let previous = badges[index].visible
        badges[index].visible = visible
        busyKey = key
        error = nil
        if await BadgeService.shared.setVisible(uid, key: key, visible: visible) {
            NotificationCenter.default.post(name: .ownBadgesChanged, object: nil)
        } else {
            badges[index].visible = previous
            error = "Couldn't update that badge. Try again."
        }
        busyKey = nil
    }
}
