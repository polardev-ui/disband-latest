import PhotosUI
import SwiftUI

struct ProfileTab: View {
    @Environment(AppState.self) private var app
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(PresenceService.self) private var presence
    @State private var showEdit = false
    @State private var showStatus = false
    @State private var confirmSignOut = false
    @State private var avatarItem: PhotosPickerItem?
    @State private var bannerItem: PhotosPickerItem?
    @State private var uploading = false

    private var profile: Profile? { app.profile }

    /// Live presence, falling back to the stored status only while the
    /// presence socket is still joining.
    private var ownStatus: UserStatus? {
        guard let profile else { return nil }
        return presence.status(for: profile.id, fallback: profile.status)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ScreenHeader("You") {
                        HeaderIconButton(symbol: "pencil", label: "Edit profile") { showEdit = true }
                    }
                    if profile == nil, let problem = app.profileError {
                        profileErrorCard(problem).padding(.horizontal, 16).padding(.bottom, 12)
                    }
                    hero.padding(.horizontal, 16)
                    planCard.padding(.horizontal, 16).padding(.top, 12)

                    SectionCaption("Account")
                    SettingsGroup {
                        Button { showEdit = true } label: {
                            SettingsRowLabel(symbol: "person.crop.circle", tint: Brand.accent,
                                             title: "Edit profile", detail: profile?.pronouns)
                        }
                        SettingsDivider()
                        Button { showStatus = true } label: {
                            SettingsRowLabel(symbol: "bubble.left.fill", tint: Color(hex: 0x3BA55C),
                                             title: "Status", detail: profile?.activeStatusNote ?? ownStatus?.label)
                        }
                        SettingsDivider()
                        NavigationLink { ReferralsView() } label: {
                            SettingsRowLabel(symbol: "gift.fill", tint: Color(hex: 0xEB459E),
                                             title: "Referrals", detail: "Win $100")
                        }
                    }
                    .buttonStyle(.plain)

                    SectionCaption("App")
                    SettingsGroup {
                        NavigationLink { AppearanceView().hidesDock().solidNavigationBar() } label: {
                            SettingsRowLabel(symbol: "paintpalette.fill", tint: Color(hex: 0x9B59B6),
                                             title: "Appearance",
                                             detail: Themes.definition(ThemeId(rawValue: profile?.theme ?? "") ?? .dark).label)
                        }
                        SettingsDivider()
                        NavigationLink { SettingsView().hidesDock() } label: {
                            SettingsRowLabel(symbol: "bell.badge.fill", tint: Color(hex: 0xF0B232),
                                             title: "Notifications & chat")
                        }
                    }
                    .buttonStyle(.plain)

                    SectionCaption("About")
                    SettingsGroup {
                        SettingsRowLabel(symbol: "info.circle.fill", tint: Color(hex: 0x4E5058),
                                         title: "Version", detail: Bundle.main.appVersionDisplay, showsChevron: false)
                        SettingsDivider()
                        Link(destination: AppConfig.webAppURL) {
                            SettingsRowLabel(symbol: "globe", tint: Color(hex: 0x1ABC9C),
                                             title: "disband.dev", detail: nil)
                        }
                    }

                    SettingsGroup {
                        Button { confirmSignOut = true } label: {
                            SettingsRowLabel(symbol: "rectangle.portrait.and.arrow.right", tint: Brand.dnd,
                                             title: "Sign out", showsChevron: false, destructive: true)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.top, 18)
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .statusBarScrim()
            .background(Brand.background)
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showEdit) { EditProfileSheet() }
            .sheet(isPresented: $showStatus) { StatusSheet() }
            .confirmationDialog("Sign out of Disband?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { await app.signOut() } }
            }
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
            Button("Try again") { Task { await app.loadProfile() } }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    // MARK: - Hero

    /// Banner, avatar, identity and status as one card. Tapping the banner or
    /// avatar replaces it.
    private var hero: some View {
        VStack(spacing: 0) {
            PhotosPicker(selection: $bannerItem, matching: .images) {
                BannerImage(url: profile?.bannerUrl, height: 124) { accentGradient }
                    .overlay(alignment: .topTrailing) { editPip("photo").padding(10) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Change banner")

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .bottom) {
                    PhotosPicker(selection: $avatarItem, matching: .images) {
                        AvatarView(url: profile?.avatarUrl, name: profile?.name ?? "?", size: 88,
                                   status: ownStatus, ringColors: accentColors, ringWidth: 4)
                            .background(Circle().fill(Brand.surface).padding(-5))
                            .overlay(alignment: .bottomTrailing) {
                                if uploading { ProgressView().controlSize(.small) } else { editPip("camera.fill") }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Change avatar")
                    Spacer(minLength: 0)
                }
                .padding(.top, -46)

                VStack(alignment: .leading, spacing: 4) {
                    Text(profile?.name ?? "Loading…")
                        .font(.title2.bold())
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Text("@\(profile?.handle ?? "user")")
                        if let pronouns = profile?.pronouns, !pronouns.isEmpty {
                            Text("·")
                            Text(pronouns)
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(Brand.textMuted)
                    if let profile {
                        UserBadgesView(profile: profile, size: 15).padding(.top, 4)
                    }
                }

                statusBubble

                if let bio = profile?.bio, !bio.isEmpty {
                    Text(bio)
                        .font(.subheadline)
                        .foregroundStyle(Brand.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Brand.surface)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    /// Your custom status, as others see it — tap to change it.
    private var statusBubble: some View {
        Button { showStatus = true } label: {
            HStack(spacing: 10) {
                Circle().fill((ownStatus ?? .online).color).frame(width: 10, height: 10)
                Text(profile?.activeStatusNote ?? "Set a status")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(profile?.activeStatusNote == nil ? Brand.textMuted : Brand.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                if let expires = RelativeTime.date(from: profile?.statusExpiresAt), profile?.activeStatusNote != nil {
                    Text("until \(expires.formatted(date: .omitted, time: .shortened))")
                        .font(.caption).foregroundStyle(Brand.textMuted)
                }
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Brand.textMuted)
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(Brand.elevated, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Status")
    }

    private func editPip(_ systemImage: String) -> some View {
        Image(systemName: systemImage)
            .font(.caption2.weight(.bold))
            .padding(7)
            .background(Brand.accent, in: Circle())
            .foregroundStyle(.white)
    }

    private var accentColors: [Color] {
        [Color(hexString: profile?.accentColor) ?? Brand.accent,
         Color(hexString: profile?.accentColor2) ?? Brand.accentSoft]
    }

    private var accentGradient: some View {
        LinearGradient(colors: accentColors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    // MARK: - Plan

    /// Aero gets the gold card; Free sees what Aero adds. Purchases happen
    /// on the web, and App Store rules keep that a plain statement, not a link.
    @ViewBuilder private var planCard: some View {
        if profile == nil {
            EmptyView()
        } else if subscriptions.plan.isPaid {
            HStack(spacing: 14) {
                Image(systemName: "sparkles")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(width: 46, height: 46)
                    .background(SubscriptionPlan.aeroGold, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Disband Aero").font(.headline).foregroundStyle(.white)
                    Text(aeroDetail).font(.subheadline).foregroundStyle(.white.opacity(0.75))
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: 0x4A3B0A), Color(hex: 0x1E1F22)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(SubscriptionPlan.aeroGold.opacity(0.45), lineWidth: 1))
            }
        } else {
            SurfaceCard {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Disband Free").font(.headline).foregroundStyle(Brand.textPrimary)
                        Spacer()
                        Text("AERO")
                            .font(.caption2.weight(.heavy))
                            .padding(.horizontal, 8).frame(height: 20)
                            .background(SubscriptionPlan.aeroGold.opacity(0.2), in: Capsule())
                            .foregroundStyle(SubscriptionPlan.aeroGold)
                    }
                    Text("Aero adds 500 MB uploads, 1440p video, animated avatars and banners, 4 Catalysts a month, and every theme.")
                        .font(.subheadline).foregroundStyle(Brand.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Available on disband.dev").font(.caption).foregroundStyle(Brand.textMuted)
                }
            }
        }
    }

    private var aeroDetail: String {
        guard let row = subscriptions.subscription else { return "Active" }
        if row.status == "past_due" { return "Payment issue — update your card on the web" }
        if let end = RelativeTime.date(from: row.currentPeriodEnd) {
            return "Active · renews \(end.formatted(date: .abbreviated, time: .omitted))"
        }
        return "Active"
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
    @Environment(PresenceService.self) private var presence
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var username = ""
    @State private var bio = ""
    @State private var pronouns = ""
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
                Section {
                    TextField("e.g. she/her, they/them", text: $pronouns)
                        .textInputAutocapitalization(.never)
                        .onChange(of: pronouns) { _, value in
                            if value.count > 40 { pronouns = String(value.prefix(40)) }
                        }
                } header: {
                    Text("Pronouns")
                } footer: {
                    Text("Shown beside your name on your profile.")
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
                pronouns = app.profile?.pronouns ?? ""
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
                if let profile = app.profile {
                    AvatarView(url: profile.avatarUrl, name: displayName.isEmpty ? "?" : displayName,
                               size: 44, status: presence.status(for: profile.id, fallback: profile.status))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(displayName.isEmpty ? (profile.handle ?? "You") : displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.textPrimary)
                        Text("@\(profile.handle ?? "user")")
                            .font(.caption)
                            .foregroundStyle(Brand.textMuted)
                    }
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
            if pronouns != (app.profile?.pronouns ?? "") {
                do {
                    try await ProfileService.updatePronouns(pronouns)
                } catch {
                    saveError = "Couldn't save your pronouns. Try again."
                    busy = false
                    return
                }
            }
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
