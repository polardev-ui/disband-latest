import Supabase
import SwiftUI

/// A read-only view of another user's profile, presented as a sheet from
/// anywhere a user appears (chat, DM list, friends, server members).
struct ProfileDetailView: View {
    let profile: Profile
    /// The signed-in user, handed in by the presenter.
    ///
    /// SwiftUI on Mac (Designed for iPad) does not propagate environment
    /// values into `.sheet` content (FB16112395). A required
    /// `@Environment(AppState.self)` therefore trapped inside SwiftUI while
    /// this sheet was being presented — the bot-profile crash. Passing the
    /// two values this view needs keeps the sheet independent of the sheet's
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
    /// The DM opened from here when no presenter handles it (e.g. a profile
    /// opened from a space's chat), shown inside this sheet's stack.
    @State private var openedDm: ChatSource?
    /// The whole profile row. Whoever opened this sheet usually holds a
    /// trimmed copy (a chat author has no music or game fields), so the full
    /// one is fetched, and refreshed while the sheet is open so a track
    /// change shows up.
    @State private var full: Profile?

    private var shown: Profile { full ?? profile }

    private var isSelf: Bool { profile.id == viewerId }

    /// Live presence for this profile. The current user's own status is read
    /// from the presence channel too (falling back to their stored status only
    /// while the socket is still joining), so it reflects reality — auto-away,
    /// DND picked on another device, or offline when the socket dies — instead
    /// of a stale `profiles.status` column.
    private var liveStatus: UserStatus {
        presence?.status(for: profile.id, fallback: isSelf ? profile.status : .offline) ?? (isSelf ? profile.status : .offline)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    banner
                    VStack(alignment: .leading, spacing: 16) {
                        header
                        if let activity = shown.activity, activity.isLive() {
                            GameActivityCard(activity: activity)
                        }
                        if let listening = shown.listening, listening.isCurrent() {
                            ListeningCard(listening: listening)
                        }
                        if let bio = profile.bio, !bio.isEmpty {
                            section("About Me", body: bio)
                        }
                        if !isSelf { actions }
                        if let error {
                            Text(error).font(.footnote).foregroundStyle(Brand.dnd)
                        }
                    }
                    .padding(20)
                }
            }
            .background(Brand.background)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $openedDm) { source in
                ChatView(source: source, callPeer: profile)
            }
        }
        .presentationDetents([.large])
        .task { await loadRelation() }
        .task(id: profile.id) {
            while !Task.isCancelled {
                if let fresh = try? await DatabaseService.profile(id: profile.id) { full = fresh }
                try? await Task.sleep(nanoseconds: 20_000_000_000)
            }
        }
    }

    private var banner: some View {
        ZStack(alignment: .bottomLeading) {
            BannerImage(url: profile.bannerUrl, height: 140) { accentGradient }

            AvatarView(url: profile.avatarUrl, name: profile.name, size: 88,
                       status: liveStatus, ringColors: accentColors, ringWidth: 5,
                       decoration: profile.equippedRingEffect)
                .background(Circle().fill(Brand.background).padding(-3))
                .padding(.leading, 18)
                .offset(y: 44)
        }
        .padding(.bottom, 44)
    }

    private var accentColors: [Color] {
        [Color(hexString: profile.accentColor) ?? Brand.accent,
         Color(hexString: profile.accentColor2) ?? Brand.accentSoft]
    }

    private var accentGradient: some View {
        LinearGradient(colors: accentColors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            StyledName(shown, size: 22, weight: .bold)
            HStack(spacing: 6) {
                Text("@\(profile.handle)")
                if let pronouns = profile.pronouns, !pronouns.isEmpty {
                    Text("·")
                    Text(pronouns)
                }
            }
            .font(.subheadline)
            .foregroundStyle(Brand.textMuted)
            if let note = profile.activeStatusNote {
                Text(note)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Brand.textPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.top, 8)
            }
            // On its own line, with the full width to wrap into. Beside the
            // name it had whatever the name left over, which on a long name was
            // room for about two badges.
            UserBadgesView(profile: profile, size: 15, showsGuildTag: true)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func section(_ title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(Brand.textMuted)
            Text(body).foregroundStyle(Brand.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Brand.surface, in: .rect(cornerRadius: 14))
    }

    @ViewBuilder private var actions: some View {
        VStack(spacing: 10) {
            Button {
                Task { await startDm() }
            } label: {
                Label("Message", systemImage: "bubble.left.fill")
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(Brand.accent, in: .rect(cornerRadius: 12))
                    .foregroundStyle(.white)
            }

            switch relation {
            case .accepted:
                Button(role: .destructive) { Task { await unfriend() } } label: {
                    actionLabel("Remove Friend", "person.fill.xmark")
                }
            case .pending:
                Text("Friend request pending")
                    .font(.subheadline).foregroundStyle(Brand.textMuted)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(Brand.surface, in: .rect(cornerRadius: 12))
            case .blocked:
                Button { Task { await unblock() } } label: {
                    actionLabel("Unblock", "hand.raised.slash")
                }
            default:
                Button { Task { await addFriend() } } label: {
                    Label("Add Friend", systemImage: "person.fill.badge.plus")
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Brand.surface, in: .rect(cornerRadius: 12))
                        .foregroundStyle(Brand.textPrimary)
                }
            }

            if relation != .blocked {
                Button(role: .destructive) { Task { await block() } } label: {
                    actionLabel("Block", "hand.raised.fill")
                }
            }
        }
        .disabled(working)
    }

    private func actionLabel(_ title: String, _ icon: String) -> some View {
        Label(title, systemImage: icon)
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(Brand.surface, in: .rect(cornerRadius: 12))
            .foregroundStyle(Brand.dnd)
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

    private func run(_ op: @escaping () async throws -> Void) async {
        guard let _ = viewerId else { return }
        working = true; error = nil
        do { try await op(); await loadRelation() }
        catch { self.error = error.localizedDescription }
        working = false
    }

    private func addFriend() async {
        guard let uid = viewerId else { return }
        await run { try await DatabaseService.sendFriendRequest(from: uid, to: profile.id) }
    }
    private func unfriend() async {
        guard let uid = viewerId else { return }
        await run { try await DatabaseService.removeFriend(currentUserId: uid, otherUserId: profile.id) }
    }
    private func block() async {
        await run { try await DatabaseService.blockUser(profile.id) }
    }
    private func unblock() async {
        await run { try await DatabaseService.unblockUser(profile.id) }
    }
}
