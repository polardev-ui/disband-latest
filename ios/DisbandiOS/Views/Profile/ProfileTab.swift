import PhotosUI
import Supabase
import SwiftUI

struct ProfileTab: View {
    @Environment(AppState.self) private var app
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(PresenceService.self) private var presence
    @Environment(MusicPresenceService.self) private var music
    @State private var showEdit = false
    @State private var showStatus = false
    @State private var confirmSignOut = false
    @State private var avatarItem: PhotosPickerItem?
    @State private var bannerItem: PhotosPickerItem?
    @State private var uploading = false
    @State private var uploadError: String?
    @State private var showPaywall = false
    @State private var showNotifications = false
    @State private var staffAccess: StaffAPI.Access?
    @AppStorage("settings.showStreak") private var showStreak = true
    @State private var friendCount: Int?
    /// How far the banner has scrolled (negative once it moves up).
    @State private var bannerOffset: CGFloat = 0
    @State private var spaceCount: Int?

    private var profile: Profile? { app.profile }

    /// Live presence, falling back to the stored status only while the
    /// presence socket is still joining.
    private var ownStatus: UserStatus? {
        guard let profile else { return nil }
        return presence.status(for: profile.id, fallback: profile.status)
    }

    var body: some View {
        NavigationStack {
            GeometryReader { root in
            ScrollView {
                VStack(spacing: 0) {
                    hero(topInset: root.safeAreaInsets.top)
                    if profile == nil, let problem = app.profileError {
                        profileErrorCard(problem).padding(.horizontal, 16).padding(.top, 12)
                    }
                    planCard.padding(.horizontal, 16).padding(.top, 14)
                    if showStreak {
                        DailyStreakCard().padding(.horizontal, 16).padding(.top, 12)
                    }

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
                        NavigationLink { GuildTagPickerView().hidesDock().solidNavigationBar() } label: {
                            SettingsRowLabel(symbol: "tag.fill", tint: Color(hex: 0x9B59B6),
                                             title: "Guild tag", detail: nil)
                        }
                        SettingsDivider()
                        NavigationLink { BadgeSettingsView().hidesDock().solidNavigationBar() } label: {
                            SettingsRowLabel(symbol: "rosette", tint: Color(hex: 0xF1C40F),
                                             title: "Badges", detail: "Show or hide")
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
                            SettingsRowLabel(symbol: "gearshape.fill", tint: Color(hex: 0x4E5058),
                                             title: "Settings")
                        }
                        if let staffAccess, staffAccess.isStaff {
                            SettingsDivider()
                            NavigationLink {
                                StaffToolsView(isManager: staffAccess.isManager).hidesDock().solidNavigationBar()
                            } label: {
                                SettingsRowLabel(symbol: "shield.lefthalf.filled", tint: Color(hex: 0x4641D9),
                                                 title: "Disband Staff", detail: staffAccess.isManager ? "Manager" : nil)
                            }
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
                        SettingsDivider()
                        Link(destination: ReviewPrompter.writeReviewURL) {
                            SettingsRowLabel(symbol: "star.fill", tint: Color(hex: 0xF0B232),
                                             title: "Rate Disband", detail: nil)
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
            .ignoresSafeArea(edges: .top)
            // A solid strip behind the status bar once the banner has
            // scrolled away, so the clock never sits on top of a card.
            .overlay(alignment: .top) {
                Brand.background
                    .frame(height: root.safeAreaInsets.top)
                    .overlay(alignment: .bottom) { Rectangle().fill(Brand.divider).frame(height: 0.5) }
                    .opacity(bannerOffset < -(bannerHeight - 8) ? 1 : 0)
                    .animation(.easeOut(duration: 0.18), value: bannerOffset < -(bannerHeight - 8))
                    .ignoresSafeArea(edges: .top)
                    .allowsHitTesting(false)
            }
            }
            .background(Brand.background)
            .toolbar(.hidden, for: .navigationBar)
            .task(id: app.currentUserId) { await loadCounts() }
            .sheet(isPresented: $showPaywall) { AeroPaywallSheet() }
            .task(id: app.currentUserId) {
                if let uid = app.currentUserId { staffAccess = await StaffAPI.access(for: uid) }
            }
            .sheet(isPresented: $showNotifications) { NotificationsSheet() }
            .sheet(isPresented: $showEdit) { EditProfileSheet() }
            .sheet(isPresented: $showStatus) { StatusSheet() }
            .confirmationDialog("Sign out of Disband?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { await app.signOut() } }
            }
            .alert("Couldn't update your profile", isPresented: Binding(
                get: { uploadError != nil },
                set: { if !$0 { uploadError = nil } }
            )) {
                Button("OK", role: .cancel) { uploadError = nil }
            } message: {
                Text(uploadError ?? "")
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

    private let bannerHeight: CGFloat = 150

    /// As on the desktop's profile: a full-width banner (stretching when you
    /// pull down), the avatar sitting on its edge in a thick ring, name and
    /// badges, Edit Profile and Status, your numbers, then the inset panel.
    /// Tapping the banner or avatar replaces it.
    private func hero(topInset: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            banner(topInset: topInset)

            PhotosPicker(selection: $avatarItem, matching: .images) {
                AvatarView(url: profile?.avatarUrl, name: profile?.name ?? "?", size: 96,
                           status: ownStatus, ringColors: accentColors, ringWidth: 4,
                           decoration: profile?.equippedRingEffect)
                    .padding(6)
                    .background(Circle().fill(Brand.background))
                    .overlay(alignment: .bottomTrailing) {
                        if uploading { ProgressView().controlSize(.small) } else { editPip("camera.fill").offset(x: -4, y: -4) }
                    }
            }
            .buttonStyle(PressScaleStyle(scale: 0.95))
            .accessibilityLabel("Change avatar")
            .padding(.leading, 10)
            .padding(.top, -54)

            identity.padding(.horizontal, 16).padding(.top, 8)
            actionRow.padding(.horizontal, 16).padding(.top, 14)
            statsRow.padding(.horizontal, 16).padding(.top, 12)
            panel.padding(.horizontal, 16).padding(.top, 12)
        }
    }

    private func banner(topInset: CGFloat) -> some View {
        GeometryReader { geo in
            let pull = max(0, geo.frame(in: .scrollView).minY)
            PhotosPicker(selection: $bannerItem, matching: .images) {
                BannerImage(url: profile?.bannerUrl, height: bannerHeight + topInset + pull) { accentGradient }
                    .overlay(alignment: .bottom) {
                        LinearGradient(colors: [.clear, Brand.background.opacity(0.35)], startPoint: .top, endPoint: .bottom)
                            .frame(height: 50)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Change banner")
            .offset(y: -pull)
        }
        .frame(height: bannerHeight + topInset)
        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .scrollView).minY } action: { bannerOffset = $0 }
        .overlay(alignment: .topTrailing) {
            HStack(spacing: 8) {
                // The inbox for everything a push would have told you about —
                // and the only way to see what you missed once a push has
                // been swiped away.
                bannerButton("bell.fill", label: "Notifications") { showNotifications = true }
                NavigationLink { SettingsView().hidesDock() } label: { bannerIcon("gearshape.fill") }
                    .accessibilityLabel("Settings")
            }
            .padding(.top, topInset + 6)
            .padding(.trailing, 14)
        }
    }

    private func bannerButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: { bannerIcon(icon) }
        .buttonStyle(PressScaleStyle(scale: 0.9))
        .accessibilityLabel(label)
    }

    private func bannerIcon(_ icon: String) -> some View {
        Image(systemName: icon)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 36, height: 36)
            .background(.black.opacity(0.4), in: Circle())
            .background(.ultraThinMaterial, in: Circle())
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let profile {
                StyledName(profile, size: 24, weight: .bold).lineLimit(1)
            } else {
                Text("Loading…").font(.system(size: 24, weight: .bold)).foregroundStyle(Brand.textPrimary)
            }
            HStack(spacing: 5) {
                Text(profile?.handle ?? "user").foregroundStyle(Brand.textPrimary)
                if let pronouns = profile?.pronouns?.trimmingCharacters(in: .whitespaces), !pronouns.isEmpty {
                    Text("•").foregroundStyle(Brand.textMuted)
                    Text(pronouns).foregroundStyle(Brand.textSecondary)
                }
            }
            .font(.system(size: 15))
            if let profile {
                UserBadgesView(profile: profile, size: 20, showsGuildTag: true).padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Button {
                Haptics.tap()
                showEdit = true
            } label: {
                Label("Edit Profile", systemImage: "pencil")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 42)
                    .background(Brand.accent, in: .rect(cornerRadius: 12))
                    .foregroundStyle(.white)
            }
            .buttonStyle(PressScaleStyle())

            Button {
                Haptics.tap()
                showStatus = true
            } label: {
                HStack(spacing: 8) {
                    Circle().fill((ownStatus ?? .online).color).frame(width: 10, height: 10)
                    Text(profile?.activeStatusNote ?? ownStatus?.label ?? "Status")
                        .lineLimit(1)
                }
                .font(.system(size: 15, weight: .semibold))
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(Brand.elevated, in: .rect(cornerRadius: 12))
                .foregroundStyle(Brand.textPrimary)
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Status")
        }
    }

    /// Your streak, friends and spaces at a glance.
    private var statsRow: some View {
        HStack(spacing: 10) {
            statTile(value: StreakService.shared.current, label: "Day streak", icon: "flame.fill",
                     tint: Color(hex: 0xFF7A45))
            statTile(value: friendCount, label: "Friends", icon: "person.2.fill", tint: Brand.accent)
            statTile(value: spaceCount, label: "Spaces", icon: "square.grid.2x2.fill", tint: Color(hex: 0x3BA55C))
        }
    }

    private func statTile(value: Int?, label: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(tint)
            Text(value.map(String.init) ?? "–")
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(Brand.textPrimary)
                .contentTransition(.numericText())
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Brand.surface, in: .rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.white.opacity(0.05)))
        .accessibilityElement(children: .combine)
    }

    /// The inset panel, as on desktop: what you're doing, About Me, Member Since.
    private var panel: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let activity = profile?.activity, activity.isLive() {
                GameActivityCard(activity: activity)
            }
            if let listening = music.current ?? profile?.listening, listening.isCurrent() {
                ListeningCard(listening: listening)
            }

            VStack(alignment: .leading, spacing: 6) {
                DSCaption(text: "About me")
                if let bio = profile?.bio?.trimmingCharacters(in: .whitespacesAndNewlines), !bio.isEmpty {
                    Text(bio)
                        .font(.system(size: 15))
                        .foregroundStyle(Brand.textPrimary.opacity(0.9))
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Button { showEdit = true } label: {
                        Label("Add a few words about yourself", systemImage: "plus.circle.fill")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Brand.accent)
                    }
                    .buttonStyle(.plain)
                }
            }

            if let joined = RelativeTime.date(from: profile?.createdAt) {
                VStack(alignment: .leading, spacing: 6) {
                    DSCaption(text: "Member since")
                    HStack(spacing: 8) {
                        Image("DisbandMark").resizable().scaledToFit()
                            .frame(width: 16, height: 16).opacity(0.85)
                        Text(joined.formatted(.dateTime.day().month(.abbreviated).year()))
                            .font(.system(size: 15))
                            .foregroundStyle(Brand.textPrimary.opacity(0.9))
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.surface, in: .rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.white.opacity(0.05)))
    }

    private func loadCounts() async {
        guard let uid = app.currentUserId else { return }
        let client = SupabaseManager.client
        async let friends = try? client.from("friendships")
            .select("id", head: true, count: .exact)
            .eq("status", value: "accepted")
            .or("requester_id.eq.\(uid),addressee_id.eq.\(uid)")
            .execute().count
        async let spaces = try? client.from("server_members")
            .select("server_id", head: true, count: .exact)
            .eq("user_id", value: uid)
            .execute().count
        let (f, sp) = await (friends, spaces)
        withAnimation(Motion.quick) {
            if let f { friendCount = f }
            if let sp { spaceCount = sp }
        }
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

    /// Aero gets the gold card; Free sees what Aero adds and can buy it.
    ///
    /// This used to end at "Available on disband.dev", because sending an iOS
    /// user to a web checkout for a digital subscription is what guideline
    /// 3.1.1 forbids — the honest way to sell it in the app is In-App
    /// Purchase, which is what the button now opens.
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
            Button {
                Haptics.tap()
                showPaywall = true
            } label: {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles").font(.system(size: 13, weight: .bold))
                        Text("DISBAND AERO").font(.system(size: 12, weight: .heavy)).tracking(1)
                        Spacer()
                        Text("From $2.99")
                            .font(.system(size: 12, weight: .bold))
                            .padding(.horizontal, 10).frame(height: 24)
                            .background(.white.opacity(0.16), in: Capsule())
                    }
                    .foregroundStyle(.white.opacity(0.85))
                    Text("More of everything, for the price of a coffee")
                        .font(.system(size: 20, weight: .heavy))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("500 MB uploads, 1440p streams, animated profiles, every theme and 4 Catalysts a month.")
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 6) {
                        Text("See the plans")
                        Image(systemName: "arrow.right")
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color(hex: 0x2B2290))
                    .padding(.horizontal, 16).frame(height: 38)
                    .background(.white, in: Capsule())
                    .padding(.top, 4)
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    ZStack {
                        LinearGradient(colors: [Color(hex: 0x4B43E0), Color(hex: 0x33299F)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        RadialGradient(colors: [Color(hex: 0xE055FF, alpha: 0.4), .clear], center: .topTrailing, startRadius: 0, endRadius: 220)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    private var aeroDetail: String {
        guard let row = subscriptions.subscription else { return "Active" }
        // Where to fix a failed payment depends on who is billing. Sending an
        // App Store subscriber to the web billing page is a dead end: there is
        // no Stripe customer behind it, and only Apple can take a new card.
        if row.status == "past_due" {
            return row.isApple
                ? "Payment issue — update your Apple Account payment method"
                : "Payment issue — update your card on the web"
        }
        if let end = RelativeTime.date(from: row.currentPeriodEnd) {
            return "Active · renews \(end.formatted(date: .abbreviated, time: .omitted))"
        }
        return "Active"
    }

    private func upload(_ item: PhotosPickerItem, banner: Bool) async {
        uploading = true
        defer { uploading = false; if banner { bannerItem = nil } else { avatarItem = nil } }
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            uploadError = "Couldn't read that image. Try picking a different one."
            return
        }
        let result: MediaUploadResult
        do {
            result = try await MediaService.uploadImage(data)
        } catch {
            uploadError = "Couldn't upload that image. Check your connection and try again."
            return
        }
        let patch = banner
            ? DatabaseService.ProfilePatch(bannerUrl: result.url)
            : DatabaseService.ProfilePatch(avatarUrl: result.url)
        // The database enforces a 60-second cooldown and a daily banner limit.
        // Swallowing this return made the picker close with the old picture
        // still in place and no explanation.
        if let error = await app.saveProfile(patch) {
            uploadError = error
        }
    }
}

struct EditProfileSheet: View {
    @Environment(AppState.self) private var app
    @Environment(PresenceService.self) private var presence
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var username = ""
    @State private var bio = ""
    @State private var pronouns = ""
    @State private var accent: String?
    @State private var accent2: String?
    @State private var nameStyle = NameStyle()
    @State private var showPaywall = false
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
                Section {
                    fontPicker
                } header: {
                    Text("Name font")
                } footer: {
                    Text("Shows everywhere your name does, on every device.")
                }
                nameColourSection
                Section {
                    swatches(selection: $accent)
                    ColorPicker("Custom colour", selection: colourBinding($accent, fallback: Brand.accent),
                                supportsOpacity: false)
                } header: {
                    Text("Profile colour")
                }
                Section {
                    swatches(selection: $accent2)
                    ColorPicker("Custom colour", selection: colourBinding($accent2, fallback: Brand.accentSoft),
                                supportsOpacity: false)
                } header: {
                    Text("Second profile colour")
                } footer: {
                    Text("Your banner and avatar ring blend between the two.")
                }
                Section {
                    Button("Reset profile colours") {
                        accent = nil
                        accent2 = nil
                    }
                    .foregroundStyle(Brand.dnd)
                }
                Section {
                    NavigationLink {
                        BadgeSettingsView()
                    } label: {
                        Label("Badges", systemImage: "rosette")
                    }
                } footer: {
                    Text("Choose which of your badges show beside your name.")
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
                if let profile = app.profile { nameStyle = NameStyle(profile) }
            }
            .sheet(isPresented: $showPaywall) { AeroPaywallSheet() }
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
                        StyledName(text: displayName.isEmpty ? profile.handle : displayName,
                                   style: previewStyle, size: 17)
                            .lineLimit(1)
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

    private var isAero: Bool { subscriptions.plan == .aero }

    /// What the preview shows: colours only count with Aero, as when saved.
    private var previewStyle: NameStyle {
        isAero ? nameStyle : NameStyle(font: nameStyle.font)
    }

    /// Every font, each label drawn in its own face.
    private var fontPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(NameFont.allCases.filter { $0.isOffered || $0 == nameStyle.font }) { font in
                    let selected = nameStyle.font == font
                    Button { nameStyle.font = font } label: {
                        Text(font.label)
                            .font(font.font(size: 17) ?? .system(size: 15, weight: .semibold))
                            .foregroundStyle(selected ? .white : Brand.textPrimary)
                            .padding(.horizontal, 14)
                            .frame(height: 40)
                            .background(selected ? Brand.accent : Brand.elevated, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.vertical, 6)
        }
    }

    @ViewBuilder private var nameColourSection: some View {
        Section {
            if isAero {
                ColorPicker("Colour", selection: colourBinding($nameStyle.color, fallback: .white),
                            supportsOpacity: false)
                ColorPicker("Gradient to", selection: colourBinding($nameStyle.color2, fallback: Brand.accent),
                            supportsOpacity: false)
                if nameStyle.color2 != nil {
                    Picker("Direction", selection: Binding(
                        get: { nameStyle.direction ?? "135deg" },
                        set: { nameStyle.direction = $0 })) {
                        Text("→").tag("90deg")
                        Text("↘").tag("135deg")
                        Text("↓").tag("180deg")
                        Text("↗").tag("45deg")
                    }
                    .pickerStyle(.segmented)
                }
                if nameStyle.color != nil || nameStyle.color2 != nil {
                    Button("Use the default colour") {
                        nameStyle.color = nil
                        nameStyle.color2 = nil
                        nameStyle.direction = nil
                    }
                    .foregroundStyle(Brand.dnd)
                }
            } else {
                Button { showPaywall = true } label: {
                    HStack {
                        Label("Colour and gradient names", systemImage: "lock.fill")
                            .foregroundStyle(Brand.textPrimary)
                        Spacer()
                        Text("AERO")
                            .font(.caption2.weight(.heavy))
                            .padding(.horizontal, 8).frame(height: 20)
                            .background(SubscriptionPlan.aeroGold.opacity(0.2), in: Capsule())
                            .foregroundStyle(SubscriptionPlan.aeroGold)
                    }
                }
            }
        } header: {
            Text("Name colour")
        } footer: {
            Text(isAero ? "Pick one colour, or two for a gradient." : "Give your name a colour or a gradient with Disband Aero.")
        }
    }

    /// A colour well bound to a stored "#rrggbb", which stays nil until a
    /// colour is actually picked.
    private func colourBinding(_ hex: Binding<String?>, fallback: Color) -> Binding<Color> {
        Binding(
            get: { Color(hexString: hex.wrappedValue) ?? fallback },
            set: { hex.wrappedValue = $0.hexString }
        )
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

            if let error = await app.saveProfile(.init(
                displayName: displayName.trimmingCharacters(in: .whitespaces),
                bio: bio.trimmingCharacters(in: .whitespaces))) {
                saveError = error
                busy = false
                return
            }
            do {
                // Saved on their own because both can be cleared, and the
                // shared patch can't send a null.
                try await ProfileService.updateAccent(color1: accent, color2: accent2)
                try await ProfileService.updateNameStyle(nameStyle, aero: isAero)
            } catch {
                saveError = "Couldn't save your profile style. Try again."
                busy = false
                return
            }
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
