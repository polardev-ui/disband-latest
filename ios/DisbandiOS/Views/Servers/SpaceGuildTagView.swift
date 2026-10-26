import SwiftUI

/// Space settings → Guild tag. Mirrors the web's `GuildTagSection`: a
/// Catalyst Level 3 gate, then a tag / icon / colour / privacy editor.
struct SpaceGuildTagView: View {
    let server: Server

    @Environment(\.dismiss) private var dismiss
    @State private var existing: GuildTag?
    @State private var tag = ""
    @State private var icon: GuildTagIcon = .star
    @State private var color = "#5865f2"
    @State private var isPrivate = false
    @State private var loading = true
    @State private var saving = false
    @State private var catalystCount = 0
    @State private var error: String?
    @State private var notice: String?
    @State private var removeArmed = false
    @State private var showCatalysts = false

    private let presetColors = ["#5865f2", "#eb459e", "#f23f43", "#f0b232",
                               "#23a55a", "#00a8fc", "#9b59b6", "#e67e22"]

    private var unlocked: Bool { catalystCount >= 6 }
    private var normalizedColor: String { GuildTag.normalizedColor(color) ?? "#5865f2" }

    private var tagProblem: String? { GuildTag.error(tag) }

    private var dirty: Bool {
        if let existing {
            return existing.tag != tag
                || existing.icon != icon
                || existing.color != normalizedColor
                || (existing.isPrivate == true) != isPrivate
        }
        return !tag.isEmpty
    }

    private var previewTag: GuildTag {
        GuildTag(serverId: server.id,
                 tag: GuildTag.sanitize(tag).isEmpty ? "TAG" : GuildTag.sanitize(tag),
                 icon: icon, color: normalizedColor, isPrivate: isPrivate)
    }

    var body: some View {
        Form {
            if !unlocked {
                Section {
                    LevelLockView(count: catalystCount) { showCatalysts = true }
                } header: { Text("Guild tag") }
                .listRowBackground(Brand.surface)
            } else if loading {
                Section { ProgressView() } .listRowBackground(Brand.surface)
            } else {
                Section("Tag design") {
                    HStack {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Tag").font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted)
                            TextField("DISC", text: Binding(
                                get: { tag },
                                set: { tag = GuildTag.sanitize($0) }
                            ))
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .font(.system(.body, design: .monospaced).weight(.semibold))
                            Text("1–4 letters, numbers, dots, underscores or hyphens.")
                                .font(.caption2).foregroundStyle(Brand.textMuted)
                        }
                        Spacer(minLength: 12)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Preview").font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted)
                            HStack(spacing: 8) {
                                Text("polar").font(.subheadline.weight(.medium)).foregroundStyle(Brand.textPrimary)
                                GuildTagBadge(tag: previewTag, size: .small)
                            }
                            .frame(height: 34)
                            .padding(.horizontal, 10)
                            .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 8))
                        }
                    }

                    Text("Icon").font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted).padding(.top, 4)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                        ForEach(GuildTagIcon.allCases) { candidate in
                            Button {
                                icon = candidate
                                notice = nil
                                removeArmed = false
                            } label: {
                                PixelGuildIcon(icon: candidate, color: Color(hexString: normalizedColor) ?? Brand.accent, size: 24)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(candidate == icon ? Brand.accent.opacity(0.16) : Brand.elevated,
                                                in: RoundedRectangle(cornerRadius: 8))
                                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(candidate == icon ? Brand.accent : Color.clear, lineWidth: 2))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(candidate.label)
                        }
                    }

                    Text("Colour").font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted).padding(.top, 4)
                    HStack(spacing: 8) {
                        ForEach(presetColors, id: \.self) { choice in
                            Button {
                                color = choice
                                notice = nil
                                removeArmed = false
                            } label: {
                                Circle()
                                    .fill(Color(hexString: choice) ?? Brand.accent)
                                    .frame(width: 30, height: 30)
                                    .overlay(Circle().stroke(.white, lineWidth: normalizedColor == choice ? 3 : 0))
                            }
                            .buttonStyle(.plain)
                        }
                        ColorPicker("", selection: Binding(
                            get: { Color(hexString: normalizedColor) ?? Brand.accent },
                            set: { newColor in
                                if let hex = newColor.guildTagHex { color = hex }
                            }
                        ), supportsOpacity: false)
                        .labelsHidden()
                    }

                    Toggle("Private tag", isOn: $isPrivate)
                        .onChange(of: isPrivate) { _, _ in notice = nil; removeArmed = false }
                    Text("People can still wear the tag, but tapping it says this space is private instead of showing the space's profile.")
                        .font(.caption2).foregroundStyle(Brand.textMuted)
                }
                .listRowBackground(Brand.surface)

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote).foregroundStyle(Brand.dnd)
                    }.listRowBackground(Brand.surface)
                }
                if let notice {
                    Section {
                        Text(notice).font(.footnote).foregroundStyle(Brand.online)
                    }.listRowBackground(Brand.surface)
                }

                Section {
                    HStack {
                        if existing != nil {
                            Button(removeArmed ? "Click again to remove" : "Remove tag") {
                                if removeArmed { Task { await remove() } }
                                else { removeArmed = true; notice = nil }
                            }
                            .foregroundStyle(Brand.dnd)
                            .disabled(saving)
                        }
                        Spacer()
                        Button {
                            Task { await save() }
                        } label: {
                            if saving { ProgressView() } else { Text(existing == nil ? "Create tag" : "Save changes") }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Brand.accent)
                        .disabled(saving || !dirty || tagProblem != nil)
                    }
                } footer: {
                    if let problem = tagProblem { Text(problem).foregroundStyle(Brand.dnd) }
                }
                .listRowBackground(Brand.surface)

                Section {
                    Text("Anyone who is a member of \(server.name) can wear this tag. Only one tag can be worn at a time. If you change the tag, icon or colour later, everyone wearing it will need to put it on again.")
                        .font(.footnote).foregroundStyle(Brand.textMuted)
                } footer: { EmptyView() }
                .listRowBackground(Brand.surface)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Guild tag")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .task { await load() }
        .sheet(isPresented: $showCatalysts) {
            CatalystSheet(serverId: server.id, serverName: server.name)
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            catalystCount = try await DatabaseService.catalystCount(serverId: server.id)
            let tag = try await DatabaseService.serverGuildTag(serverId: server.id)
            existing = tag
            self.tag = tag?.tag ?? ""
            icon = tag?.icon ?? .star
            color = tag?.color ?? "#5865f2"
            isPrivate = tag?.isPrivate == true
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func save() async {
        guard tagProblem == nil else { error = tagProblem; return }
        saving = true
        error = nil
        notice = nil
        do {
            let result = try await DatabaseService.setServerGuildTag(
                serverId: server.id, tag: tag, icon: icon, color: normalizedColor, isPrivate: isPrivate)
            existing = result
            self.tag = result.tag
            icon = result.icon
            color = result.color
            isPrivate = result.isPrivate == true
            notice = "Saved. Anyone in \(server.name) can wear it from Profile settings."
            removeArmed = false
            GuildTagStore.shared.invalidateAll()
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }

    private func remove() async {
        saving = true
        error = nil
        notice = nil
        do {
            try await DatabaseService.removeServerGuildTag(serverId: server.id)
            existing = nil
            tag = ""
            icon = .star
            color = "#5865f2"
            isPrivate = false
            notice = "Removed. It no longer appears on anyone's profile."
            removeArmed = false
            GuildTagStore.shared.invalidateAll()
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

private struct LevelLockView: View {
    let count: Int
    var onBoost: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "lock.fill").foregroundStyle(Brand.textMuted)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Guild tags unlock at Catalyst Level 3")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Brand.textPrimary)
                    Text("\(count) of 6 Catalysts. \(6 - count) more to unlock.")
                        .font(.caption).foregroundStyle(Brand.textMuted)
                }
            }
            Button("Boost this space") { onBoost() }
                .buttonStyle(.borderedProminent).tint(Brand.accent)
            Text("Eight icons, any colour").font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted).padding(.top, 4)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 8), spacing: 6) {
                ForEach(GuildTagIcon.allCases) { icon in
                    PixelGuildIcon(icon: icon, color: Brand.textMuted, size: 20)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 6))
                }
            }
            Text("Once the tag exists, anyone in the space can wear it. Wearing a tag never needs a Catalyst.")
                .font(.caption).foregroundStyle(Brand.textMuted)
        }
        .padding(.vertical, 6)
    }
}
