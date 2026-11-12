import Supabase
import SwiftUI

/*
 Adding an app (bot) to a space, as on desktop: "Authorize App" on a bot's
 profile, or on the card a bot invite link (disband.dev/bot-invite/<code>)
 turns into in chat, opens a sheet where you pick a space, see what the app
 will be able to do, and approve. The same web routes as desktop:
 GET /api/bot/invites/<code>, POST /api/bot/invites/<code>/approve.
*/

struct BotInvite: Decodable, Equatable {
    struct Bot: Decodable, Equatable {
        let id: String
        let userId: String
        let name: String
        let avatarUrl: String?
        enum CodingKeys: String, CodingKey { case id, name; case userId = "user_id"; case avatarUrl = "avatar_url" }
    }
    let code: String
    let status: String
    let scopes: [String]
    let bot: Bot
    let server: BotSpace?

    var usable: Bool { status == "pending" }
}

struct BotSpace: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let iconUrl: String?
    let ownerId: String
    enum CodingKeys: String, CodingKey { case id, name; case iconUrl = "icon_url"; case ownerId = "owner_id" }
}

enum BotInviteAPI {
    static func invite(code: String) async throws -> BotInvite {
        let data = try await StaffAPI.request("/api/bot/invites/\(code)")
        return try JSONDecoder().decode(BotInvite.self, from: data)
    }

    static func approve(code: String, serverId: String?) async throws {
        _ = try await StaffAPI.request("/api/bot/invites/\(code)/approve", method: "POST",
                                       body: serverId.map { ["serverId": $0] })
    }

    /// The bot's public install link, if its developer made one.
    static func publicCode(userId: String) async -> String? {
        let code: String? = try? await SupabaseManager.client
            .rpc("public_bot_install_code", params: ["p_user_id": userId]).execute().value
        return code?.isEmpty == false ? code : nil
    }

    /// Your spaces, owners' and admins' first (they're the ones who can add apps).
    static func spaces(userId: String) async -> [BotSpace] {
        struct Membership: Decodable { let server_id: String; let role: String? }
        let rows: [Membership] = (try? await SupabaseManager.client.from("server_members")
            .select("server_id, role").eq("user_id", value: userId).limit(500).execute().value) ?? []
        guard !rows.isEmpty else { return [] }
        let roles = Dictionary(rows.map { ($0.server_id, $0.role ?? "") }, uniquingKeysWith: { a, _ in a })
        let servers: [BotSpace] = (try? await SupabaseManager.client.from("servers")
            .select("id, name, icon_url, owner_id").in("id", values: Array(roles.keys)).execute().value) ?? []
        func canAdd(_ s: BotSpace) -> Bool { s.ownerId == userId || roles[s.id] == "admin" }
        return servers.sorted {
            canAdd($0) != canAdd($1) ? canAdd($0) : $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    static let scopeLabels: [String: (label: String, detail: String)] = [
        "messages.read": ("Read messages", "Receive message events and read messages and channels."),
        "messages.write": ("Post messages", "Send and reply to messages."),
        "messages.delete": ("Delete messages", "Delete messages the bot can see."),
        "messages.react": ("Add reactions", "Add and remove reactions on messages."),
        "members.read": ("Read members", "See the member list of spaces the bot has joined."),
        "members.kick": ("Kick members", "Remove members from a space. Never the owner, moderators or other bots."),
        "members.ban": ("Ban members", "Ban members from a space. Never the owner, moderators or other bots."),
        "members.timeout": ("Time out members", "Stop a member chatting for up to 28 days."),
        "channels.read": ("Read channels", "List channels and categories."),
        "channels.manage": ("Manage channels", "Create, edit, reorder and delete channels and categories."),
        "webhooks.manage": ("Manage webhooks", "Create, edit and delete webhooks."),
        "roles.manage": ("Manage roles", "Create, edit and hand out roles below its own."),
        "servers.read": ("Read space info", "Read a space's name, description, icon and member count."),
        "audit.read": ("Read audit log", "Read recent moderation and management actions in a space."),
    ]
}

/// "Authorize App" on a bot's profile. Shows nothing for bots without a
/// public install link.
struct AuthorizeAppButton: View {
    let userId: String
    var viewerId: String?

    @State private var code: String?
    @State private var open = false

    var body: some View {
        Group {
            if code != nil {
                DSPrimaryButton(title: "Authorize App") { open = true }
                    .transition(.opacity)
            }
        }
        .task(id: userId) { code = await BotInviteAPI.publicCode(userId: userId) }
        .sheet(isPresented: $open) {
            if let code { BotAuthorizeSheet(code: code, viewerId: viewerId) }
        }
    }
}

/// The card a bot invite link becomes in chat.
struct BotInviteCard: View {
    let code: String

    @Environment(AppState.self) private var app

    @State private var invite: BotInvite?
    @State private var loaded = false
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            DSCaption(text: "Add an app to your space")
            if let invite {
                HStack(spacing: 12) {
                    AvatarView(url: invite.bot.avatarUrl, name: invite.bot.name, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(invite.bot.name)
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(Brand.textPrimary)
                                .lineLimit(1)
                            AppTag()
                        }
                        Text(invite.server.map { "For \($0.name)" }
                             ?? "\(invite.scopes.count) permission\(invite.scopes.count == 1 ? "" : "s")")
                            .font(.system(size: 13))
                            .foregroundStyle(Brand.textMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Button {
                        Haptics.tap()
                        open = true
                    } label: {
                        Text(invite.usable ? "Authorize" : "Used")
                            .font(.system(size: 14, weight: .semibold))
                            .padding(.horizontal, 14)
                            .frame(height: 36)
                            .background(invite.usable ? Brand.accent : Brand.elevated, in: .rect(cornerRadius: 10))
                            .foregroundStyle(invite.usable ? .white : Brand.textMuted)
                    }
                    .buttonStyle(PressScaleStyle())
                    .disabled(!invite.usable)
                }
            } else if loaded {
                Text("This bot invite doesn't work any more.")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.textMuted)
            } else {
                RoundedRectangle(cornerRadius: 8).fill(Brand.elevated).frame(height: 44)
            }
        }
        .padding(14)
        .frame(maxWidth: 360, alignment: .leading)
        .background(Brand.surface, in: .rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.white.opacity(0.06)))
        .task(id: code) {
            invite = try? await BotInviteAPI.invite(code: code)
            loaded = true
        }
        .sheet(isPresented: $open) { BotAuthorizeSheet(code: code, viewerId: app.currentUserId) }
    }
}

/// Pick a space, review the permissions, approve.
struct BotAuthorizeSheet: View {
    let code: String
    var viewerId: String?

    @Environment(\.dismiss) private var dismiss
    @State private var invite: BotInvite?
    @State private var loadError: String?
    @State private var spaces: [BotSpace]?
    @State private var spaceId: String?
    @State private var busy = false
    @State private var error: String?
    @State private var addedTo: String?

    private var fixedSpace: BotSpace? { invite?.server }
    private var chosen: BotSpace? { fixedSpace ?? spaces?.first { $0.id == spaceId } }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if let addedTo, let invite {
                    done(invite, space: addedTo)
                } else if let invite {
                    header(invite)
                    spacePicker
                    permissions(invite)
                    VStack(spacing: 10) {
                        if let error {
                            Text(error).font(.system(size: 13)).foregroundStyle(Brand.dnd)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        DSPrimaryButton(title: invite.usable ? "Authorize" : "This invite has been used",
                                        busy: busy, disabled: !invite.usable || chosen == nil) {
                            Task { await authorize() }
                        }
                        Button("Cancel") { dismiss() }
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Brand.textMuted)
                            .padding(.top, 2)
                    }
                } else if let loadError {
                    Text(loadError).font(.system(size: 15)).foregroundStyle(Brand.textMuted)
                        .multilineTextAlignment(.center).padding(.top, 60)
                } else {
                    LoadingDots(color: Brand.textMuted, size: 8).padding(.top, 80)
                }
            }
            .padding(20)
        }
        .background(Brand.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Brand.background)
        .task { await load() }
    }

    private func header(_ invite: BotInvite) -> some View {
        VStack(spacing: 10) {
            AvatarView(url: invite.bot.avatarUrl, name: invite.bot.name, size: 76)
                .riseIn()
            HStack(spacing: 6) {
                Text(invite.bot.name).font(.system(size: 22, weight: .bold)).foregroundStyle(Brand.textPrimary)
                AppTag()
            }
            Text("wants to join a space of yours")
                .font(.system(size: 15))
                .foregroundStyle(Brand.textMuted)
        }
        .padding(.top, 8)
    }

    @ViewBuilder private var spacePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            DSCaption(text: "Add to space")
            if let fixedSpace {
                spaceRow(fixedSpace, chevron: false)
            } else if let spaces {
                if spaces.isEmpty {
                    Text("You aren't in any spaces yet.")
                        .font(.system(size: 14)).foregroundStyle(Brand.textMuted)
                } else {
                    Menu {
                        ForEach(spaces) { space in
                            Button {
                                spaceId = space.id
                                Haptics.select()
                            } label: {
                                if space.id == spaceId { Label(space.name, systemImage: "checkmark") } else { Text(space.name) }
                            }
                        }
                    } label: {
                        if let chosen { spaceRow(chosen, chevron: true) } else {
                            HStack {
                                Text("Pick a space").font(.system(size: 15)).foregroundStyle(Brand.textMuted)
                                Spacer()
                                Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold)).foregroundStyle(Brand.textMuted)
                            }
                            .padding(.horizontal, 12)
                            .frame(height: 50)
                            .background(Brand.surface, in: .rect(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.white.opacity(0.06)))
                        }
                    }
                }
            } else {
                RoundedRectangle(cornerRadius: 12).fill(Brand.surface).frame(height: 50)
            }
        }
    }

    private func spaceRow(_ space: BotSpace, chevron: Bool) -> some View {
        HStack(spacing: 12) {
            AvatarView(url: space.iconUrl, name: space.name, size: 30)
            Text(space.name).font(.system(size: 15, weight: .medium)).foregroundStyle(Brand.textPrimary).lineLimit(1)
            Spacer()
            if chevron {
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(Brand.textMuted)
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 50)
        .background(Brand.surface, in: .rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.white.opacity(0.06)))
    }

    private func permissions(_ invite: BotInvite) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            DSCaption(text: "It will be able to")
            VStack(spacing: 0) {
                ForEach(Array(invite.scopes.enumerated()), id: \.offset) { index, scope in
                    let info = BotInviteAPI.scopeLabels[scope]
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 17))
                            .foregroundStyle(Brand.online)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(info?.label ?? scope).font(.system(size: 15, weight: .medium)).foregroundStyle(Brand.textPrimary)
                            if let detail = info?.detail {
                                Text(detail).font(.system(size: 13)).foregroundStyle(Brand.textMuted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    if index < invite.scopes.count - 1 {
                        Rectangle().fill(Brand.divider).frame(height: 0.5).padding(.leading, 43)
                    }
                }
            }
            .background(Brand.surface, in: .rect(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.white.opacity(0.06)))
        }
    }

    private func done(_ invite: BotInvite, space: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(Brand.online)
                .symbolEffect(.bounce, value: addedTo)
            Text("\(invite.bot.name) was added to \(space)")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Brand.textPrimary)
                .multilineTextAlignment(.center)
            DSPrimaryButton(title: "Done") { dismiss() }
                .padding(.top, 8)
        }
        .padding(.top, 60)
    }

    private func load() async {
        do {
            invite = try await BotInviteAPI.invite(code: code)
        } catch {
            loadError = "This invite doesn't work any more."
            return
        }
        if invite?.server == nil, let viewerId {
            let list = await BotInviteAPI.spaces(userId: viewerId)
            spaces = list
            if spaceId == nil { spaceId = list.first?.id }
        }
    }

    private func authorize() async {
        guard let chosen, !busy else { return }
        busy = true; error = nil
        defer { busy = false }
        do {
            try await BotInviteAPI.approve(code: code, serverId: fixedSpace == nil ? chosen.id : nil)
            Haptics.success()
            withAnimation(Motion.settle) { addedTo = chosen.name }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
