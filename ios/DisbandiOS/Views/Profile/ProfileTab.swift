import PhotosUI
import SwiftUI

struct ProfileTab: View {
    @Environment(AppState.self) private var app
    @Environment(SubscriptionService.self) private var subscriptions
    @State private var showEdit = false
    @State private var avatarItem: PhotosPickerItem?
    @State private var bannerItem: PhotosPickerItem?
    @State private var uploading = false

    private var profile: Profile? { app.profile }

    /// True when we have no trustworthy read of the account's plan.
    private var planUnknown: Bool { profile == nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if profile == nil, let problem = app.profileError {
                        profileErrorCard(problem)
                    }
                    header
                    statusPicker
                    if let bio = profile?.bio, !bio.isEmpty {
                        card {
                            VStack(alignment: .leading, spacing: 6) {
                                sectionLabel("About me")
                                Text(bio)
                                    .foregroundStyle(Brand.textSecondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    if let profile, !PlatformBadges.forProfile(profile).isEmpty {
                        card { UserBadgeList(profile: profile) }
                    }
                    planCard
                    links
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            }
            .background(Brand.background)
            .navigationTitle("You")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showEdit = true } label: { Image(systemName: "pencil") }
                        .accessibilityLabel("Edit profile")
                }
            }
            .sheet(isPresented: $showEdit) { EditProfileSheet() }
            .onChange(of: avatarItem) { _, item in if let item { Task { await upload(item, banner: false) } } }
            .onChange(of: bannerItem) { _, item in if let item { Task { await upload(item, banner: true) } } }
        }
    }

    /// Shown when the profile fetch failed, in place of an endless "Loading…".
    private func profileErrorCard(_ problem: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Couldn't load your profile", systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.dnd)
            Text(problem)
                .font(.caption)
                .foregroundStyle(Brand.textSecondary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            Button("Try again") {
                Task { await app.loadProfile() }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Brand.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Brand.surface, in: .rect(cornerRadius: 14))
    }

    // MARK: - Header

    /// Banner, avatar and identity as one card.
    ///
    /// The previous version floated the avatar and name over the banner with
    /// hardcoded offsets, so they drifted apart at different type sizes and
    /// collided with long names.
    private var header: some View {
        VStack(spacing: 0) {
            PhotosPicker(selection: $bannerItem, matching: .images) {
                RemoteImage(url: profile?.bannerUrl, contentMode: .fill) { accentGradient }
                    .frame(height: 120)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .overlay(alignment: .topTrailing) {
                        editPip(systemImage: "photo")
                            .padding(10)
                    }
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .bottom, spacing: 12) {
                    PhotosPicker(selection: $avatarItem, matching: .images) {
                        AvatarView(url: profile?.avatarUrl, name: profile?.name ?? "?", size: 80,
                                   status: profile?.status, ringColors: accentColors, ringWidth: 4)
                            .background(Circle().fill(Brand.surface).padding(-4))
                            .overlay(alignment: .bottomTrailing) {
                                if uploading {
                                    ProgressView().controlSize(.small)
                                } else {
                                    editPip(systemImage: "camera.fill")
                                }
                            }
                    }
                    .buttonStyle(.plain)

                    Spacer(minLength: 0)
                }
                .padding(.top, -40)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(profile?.name ?? "Loading…")
                            .font(.title2.bold())
                            .foregroundStyle(Brand.textPrimary)
                            .lineLimit(1)
                        if let profile { UserBadgesView(profile: profile, size: 15) }
                    }
                    Text("@\(profile?.handle ?? "user")")
                        .font(.subheadline)
                        .foregroundStyle(Brand.textMuted)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Brand.surface)
        .clipShape(.rect(cornerRadius: 18))
    }

    private func editPip(systemImage: String) -> some View {
        Image(systemName: systemImage)
            .font(.caption2)
            .padding(6)
            .background(Brand.accent, in: .circle)
            .foregroundStyle(.white)
    }

    private var accentColors: [Color] {
        [Color(hexString: profile?.accentColor) ?? Brand.accent,
         Color(hexString: profile?.accentColor2) ?? Brand.accentSoft]
    }

    private var accentGradient: some View {
        LinearGradient(colors: accentColors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    // MARK: - Sections

    private var statusPicker: some View {
        card {
            VStack(alignment: .leading, spacing: 10) {
                sectionLabel("Status")
                HStack(spacing: 8) {
                    ForEach(UserStatus.allCases, id: \.self) { status in
                        let selected = (profile?.preferredStatus ?? profile?.status) == status
                        Button {
                            Task { await app.setStatus(status) }
                        } label: {
                            VStack(spacing: 5) {
                                Circle().fill(status.color).frame(width: 12, height: 12)
                                Text(status.shortLabel)
                                    .font(.caption2)
                                    .foregroundStyle(selected ? Brand.textPrimary : Brand.textSecondary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(selected ? Brand.elevated : Brand.surfaceRaised,
                                        in: .rect(cornerRadius: 12))
                            .overlay {
                                RoundedRectangle(cornerRadius: 12)
                                    .strokeBorder(selected ? Brand.accent : .clear, lineWidth: 1.5)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected ? [.isSelected] : [])
                    }
                }
            }
        }
    }

    private var planCard: some View {
        card {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    sectionLabel("Plan")
                    // Never assert a plan we could not read. When the profile
                    // fetch failed the subscription read almost certainly did
                    // too, and defaulting to "Free" told a paying subscriber
                    // they had no subscription.
                    Text(planUnknown ? "—" : subscriptions.plan.label)
                        .font(.headline)
                        .foregroundStyle(planUnknown ? Brand.textMuted : Brand.textPrimary)
                }
                Spacer()
                if !planUnknown, subscriptions.plan != .free {
                    Text(subscriptions.plan.label.uppercased())
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Brand.accent.opacity(0.18), in: .capsule)
                        .foregroundStyle(Brand.accent)
                } else {
                    Text("Manage on the web")
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                }
            }
        }
    }

    private var links: some View {
        VStack(spacing: 0) {
            NavigationLink {
                AppearanceView()
            } label: {
                linkRow(icon: "paintpalette", title: "Appearance",
                        detail: Themes.definition(ThemeId(rawValue: app.profile?.theme ?? "") ?? .dark).label)
            }
            Divider().overlay(Brand.divider).padding(.leading, 52)
            NavigationLink {
                SettingsView()
            } label: {
                linkRow(icon: "gearshape", title: "Settings", detail: nil)
            }
        }
        .background(Brand.surface)
        .clipShape(.rect(cornerRadius: 16))
    }

    private func linkRow(icon: String, title: String, detail: String?) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(Brand.accent)
                .frame(width: 28)
            Text(title).foregroundStyle(Brand.textPrimary)
            Spacer()
            if let detail {
                Text(detail).font(.subheadline).foregroundStyle(Brand.textMuted)
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Brand.textMuted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .contentShape(.rect)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Brand.textMuted)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Brand.surface, in: .rect(cornerRadius: 16))
    }

    private func upload(_ item: PhotosPickerItem, banner: Bool) async {
        uploading = true
        defer { uploading = false; if banner { bannerItem = nil } else { avatarItem = nil } }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let result = try? await MediaService.uploadImage(data) else { return }
        let patch = banner
            ? DatabaseService.ProfilePatch(bannerUrl: result.url)
            : DatabaseService.ProfilePatch(avatarUrl: result.url)
        await app.saveProfile(patch)
    }
}

struct EditProfileSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var username = ""
    @State private var bio = ""
    @State private var accent: String?
    @State private var accent2: String?
    @State private var busy = false
    @State private var usernameProblem: String?
    @State private var saveError: String?

    /// The username as it was when the sheet opened, so we only call the
    /// rename RPC when it actually changed.
    @State private var originalUsername = ""

    private var usernameChanged: Bool {
        username.trimmingCharacters(in: .whitespaces).lowercased() != originalUsername.lowercased()
    }

    private let palette = ["#7A7D85", "#5865F2", "#EB459E", "#ED4245", "#FAA61A",
                           "#57F287", "#9B59B6", "#1ABC9C"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    preview
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                Section("Display name") { TextField("Display name", text: $displayName) }
                Section {
                    HStack(spacing: 4) {
                        Text("@").foregroundStyle(Brand.textMuted)
                        TextField("username", text: $username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    if let usernameProblem {
                        Label(usernameProblem, systemImage: "exclamationmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(Brand.dnd)
                    } else if usernameChanged && !username.isEmpty {
                        Label("Available", systemImage: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(Brand.online)
                    }
                } header: {
                    Text("Username")
                } footer: {
                    Text("2–25 characters: letters, numbers and underscores.")
                }
                Section("About me") {
                    TextField("Tell people about yourself", text: $bio, axis: .vertical).lineLimit(3...6)
                }
                Section("Accent color") { swatches(selection: $accent) }
                Section("Secondary accent") { swatches(selection: $accent2) }
                Section {
                    Button("Reset to default") {
                        accent = nil
                        accent2 = nil
                    }
                    .foregroundStyle(Brand.dnd)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save", action: save).disabled(busy) }
            }
            .onAppear {
                displayName = app.profile?.displayName ?? ""
                username = app.profile?.username ?? ""
                originalUsername = username
                bio = app.profile?.bio ?? ""
                accent = app.profile?.accentColor
                accent2 = app.profile?.accentColor2
            }
            // Debounced availability check: re-runs when typing settles rather
            // than firing an RPC per keystroke.
            .task(id: username) {
                guard usernameChanged else { usernameProblem = nil; return }
                try? await Task.sleep(nanoseconds: 400_000_000)
                guard !Task.isCancelled else { return }
                let candidate = username.trimmingCharacters(in: .whitespaces)
                usernameProblem = await DatabaseService.usernameUnavailableReason(candidate)
            }
            .alert("Couldn't save", isPresented: .constant(saveError != nil)) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }
    }

    /// Shows the accent choice on the card itself, so the colours can be judged
    /// before saving rather than after.
    private var preview: some View {
        VStack(spacing: 0) {
            LinearGradient(
                colors: [Color(hexString: accent) ?? Brand.accent,
                         Color(hexString: accent2) ?? Color(hexString: accent) ?? Brand.accentSoft],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .frame(height: 56)

            HStack(spacing: 10) {
                AvatarView(url: app.profile?.avatarUrl, name: displayName.isEmpty ? "?" : displayName,
                           size: 44, status: app.profile?.status)
                VStack(alignment: .leading, spacing: 1) {
                    Text(displayName.isEmpty ? (app.profile?.handle ?? "You") : displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                    Text("@\(app.profile?.handle ?? "user")")
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                }
                Spacer()
            }
            .padding(12)
        }
        .background(Brand.surface)
        .clipShape(.rect(cornerRadius: 14))
        .padding(.vertical, 8)
    }

    private func swatches(selection: Binding<String?>) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
            ForEach(palette, id: \.self) { hex in
                Circle()
                    .fill(Color(hexString: hex) ?? Brand.accent)
                    .frame(height: 30)
                    .overlay(Circle().stroke(Brand.textPrimary,
                                             lineWidth: selection.wrappedValue == hex ? 2 : 0))
                    .onTapGesture { selection.wrappedValue = hex }
            }
        }
        .padding(.vertical, 4)
    }

    private func save() {
        busy = true
        Task {
            // Username goes first: if the rename is rejected we stop rather
            // than saving half the form and dismissing as though it worked.
            if usernameChanged {
                do {
                    try await DatabaseService.updateUsername(
                        username.trimmingCharacters(in: .whitespaces))
                } catch {
                    saveError = friendlyRenameError(error)
                    busy = false
                    return
                }
            }

            await app.saveProfile(.init(
                displayName: displayName.trimmingCharacters(in: .whitespaces),
                bio: bio.trimmingCharacters(in: .whitespaces),
                accentColor: accent, accentColor2: accent2))
            await app.loadProfile()
            busy = false
            dismiss()
        }
    }

    /// The database raises these as P0001 with a readable message; strip the
    /// PostgREST wrapper so the user sees the sentence, not the envelope.
    private func friendlyRenameError(_ error: Error) -> String {
        let text = error.localizedDescription
        if text.localizedCaseInsensitiveContains("already taken") {
            return "That username is already taken."
        }
        if text.localizedCaseInsensitiveContains("not allowed") {
            return "That username isn't allowed."
        }
        if text.localizedCaseInsensitiveContains("2–25") || text.localizedCaseInsensitiveContains("2-25") {
            return "Usernames must be 2–25 characters: letters, numbers and underscores."
        }
        if text.localizedCaseInsensitiveContains("limit") {
            return "You've changed your username too many times today. Try again tomorrow."
        }
        return text
    }
}
