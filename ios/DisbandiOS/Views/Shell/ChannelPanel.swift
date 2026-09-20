import Supabase
import SwiftUI

/// Navigation targets inside Home.
enum SpacesRoute: Hashable {
    case chat(ChatSource, callPeer: Profile?, canModerate: Bool, lockedReason: String? = nil)
    case members(Server)
}

/// A server's channels, grouped by category, with who is in each voice
/// channel shown live underneath it.
struct ChannelPanel: View {
    let server: Server
    var onChanged: () async -> Void
    var onLeft: () -> Void

    @Environment(AppState.self) private var app
    @Environment(VoiceSession.self) private var voice

    @State private var channels: [Channel] = []
    @State private var categories: [ChannelCategory] = []
    @State private var occupants: [String: [VoiceMember]] = [:]
    @State private var loading = true
    @State private var collapsed: Set<String> = []
    @State private var lobby: Channel?
    @State private var showInvite = false
    @State private var showSettings = false
    @State private var confirmLeave = false
    @State private var effects: [String: ChannelEffect] = [:]
    @State private var permissions: [String: Bool] = [:]
    @State private var timedOutUntil: Date?

    private var isOwner: Bool { server.ownerId == app.currentUserId }
    private var canManageChannels: Bool { isOwner || permissions["manage_channels"] == true }
    /// Remove other people's messages: owner, or a role with manage_messages.
    private var canModerate: Bool { isOwner || permissions["manage_messages"] == true }

    /// The web's `my_channel_effects` row: what you may do in one channel.
    struct ChannelEffect: Decodable {
        let channelId: String
        let canView: Bool
        let canPost: Bool
        enum CodingKeys: String, CodingKey {
            case channelId = "channel_id"
            case canView = "can_view"
            case canPost = "can_post"
        }
    }

    /// Why the composer is closed in `channel`, in the web's order and words.
    private func lockedReason(for channel: Channel) -> String? {
        if let until = timedOutUntil, until > Date() {
            let minutes = max(1, Int(ceil(until.timeIntervalSinceNow / 60)))
            let left = minutes >= 1440 ? "\(minutes / 1440)d \((minutes % 1440) / 60)h"
                : minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
            return "You are timed out in this space for \(left)."
        }
        if channel.readOnly == true && !canManageChannels {
            return "This is an announcement channel. Only people who can manage channels may post here."
        }
        if !canManageChannels, let effect = effects[channel.id], !effect.canPost {
            return "You don't have permission to post in this channel."
        }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                if loading {
                    ProgressView().tint(Brand.accent)
                        .frame(maxWidth: .infinity).padding(.top, 60)
                } else if channels.isEmpty {
                    Text("No channels yet.")
                        .font(.subheadline).foregroundStyle(Brand.textMuted)
                        .frame(maxWidth: .infinity).padding(.top, 60)
                } else {
                    ForEach(sections, id: \.id) { section in
                        sectionView(section)
                    }
                }
            }
            .padding(.bottom, 110)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .task(id: server.id) { await load() }
        .task(id: server.id) { await pollOccupants() }
        .sheet(item: $lobby) { channel in
            VoiceLobbySheet(room: room(for: channel), initialMembers: occupants[channel.id] ?? [])
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(32)
        }
        .sheet(isPresented: $showInvite) { InviteSheet(server: server) }
        .sheet(isPresented: $showSettings) { ServerSettingsSheet(server: server) { await onChanged() } }
        .confirmationDialog("Leave \(server.name)?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Leave Space", role: .destructive) { leave() }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                BannerImage(url: server.bannerUrl, height: 118) { bannerFallback }
                .overlay(
                    LinearGradient(colors: [.clear, Brand.surface.opacity(0.95)],
                                   startPoint: .top, endPoint: .bottom)
                )

                HStack(alignment: .center, spacing: 8) {
                    Text(server.name)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    if server.verified == true {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(Brand.verified)
                            .accessibilityLabel("Verified space")
                    }
                    Spacer(minLength: 8)
                    menu
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 10)
            }

            HStack(spacing: 8) {
                pillButton("Invite", symbol: "person.badge.plus") { showInvite = true }
                NavigationLink(value: SpacesRoute.members(server)) {
                    pillLabel("Members", symbol: "person.2.fill")
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    private var bannerFallback: some View {
        LinearGradient(colors: [Color(seed: server.id), Color(seed: server.id + "·").opacity(0.6)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var menu: some View {
        Menu {
            Button { showInvite = true } label: { Label("Invite People", systemImage: "person.badge.plus") }
            if isOwner {
                Button { showSettings = true } label: { Label("Space Settings", systemImage: "gearshape") }
            } else {
                Divider()
                Button(role: .destructive) { confirmLeave = true } label: {
                    Label("Leave Space", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Brand.textPrimary)
                .frame(width: 34, height: 34)
                .background(.ultraThinMaterial, in: Circle())
        }
        .accessibilityLabel("Space options")
    }

    private func pillButton(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { pillLabel(title, symbol: symbol) }.buttonStyle(.plain)
    }

    private func pillLabel(_ title: String, symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Brand.textPrimary)
            .padding(.horizontal, 14)
            .frame(height: 34)
            .background(Brand.elevated, in: Capsule())
    }

    // MARK: - Sections

    private struct ChannelSection {
        let id: String
        let title: String?
        let channels: [Channel]
    }

    private var sections: [ChannelSection] {
        // Channels you can't view are hidden, as on the web. iOS used to list
        // them, names and all.
        let viewable = canManageChannels ? channels : channels.filter { effects[$0.id]?.canView ?? true }
        let sorted = viewable.sorted { $0.position < $1.position }
        let known = Set(categories.map(\.id))
        var result: [ChannelSection] = []
        let loose = sorted.filter { $0.categoryId == nil || !known.contains($0.categoryId!) }
        if !loose.isEmpty { result.append(ChannelSection(id: "_loose", title: nil, channels: loose)) }
        for category in categories.sorted(by: { $0.position < $1.position }) {
            let members = sorted.filter { $0.categoryId == category.id }
            if !members.isEmpty {
                result.append(ChannelSection(id: category.id, title: category.name, channels: members))
            }
        }
        return result
    }

    @ViewBuilder private func sectionView(_ section: ChannelSection) -> some View {
        let isCollapsed = collapsed.contains(section.id)
        if let title = section.title {
            Button {
                withAnimation(.snappy(duration: 0.25)) {
                    if isCollapsed { collapsed.remove(section.id) } else { collapsed.insert(section.id) }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(title.uppercased())
                        .font(.caption.weight(.bold))
                        .tracking(0.6)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 9, weight: .bold))
                        .rotationEffect(.degrees(isCollapsed ? -90 : 0))
                    Spacer()
                }
                .foregroundStyle(Brand.textMuted)
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .padding(.bottom, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        if !isCollapsed {
            VStack(spacing: 2) {
                ForEach(section.channels) { channel in
                    if channel.type == .voice { voiceRow(channel) } else { textRow(channel) }
                }
            }
            .padding(.horizontal, 8)
        }
    }

    private func textRow(_ channel: Channel) -> some View {
        let locked = lockedReason(for: channel)
        return NavigationLink(value: SpacesRoute.chat(.channel(id: channel.id, name: channel.name),
                                                      callPeer: nil, canModerate: canModerate,
                                                      lockedReason: locked)) {
            HStack(spacing: 10) {
                Image(systemName: channel.readOnly == true ? "megaphone.fill" : "number")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Brand.textMuted)
                    .frame(width: 22)
                Text(channel.name)
                    .font(.body.weight(.medium))
                    .foregroundStyle(Brand.textSecondary)
                    .lineLimit(1)
                Spacer()
                if locked != nil {
                    Image(systemName: "lock.fill")
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                        .accessibilityLabel("Read only")
                }
            }
            .padding(.horizontal, 10)
            .frame(height: 42)
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(ChannelRowStyle())
    }

    private func voiceRow(_ channel: Channel) -> some View {
        let here = occupants[channel.id] ?? []
        let connected = voice.isIn(channel.id)
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                if connected { voice.minimized = false } else { lobby = channel }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: connected ? "speaker.wave.2.fill" : "speaker.wave.1.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(connected ? Brand.online : Brand.textMuted)
                        .frame(width: 22)
                    Text(channel.name)
                        .font(.body.weight(.medium))
                        .foregroundStyle(connected ? Brand.textPrimary : Brand.textSecondary)
                        .lineLimit(1)
                    Spacer()
                    if !here.isEmpty {
                        Text("\(here.count)")
                            .font(.caption.weight(.bold).monospacedDigit())
                            .foregroundStyle(Brand.textMuted)
                            .padding(.horizontal, 8).frame(height: 22)
                            .background(Brand.elevated, in: Capsule())
                    }
                }
                .padding(.horizontal, 10)
                .frame(height: 42)
                .contentShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(ChannelRowStyle(highlighted: connected))

            if !here.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(here) { member in
                        HStack(spacing: 8) {
                            AvatarView(url: member.profile?.avatarUrl, name: member.name, size: 24)
                                .overlay(Circle().stroke(Brand.online,
                                                         lineWidth: connected && voice.speaking.contains(member.userId) ? 2 : 0))
                            Text(member.name)
                                .font(.subheadline)
                                .foregroundStyle(Brand.textSecondary)
                                .lineLimit(1)
                            Spacer()
                            if member.deafened {
                                Image(systemName: "headphones.slash")
                                    .font(.caption).foregroundStyle(Brand.dnd)
                            } else if member.muted {
                                Image(systemName: "mic.slash.fill")
                                    .font(.caption).foregroundStyle(Brand.textMuted)
                            }
                        }
                    }
                }
                .padding(.leading, 42)
                .padding(.trailing, 12)
                .padding(.bottom, 8)
            }
        }
    }

    // MARK: - Data

    private func room(for channel: Channel) -> VoiceRoom {
        .channel(id: channel.id, name: channel.name, serverId: server.id,
                 serverName: server.name, serverIcon: server.iconUrl)
    }

    private func load() async {
        let client = SupabaseManager.client
        async let loadedChannels = try? DatabaseService.channels(serverId: server.id)
        async let loadedCategories = try? DatabaseService.categories(serverId: server.id)
        async let loadedEffects: [ChannelEffect]? = try? client
            .rpc("my_channel_effects", params: ["p_server_id": server.id]).execute().value
        async let loadedPermissions: [String: Bool]? = try? client
            .rpc("my_server_permissions", params: ["p_server_id": server.id]).execute().value
        async let loadedTimeout = Self.timeoutEnd(serverId: server.id, userId: app.currentUserId)

        channels = await loadedChannels ?? []
        categories = await loadedCategories ?? []
        effects = Dictionary(((await loadedEffects) ?? []).map { ($0.channelId, $0) },
                             uniquingKeysWith: { first, _ in first })
        permissions = await loadedPermissions ?? [:]
        timedOutUntil = await loadedTimeout
        loading = false
        await refreshOccupants()
    }

    private func refreshOccupants() async {
        let ids = channels.filter { $0.type == .voice }.map(\.id)
        let next = await VoiceSession.occupants(channelIds: ids)
        if next != occupants { occupants = next }
    }

    /// Voice rows update while the panel is on screen; the task is cancelled
    /// when it leaves, so hidden servers cost nothing.
    private func pollOccupants() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            await refreshOccupants()
        }
    }

    private static func timeoutEnd(serverId: String, userId: String?) async -> Date? {
        guard let userId else { return nil }
        struct Row: Decodable { let expires_at: String }
        let rows: [Row]? = try? await SupabaseManager.client.from("server_timeouts")
            .select("expires_at")
            .eq("server_id", value: serverId).eq("user_id", value: userId)
            .gt("expires_at", value: ISO8601DateFormatter().string(from: Date()))
            .execute().value
        return rows?.compactMap { RelativeTime.date(from: $0.expires_at) }.max()
    }

    private func leave() {
        guard let uid = app.currentUserId else { return }
        Task {
            try? await DatabaseService.leaveServer(serverId: server.id, userId: uid)
            await onChanged()
            onLeft()
        }
    }
}

struct ChannelRowStyle: ButtonStyle {
    var highlighted = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(configuration.isPressed ? Brand.elevated : (highlighted ? Brand.online.opacity(0.12) : .clear))
            )
    }
}
