import SwiftUI

// MARK: - Channels

/// Create, rename, re-categorise and delete channels and categories.
struct ChannelsAdminView: View {
    let server: Server
    var onChanged: () async -> Void

    @State private var channels: [Channel] = []
    @State private var categories: [ChannelCategory] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showNewChannel = false
    @State private var showNewCategory = false
    @State private var categoryName = ""
    @State private var renaming: ChannelCategory?
    @State private var deletingCategory: ChannelCategory?

    private struct Group: Identifiable {
        let id: String
        let category: ChannelCategory?
        let channels: [Channel]
    }

    private var groups: [Group] {
        let loose = channels.filter { $0.categoryId == nil }.sorted { $0.position < $1.position }
        var result: [Group] = []
        if !loose.isEmpty { result.append(Group(id: "_loose", category: nil, channels: loose)) }
        for category in categories.sorted(by: { $0.position < $1.position }) {
            let inside = channels.filter { $0.categoryId == category.id }.sorted { $0.position < $1.position }
            result.append(Group(id: category.id, category: category, channels: inside))
        }
        return result
    }

    var body: some View {
        List {
            if loading && channels.isEmpty {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
            ForEach(groups) { group in
                Section {
                    if group.channels.isEmpty {
                        Text("No channels in this category.").foregroundStyle(Brand.textMuted)
                    }
                    ForEach(group.channels) { channel in
                        NavigationLink {
                            ChannelEditView(channel: channel, categories: categories) { await reload() }
                        } label: {
                            Label {
                                Text(channel.name).foregroundStyle(Brand.textPrimary).lineLimit(1)
                            } icon: {
                                Image(systemName: Self.symbol(for: channel)).foregroundStyle(Brand.textSecondary)
                            }
                        }
                    }
                } header: {
                    if let category = group.category { categoryHeader(category) }
                }
                .listRowBackground(Brand.surface)
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(Brand.dnd)
                }
                .listRowBackground(Brand.surface)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Channels")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showNewChannel = true } label: { Label("New Channel", systemImage: "number") }
                    Button { categoryName = ""; showNewCategory = true } label: {
                        Label("New Category", systemImage: "folder.badge.plus")
                    }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add")
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(isPresented: $showNewChannel) {
            NewChannelSheet(serverId: server.id, categories: categories) { await reload() }
        }
        .alert("New Category", isPresented: $showNewCategory) {
            TextField("Category name", text: $categoryName)
            Button("Create") {
                let name = categoryName.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return }
                run { try await ServerAdmin.createCategory(serverId: server.id, name: name) }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Rename Category", isPresented: Binding(
            get: { renaming != nil }, set: { if !$0 { renaming = nil } }
        )) {
            TextField("Category name", text: $categoryName)
            Button("Save") {
                guard let category = renaming else { return }
                let name = categoryName.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty, name != category.name else { return }
                run { try await ServerAdmin.renameCategory(categoryId: category.id, name: name) }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Delete \(deletingCategory?.name ?? "category")?",
            isPresented: Binding(get: { deletingCategory != nil }, set: { if !$0 { deletingCategory = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete Category", role: .destructive) {
                guard let category = deletingCategory else { return }
                run { try await ServerAdmin.deleteCategory(categoryId: category.id) }
            }
        } message: {
            Text("Its channels stay, outside any category.")
        }
    }

    private func categoryHeader(_ category: ChannelCategory) -> some View {
        HStack {
            Text(category.name)
            Spacer()
            Menu {
                Button { categoryName = category.name; renaming = category } label: {
                    Label("Rename", systemImage: "pencil")
                }
                Button(role: .destructive) { deletingCategory = category } label: {
                    Label("Delete", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.footnote.weight(.bold))
                    .frame(width: 28, height: 22)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("\(category.name) options")
        }
    }

    static func symbol(for channel: Channel) -> String {
        if channel.type == .voice { return "speaker.wave.2" }
        return channel.readOnly == true ? "megaphone" : "number"
    }

    private func load() async {
        async let loadedChannels = DatabaseService.channels(serverId: server.id)
        async let loadedCategories = DatabaseService.categories(serverId: server.id)
        do {
            channels = try await loadedChannels
            categories = (try? await loadedCategories) ?? categories
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    /// After a change: this list and the channel panel behind the sheet.
    private func reload() async {
        await load()
        await onChanged()
    }

    private func run(_ work: @escaping () async throws -> Void) {
        Task {
            do {
                try await work()
                error = nil
            } catch { self.error = error.localizedDescription }
            await reload()
        }
    }
}

/// Text channel names take dashes for spaces, as on the web; anything else
/// (emoji too) stays.
private func channelSlug(_ name: String, type: ChannelType) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let clean = type == .text
        ? trimmed.replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
        : trimmed
    return String(clean.prefix(100))
}

struct NewChannelSheet: View {
    let serverId: String
    let categories: [ChannelCategory]
    var onCreated: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var type: ChannelType = .text
    @State private var categoryId: String?
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private var clean: String { channelSlug(name, type: type) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Channel type") {
                    Picker("Type", selection: $type) {
                        Label("Text", systemImage: "number").tag(ChannelType.text)
                        Label("Voice", systemImage: "speaker.wave.2").tag(ChannelType.voice)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                .listRowBackground(Brand.surface)

                Section {
                    HStack(spacing: 6) {
                        Image(systemName: type == .voice ? "speaker.wave.2" : "number")
                            .foregroundStyle(Brand.textMuted)
                        TextField(type == .voice ? "Lounge" : "new-channel", text: $name)
                            .textInputAutocapitalization(type == .text ? .never : .sentences)
                            .autocorrectionDisabled()
                            .focused($focused)
                            .submitLabel(.done)
                            .onSubmit(create)
                    }
                } header: {
                    Text("Name")
                } footer: {
                    if type == .text && !name.isEmpty && clean != name {
                        Text("It'll be created as #\(clean).")
                    }
                }
                .listRowBackground(Brand.surface)

                if !categories.isEmpty {
                    Section("Category") {
                        Picker("Category", selection: $categoryId) {
                            Text("None").tag(String?.none)
                            ForEach(categories.sorted { $0.position < $1.position }) { category in
                                Text(category.name).tag(Optional(category.id))
                            }
                        }
                    }
                    .listRowBackground(Brand.surface)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote).foregroundStyle(Brand.dnd)
                    }
                    .listRowBackground(Brand.surface)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("New Channel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Create", action: create).disabled(clean.isEmpty)
                    }
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium, .large])
        .tint(Brand.accent)
    }

    private func create() {
        guard !clean.isEmpty, !busy else { return }
        busy = true
        Task {
            do {
                try await ServerAdmin.createChannel(serverId: serverId, name: clean, type: type, categoryId: categoryId)
                await onCreated()
                dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

struct ChannelEditView: View {
    let channel: Channel
    let categories: [ChannelCategory]
    var onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var readOnly: Bool
    @State private var busy = false
    @State private var error: String?
    @State private var confirmDelete = false

    init(channel: Channel, categories: [ChannelCategory], onChanged: @escaping () async -> Void) {
        self.channel = channel
        self.categories = categories
        self.onChanged = onChanged
        _name = State(initialValue: channel.name)
        _readOnly = State(initialValue: channel.readOnly == true)
    }

    private var clean: String { channelSlug(name, type: channel.type) }
    private var renamed: Bool { !clean.isEmpty && clean != channel.name }

    var body: some View {
        Form {
            Section {
                HStack(spacing: 6) {
                    Image(systemName: ChannelsAdminView.symbol(for: channel)).foregroundStyle(Brand.textMuted)
                    TextField("Channel name", text: $name)
                        .textInputAutocapitalization(channel.type == .text ? .never : .sentences)
                        .autocorrectionDisabled()
                }
            } header: {
                Text("Name")
            } footer: {
                if channel.type == .text && renamed && clean != name {
                    Text("It'll be saved as #\(clean).")
                }
            }
            .listRowBackground(Brand.surface)

            if channel.type == .text {
                Section {
                    Toggle("Announcement channel", isOn: Binding(
                        get: { readOnly },
                        set: { setReadOnly($0) }
                    ))
                } footer: {
                    Text("Only people who can manage channels can post. Everyone else can read and react.")
                }
                .listRowBackground(Brand.surface)
            }

            Section {
                Button("Delete Channel", role: .destructive) { confirmDelete = true }
            }
            .listRowBackground(Brand.surface)

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(Brand.dnd)
                }
                .listRowBackground(Brand.surface)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle(channel.type == .voice ? channel.name : "#\(channel.name)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if busy { ProgressView() } else {
                    Button("Save", action: rename).disabled(!renamed)
                }
            }
        }
        .confirmationDialog("Delete \(channel.type == .voice ? channel.name : "#" + channel.name)?",
                            isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete Channel", role: .destructive, action: delete)
        } message: {
            Text("Every message in it is deleted for everyone. This can't be undone.")
        }
    }

    private func setReadOnly(_ on: Bool) {
        let before = readOnly
        readOnly = on
        Task {
            do {
                try await ServerAdmin.setReadOnly(channelId: channel.id, on)
                await onChanged()
            } catch {
                readOnly = before
                self.error = error.localizedDescription
            }
        }
    }

    private func rename() {
        busy = true
        Task {
            do {
                try await ServerAdmin.renameChannel(channelId: channel.id, name: clean)
                await onChanged()
                dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    private func delete() {
        busy = true
        Task {
            do {
                try await ServerAdmin.deleteChannel(channelId: channel.id)
                await onChanged()
                dismiss()
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

// MARK: - Audit log

/// The last 100 moderation actions, worded as the web words them.
struct AuditLogView: View {
    let serverId: String

    @State private var entries: [ServerAdmin.AuditEntry] = []
    @State private var profiles: [String: Profile] = [:]
    @State private var loading = true
    @State private var error: String?

    private static let actions: [String: (label: String, symbol: String, danger: Bool)] = [
        "member.kick": ("kicked", "person.fill.xmark", true),
        "member.ban": ("banned", "nosign", true),
        "member.unban": ("lifted the ban on", "nosign", false),
        "member.timeout": ("timed out", "timer", true),
        "member.untimeout": ("removed the timeout on", "timer", false),
        "channel.message.delete": ("deleted a message", "trash", false),
        "dm.message.delete": ("deleted a DM", "trash", false),
        "group.message.delete": ("deleted a group message", "trash", false),
        "webhook.create": ("created", "link", false),
        "webhook.update": ("updated", "link", false),
        "webhook.token_reset": ("reset the URL for", "link", false),
        "webhook.delete": ("deleted", "link", true),
        "space.partner_set": ("updated the Partner badge on", "star", false),
        "space.verified_set": ("updated the Verified badge on", "checkmark.seal", false),
    ]

    var body: some View {
        List {
            if loading && entries.isEmpty {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if entries.isEmpty {
                Section {
                    VStack(spacing: 8) {
                        Image(systemName: "list.bullet.rectangle").font(.title2).foregroundStyle(Brand.textMuted)
                        Text("Nothing logged yet").font(.headline).foregroundStyle(Brand.textSecondary)
                        Text("Kicks, bans, timeouts and deleted messages will show up here.")
                            .font(.subheadline)
                            .foregroundStyle(Brand.textMuted)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                }
                .listRowBackground(Brand.surface)
            } else {
                Section {
                    ForEach(entries) { entry in row(entry) }
                }
                .listRowBackground(Brand.surface)
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(Brand.dnd)
                }
                .listRowBackground(Brand.surface)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Audit Log")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func row(_ entry: ServerAdmin.AuditEntry) -> some View {
        let action = Self.actions[entry.action]
        let actor = entry.actorId.flatMap { profiles[$0] }
        let reason = entry.details?["reason"]?.text.flatMap { $0.isEmpty ? nil : $0 }
        let seconds = entry.details?["seconds"].flatMap { value -> Int? in
            if case .number(let n) = value { return Int(n) }
            return nil
        }

        return HStack(alignment: .top, spacing: 12) {
            AvatarView(url: actor?.avatarUrl, name: actor?.name ?? "?", size: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(sentence(entry, action: action?.label, actor: actor))
                    .font(.subheadline)
                    .foregroundStyle(Brand.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let seconds {
                    Text("For \(Self.duration(seconds))")
                        .font(.caption).foregroundStyle(Brand.textMuted)
                }
                if let reason {
                    Text("\u{201C}\(reason)\u{201D}")
                        .font(.caption).foregroundStyle(Brand.textMuted)
                        .lineLimit(3)
                }
                Text(RelativeTime.compact(entry.createdAt))
                    .font(.caption2).foregroundStyle(Brand.textMuted)
            }
            Spacer(minLength: 0)
            Image(systemName: action?.symbol ?? "doc.text")
                .font(.footnote)
                .foregroundStyle(action?.danger == true ? Brand.dnd : Brand.textMuted)
        }
        .padding(.vertical, 2)
    }

    private func sentence(_ entry: ServerAdmin.AuditEntry, action: String?, actor: Profile?) -> AttributedString {
        var who = AttributedString(actor?.name ?? "Someone")
        who.font = .subheadline.weight(.semibold)
        who.foregroundColor = Brand.textPrimary

        var verb = AttributedString(" " + (action ?? entry.action))

        var target = AttributedString()
        if entry.targetType == "user", let id = entry.targetId {
            target = AttributedString(" " + (profiles[id]?.name ?? "a former member"))
            target.font = .subheadline.weight(.semibold)
            target.foregroundColor = Brand.textPrimary
        } else if entry.action.hasPrefix("webhook.") {
            target = AttributedString(" " + (entry.details?["name"]?.text ?? "a webhook"))
            target.font = .subheadline.weight(.semibold)
            target.foregroundColor = Brand.textPrimary
        } else if entry.action.hasPrefix("space.") {
            target = AttributedString(" this space")
        }
        verb.foregroundColor = Brand.textSecondary
        return who + verb + target
    }

    static func duration(_ seconds: Int) -> String {
        if seconds < 3600 { return "\(max(1, seconds / 60)) min" }
        if seconds < 86_400 { return "\(seconds / 3600) h" }
        return "\(seconds / 86_400) d"
    }

    private func load() async {
        do {
            entries = try await ServerAdmin.auditLog(serverId: serverId)
            var ids = Set<String>()
            for entry in entries {
                if let actor = entry.actorId { ids.insert(actor) }
                if entry.targetType == "user", let target = entry.targetId { ids.insert(target) }
            }
            if !ids.isEmpty {
                profiles = (try? await DatabaseService.profiles(ids: Array(ids))) ?? profiles
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
