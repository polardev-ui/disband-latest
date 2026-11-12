import Supabase
import SwiftUI
import UIKit

/// Someone's profile, as the desktop's profile popout: the banner, the avatar
/// sitting on its edge with a ring, quick actions beside it, and one inset
/// panel holding the name, badges, About Me, Member Since, what they're
/// playing or listening to, and a "Message @them" field that sends straight
/// to their DMs. Opens at half height; drag up for the rest.
struct ProfileDetailView: View {
    let profile: Profile
    /// The signed-in user, handed in by the presenter.
    ///
    /// SwiftUI on Mac (Designed for iPad) does not propagate environment
    /// values into `.sheet` content (FB16112395). A required
    /// `@Environment(AppState.self)` therefore trapped inside SwiftUI while
    /// this sheet was being presented — the bot-profile crash. Passing the
    /// values this view needs keeps the sheet independent of the sheet's
    /// environment; `\.dismiss` is the only environment value read here, and
    /// it always exists.
    var viewerId: String?
    /// Live presence for the profile's status dot, owned by AppState.
    var presence: PresenceService?
    /// Called when the viewer taps "Message" — the presenter handles navigation.
    var onStartDM: ((Profile) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var relation: FriendshipStatus?
    @State private var working = false
    @State private var error: String?
    @State private var notice: String?
    /// The DM opened from here when no presenter handles it (e.g. a profile
    /// opened from a space's chat), shown inside this sheet's stack.
    @State private var openedDm: ChatSource?
    /// The whole profile row. Whoever opened this sheet usually holds a
    /// trimmed copy (a chat author has no music or game fields), so the full
    /// one is fetched, and refreshed while the sheet is open so a track
    /// change shows up.
    @State private var full: Profile?
    @State private var draft = ""
    @State private var sending = false
    @FocusState private var messageFocused: Bool

    private var shown: Profile { full ?? profile }
    private var isSelf: Bool { profile.id == viewerId }
    private var isBot: Bool { shown.isBot == true }

    /// Live presence for this profile. The current user's own status is read
    /// from the presence channel too (falling back to their stored status only
    /// while the socket is still joining), so it reflects reality — auto-away,
    /// DND picked on another device, or offline when the socket dies — instead
    /// of a stale `profiles.status` column.
    private var liveStatus: UserStatus {
        presence?.status(for: profile.id, fallback: isSelf ? profile.status : .offline) ?? (isSelf ? profile.status : .offline)
    }

    private var bannerHeight: CGFloat { shown.bannerUrl == nil ? 72 : 124 }
    private let avatarSize: CGFloat = 84
    private let ringWidth: CGFloat = 6

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    top
                    panel
                        .padding(.horizontal, 14)
                        .padding(.top, 12)
                        .padding(.bottom, 28)
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
            .background(Brand.surface)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $openedDm) { source in
                ChatView(source: source, callPeer: profile)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(24)
        .presentationBackground(Brand.surface)
        .task { await loadRelation() }
        .task(id: profile.id) {
            while !Task.isCancelled {
                if let fresh = try? await DatabaseService.profile(id: profile.id) { full = fresh }
                try? await Task.sleep(nanoseconds: 20_000_000_000)
            }
        }
    }

    // MARK: - Banner, avatar, quick actions

    private var top: some View {
        VStack(spacing: 0) {
            BannerImage(url: shown.bannerUrl, height: bannerHeight) { accentGradient }
            HStack(spacing: 8) {
                Spacer(minLength: avatarSize + ringWidth * 2 + 24)
                quickActions
            }
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .frame(minHeight: 52, alignment: .top)
        }
        .overlay(alignment: .topLeading) {
            AvatarView(url: shown.avatarUrl, name: shown.name, size: avatarSize,
                       status: liveStatus, ringColors: accentColors, ringWidth: 4,
                       decoration: shown.equippedRingEffect)
                .padding(ringWidth)
                .background(Circle().fill(Brand.surface))
                .padding(.leading, 12)
                .padding(.top, bannerHeight - (avatarSize + ringWidth * 2) / 2)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder private var quickActions: some View {
        if !isSelf {
            if relation == nil && !isBot {
                roundButton("person.fill.badge.plus", label: "Add Friend") { Task { await addFriend() } }
            }
            Menu {
                Button { Task { await startDm() } } label: { Label("Message", systemImage: "bubble.left") }
                if let handle = shown.username {
                    Button {
                        UIPasteboard.general.string = handle
                        Haptics.success()
                        notice = "Username copied."
                    } label: { Label("Copy Username", systemImage: "doc.on.doc") }
                }
                Divider()
                switch relation {
                case .accepted:
                    Button(role: .destructive) { Task { await unfriend() } } label: {
                        Label("Remove Friend", systemImage: "person.fill.xmark")
                    }
                case .blocked:
                    Button { Task { await unblock() } } label: { Label("Unblock", systemImage: "hand.raised.slash") }
                default:
                    EmptyView()
                }
                if relation != .blocked {
                    Button(role: .destructive) { Task { await block() } } label: {
                        Label("Block", systemImage: "hand.raised.fill")
                    }
                }
            } label: {
                roundIcon("ellipsis")
            }
            .accessibilityLabel("More")
        }
    }

    private func roundButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: { roundIcon(icon) }
        .buttonStyle(PressScaleStyle(scale: 0.9))
        .disabled(working)
        .accessibilityLabel(label)
    }

    private func roundIcon(_ icon: String) -> some View {
        Image(systemName: icon)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Brand.textPrimary)
            .frame(width: 36, height: 36)
            .background(Brand.elevated, in: Circle())
    }

    private var accentColors: [Color] {
        [Color(hexString: shown.accentColor) ?? Brand.accent,
         Color(hexString: shown.accentColor2) ?? Brand.accentSoft]
    }

    private var accentGradient: some View {
        LinearGradient(colors: accentColors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    // MARK: - Panel

    private var panel: some View {
        VStack(alignment: .leading, spacing: 0) {
            identity

            Rectangle().fill(Brand.divider).frame(height: 1).padding(.vertical, 12)

            VStack(alignment: .leading, spacing: 14) {
                if let bio = shown.bio?.trimmingCharacters(in: .whitespacesAndNewlines), !bio.isEmpty {
                    section("About Me") {
                        Text(bio)
                            .font(.system(size: 15))
                            .foregroundStyle(Brand.textPrimary.opacity(0.9))
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }
                }
                if let since = memberSince {
                    section("Member Since") {
                        HStack(spacing: 8) {
                            Image("DisbandMark")
                                .resizable().scaledToFit()
                                .frame(width: 16, height: 16)
                                .opacity(0.85)
                            Text(since)
                                .font(.system(size: 15))
                                .foregroundStyle(Brand.textPrimary.opacity(0.9))
                        }
                    }
                }
                if let activity = shown.activity, activity.isLive() {
                    GameActivityCard(activity: activity)
                }
                if let listening = shown.listening, listening.isCurrent() {
                    ListeningCard(listening: listening)
                }

                if !isSelf { messageArea }
                if isBot { AuthorizeAppButton(userId: shown.id, viewerId: viewerId) }

                if let error {
                    Text(error).font(.system(size: 13)).foregroundStyle(Brand.dnd)
                } else if let notice {
                    Text(notice).font(.system(size: 13)).foregroundStyle(Brand.textMuted)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.background, in: .rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.white.opacity(0.06)))
        .animation(Motion.quick, value: error)
        .animation(Motion.quick, value: notice)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                StyledName(shown, size: 22, weight: .bold)
                    .lineLimit(1)
                if isBot { AppTag() }
            }
            HStack(spacing: 5) {
                if let handle = shown.username { Text(handle) }
                if let pronouns = shown.pronouns?.trimmingCharacters(in: .whitespaces), !pronouns.isEmpty {
                    Text("•").foregroundStyle(Brand.textMuted)
                    Text(pronouns).foregroundStyle(Brand.textSecondary)
                }
            }
            .font(.system(size: 14))
            .foregroundStyle(Brand.textPrimary)
            UserBadgesView(profile: shown, size: 20, showsGuildTag: true)
                .padding(.top, 4)
            if let note = shown.activeStatusNote {
                Text(note)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.textPrimary.opacity(0.9))
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            DSCaption(text: title)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// "Message @them", sent straight to their DMs, then the DM opens. People
    /// you can't message yet (no friendship, no shared space) get the friend
    /// request button instead, as on desktop.
    @ViewBuilder private var messageArea: some View {
        if relation == .blocked {
            EmptyView()
        } else if relation == .pending {
            Text("Friend request pending")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.textMuted)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(Brand.elevated, in: .rect(cornerRadius: 12))
        } else {
            HStack(spacing: 8) {
                TextField("Message @\(shown.username ?? shown.name)", text: $draft)
                    .font(.system(size: 15))
                    .foregroundStyle(Brand.textPrimary)
                    .focused($messageFocused)
                    .submitLabel(.send)
                    .onSubmit { Task { await sendQuick() } }
                if sending {
                    LoadingDots(color: Brand.textMuted, size: 5)
                } else if !draft.trimmingCharacters(in: .whitespaces).isEmpty {
                    Button { Task { await sendQuick() } } label: {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(Brand.accent, in: .rect(cornerRadius: 8))
                    }
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityLabel("Send")
                }
            }
            .padding(.leading, 12)
            .padding(.trailing, 6)
            .frame(height: 44)
            .background(Brand.elevated, in: .rect(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12)
                .strokeBorder(messageFocused ? Brand.accent : Color.white.opacity(0.06), lineWidth: messageFocused ? 1.5 : 1))
            .animation(Motion.quick, value: messageFocused)
            .animation(Motion.quick, value: draft.isEmpty)
        }
    }

    private var memberSince: String? {
        guard let date = RelativeTime.date(from: shown.createdAt) else { return nil }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    // MARK: - Actions

    private func loadRelation() async {
        guard let uid = viewerId, !isSelf else { return }
        let all = (try? await DatabaseService.friendships(currentUserId: uid)) ?? []
        relation = all.first { f in
            (f.requesterId == uid && f.addresseeId == profile.id) ||
            (f.requesterId == profile.id && f.addresseeId == uid)
        }?.status
    }

    private func sendQuick() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending, let uid = viewerId else { return }
        sending = true; error = nil
        defer { sending = false }
        do {
            let threadId = try await DatabaseService.getOrCreateDmThread(friendId: profile.id)
            _ = try await DatabaseService.sendDmMessage(threadId: threadId, authorId: uid, content: text)
            draft = ""
            Haptics.success()
            if let onStartDM {
                onStartDM(profile)
                dismiss()
            } else {
                openedDm = .dm(threadId: threadId, title: profile.name)
            }
        } catch {
            self.error = (error as? PostgrestError)?.message ?? error.localizedDescription
        }
    }

    /// Opens the DM, or explains why not (not friends and no shared space,
    /// or they've turned message requests off). Never navigates on failure.
    private func startDm() async {
        error = nil
        do {
            let threadId = try await DatabaseService.getOrCreateDmThread(friendId: profile.id)
            if let onStartDM {
                onStartDM(profile)
                dismiss()
            } else {
                openedDm = .dm(threadId: threadId, title: profile.name)
            }
        } catch {
            self.error = (error as? PostgrestError)?.message ?? error.localizedDescription
        }
    }

    private func run(_ success: String? = nil, _ op: @escaping () async throws -> Void) async {
        guard viewerId != nil else { return }
        working = true; error = nil; notice = nil
        do {
            try await op()
            await loadRelation()
            if let success { notice = success; Haptics.success() }
        } catch { self.error = error.localizedDescription }
        working = false
    }

    private func addFriend() async {
        guard let uid = viewerId else { return }
        await run("Friend request sent.") { try await DatabaseService.sendFriendRequest(from: uid, to: profile.id) }
    }
    private func unfriend() async {
        guard let uid = viewerId else { return }
        await run("Removed from your friends.") { try await DatabaseService.removeFriend(currentUserId: uid, otherUserId: profile.id) }
    }
    private func block() async {
        await run("Blocked.") { try await DatabaseService.blockUser(profile.id) }
    }
    private func unblock() async {
        await run("Unblocked.") { try await DatabaseService.unblockUser(profile.id) }
    }
}
