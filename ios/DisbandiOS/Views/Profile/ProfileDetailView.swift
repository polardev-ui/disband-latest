import SwiftUI

/// A read-only view of another user's profile, presented as a sheet from
/// anywhere a user appears (chat, DM list, friends, server members).
struct ProfileDetailView: View {
    let profile: Profile
    /// Called when the viewer taps "Message" — the presenter handles navigation.
    var onStartDM: ((Profile) -> Void)? = nil

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var relation: FriendshipStatus?
    @State private var working = false
    @State private var error: String?

    private var isSelf: Bool { profile.id == app.currentUserId }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    banner
                    VStack(alignment: .leading, spacing: 16) {
                        header
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
        }
        .presentationDetents([.large])
        .task { await loadRelation() }
    }

    private var banner: some View {
        ZStack(alignment: .bottomLeading) {
            RemoteImage(url: profile.bannerUrl, contentMode: .fill) { accentGradient }
            .frame(height: 140)
            .frame(maxWidth: .infinity)
            .clipped()

            AvatarView(url: profile.avatarUrl, name: profile.name, size: 88,
                       status: profile.status, ringColors: accentColors, ringWidth: 5)
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
            HStack(spacing: 8) {
                Text(profile.name).font(.title2.bold()).foregroundStyle(Brand.textPrimary)
                if profile.showOwnerBadge == true {
                    Image(systemName: "crown.fill").foregroundStyle(Brand.idle).font(.caption)
                }
                if profile.showStaffBadge == true {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(Brand.accent).font(.caption)
                }
            }
            Text("@\(profile.handle)").font(.subheadline).foregroundStyle(Brand.textMuted)
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
                onStartDM?(profile)
                dismiss()
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
        guard let uid = app.currentUserId, !isSelf else { return }
        let all = (try? await DatabaseService.friendships(currentUserId: uid)) ?? []
        relation = all.first { f in
            (f.requesterId == uid && f.addresseeId == profile.id) ||
            (f.requesterId == profile.id && f.addresseeId == uid)
        }?.status
    }

    private func run(_ op: @escaping () async throws -> Void) async {
        guard let _ = app.currentUserId else { return }
        working = true; error = nil
        do { try await op(); await loadRelation() }
        catch { self.error = error.localizedDescription }
        working = false
    }

    private func addFriend() async {
        guard let uid = app.currentUserId else { return }
        await run { try await DatabaseService.sendFriendRequest(from: uid, to: profile.id) }
    }
    private func unfriend() async {
        guard let uid = app.currentUserId else { return }
        await run { try await DatabaseService.removeFriend(currentUserId: uid, otherUserId: profile.id) }
    }
    private func block() async {
        await run { try await DatabaseService.blockUser(profile.id) }
    }
    private func unblock() async {
        await run { try await DatabaseService.unblockUser(profile.id) }
    }
}
