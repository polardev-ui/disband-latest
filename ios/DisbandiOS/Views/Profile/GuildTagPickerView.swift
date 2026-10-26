import SwiftUI

/// Profile → Guild tag. Wearing is free and needs only membership; creating
/// or editing a tag is the space-side perk, so this list contains only spaces
/// whose tag is already available to the signed-in member.
struct GuildTagPickerView: View {
    @Environment(AppState.self) private var app
    @State private var options: [GuildTagOption] = []
    @State private var loading = true
    @State private var error: String?
    @State private var busy: String?

    var body: some View {
        Group {
            if loading && options.isEmpty {
                ProgressView().tint(Brand.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    if options.isEmpty {
                        Section {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("You're not in a space with a guild tag yet.")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Brand.textPrimary)
                                Text("Space owners can create one from Space settings → Guild tag once the space reaches Catalyst Level 3. Then anyone in the space can wear it here.")
                                    .font(.footnote)
                                    .foregroundStyle(Brand.textMuted)
                            }
                            .padding(.vertical, 6)
                        }
                        .listRowBackground(Brand.surface)
                    } else {
                        Section {
                            ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                                if index > 0 { SettingsDivider().padding(.leading, 8) }
                                row(option)
                            }
                        } footer: {
                            Text("You can wear one tag at a time. Wearing is always free; spaces need Catalyst Level 3 to create a tag.")
                        }
                        .listRowBackground(Brand.surface)
                    }

                    if let error {
                        Section {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.footnote)
                                .foregroundStyle(Brand.dnd)
                            Button("Try again") { Task { await load() } }
                                .font(.footnote.weight(.semibold))
                        }
                        .listRowBackground(Brand.surface)
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Brand.background)
        .navigationTitle("Guild tag")
        .navigationBarTitleDisplayMode(.inline)
        .solidNavigationBar()
        .task { await load() }
        .refreshable { await load() }
    }

    private func row(_ option: GuildTagOption) -> some View {
        let isBusy = busy == option.id || (busy == "clear" && option.equipped)
        return HStack(spacing: 12) {
            AvatarView(url: option.serverIconUrl, name: option.serverName, size: 38)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(option.serverName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    GuildTagBadge(tag: option.tag, size: .small)
                }
                Text(option.equipped ? "Wearing this tag" : "Available to wear")
                    .font(.caption)
                    .foregroundStyle(option.equipped ? Brand.online : Brand.textMuted)
            }
            Spacer(minLength: 8)

            if option.equipped {
                Button {
                    Task { await remove(option) }
                } label: {
                    Text(isBusy ? "Removing…" : "Remove")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .frame(height: 30)
                        .background(Brand.elevated, in: Capsule())
                        .foregroundStyle(Brand.textPrimary)
                }
                .buttonStyle(.plain)
                .disabled(busy != nil)
            } else {
                Button {
                    Task { await wear(option) }
                } label: {
                    Text(isBusy ? "Wearing…" : "Wear")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .frame(height: 30)
                        .background(Brand.accent, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .disabled(busy != nil)
            }
        }
        .padding(.vertical, 4)
    }

    private func load() async {
        if options.isEmpty { loading = true }
        do {
            options = try await DatabaseService.myGuildTagOptions()
            error = nil
            if let uid = app.currentUserId {
                if let worn = options.first(where: \.equipped) {
                    GuildTagStore.shared.set(worn.tag, for: uid)
                } else {
                    GuildTagStore.shared.clear(for: uid)
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func wear(_ option: GuildTagOption) async {
        guard busy == nil else { return }
        busy = option.id
        do {
            let tag = try await DatabaseService.equipGuildTag(serverId: option.tag.serverId)
            if let uid = app.currentUserId { GuildTagStore.shared.set(tag, for: uid) }
            options = options.map {
                var copy = $0
                copy.equipped = $0.id == option.id
                return copy
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        busy = nil
    }

    private func remove(_ option: GuildTagOption) async {
        guard busy == nil else { return }
        busy = "clear"
        do {
            try await DatabaseService.clearGuildTag()
            if let uid = app.currentUserId { GuildTagStore.shared.clear(for: uid) }
            options = options.map {
                var copy = $0
                copy.equipped = false
                return copy
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        busy = nil
    }
}
