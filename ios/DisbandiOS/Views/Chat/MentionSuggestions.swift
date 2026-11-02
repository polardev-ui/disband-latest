import SwiftUI

/// One row of the @mention picker.
struct MentionSuggestion: Identifiable, Hashable {
    enum Kind: Hashable {
        case member(Profile)
        case role(name: String, color: String)
        case everyone
    }
    let id: String
    let kind: Kind
    /// What replaces the typed "@query".
    let insert: String
}

/**
 Finds who an "@" being typed could mean, like the web composer: members by
 display name or username, and, in a space where you may ping them,
 @everyone and roles. Roles use the web's `@&slug` token, so a role and a
 member with the same name never collide.
 */
@MainActor
@Observable
final class MentionSearch {
    private(set) var results: [MentionSuggestion] = []

    private let source: ChatSource
    private var serverId: String?
    private var canPingEveryone = false
    private var roles: [ServerAdmin.Role] = []
    private var prepared = false

    init(source: ChatSource) { self.source = source }

    /// The space, your permission to ping everyone, and its roles. Once.
    private func prepare() async {
        guard !prepared else { return }
        prepared = true
        guard case .channel(let channelId, _) = source,
              let serverId = await ServerOnlineCount.serverId(forChannel: channelId) else { return }
        self.serverId = serverId
        let permissions = await ServerAdmin.permissions(serverId: serverId)
        canPingEveryone = permissions["mention_everyone"] == true || permissions["administrator"] == true
        if canPingEveryone {
            roles = (try? await ServerAdmin.roles(serverId: serverId)) ?? []
        }
    }

    /// Fill `results` for the text after "@". `local` is who a DM or group
    /// has in it; a space searches its whole roster.
    func search(_ query: String, local: [Profile]) async {
        await prepare()
        let q = query.lowercased()
        func hit(_ text: String?) -> Bool { q.isEmpty || (text?.lowercased().contains(q) ?? false) }

        var members: [Profile]
        if let serverId {
            if !q.isEmpty { try? await Task.sleep(for: .milliseconds(150)) }  // typing debounce
            guard !Task.isCancelled else { return }
            members = await ServerAdmin.searchMembers(serverId: serverId, query: query)
        } else {
            members = local.filter { hit($0.displayName) || hit($0.username) }
        }
        guard !Task.isCancelled else { return }
        // Usernames are the token: display names can hold spaces.
        members = members.filter { ($0.username ?? "").isEmpty == false }

        var out: [MentionSuggestion] = []
        if serverId != nil, canPingEveryone, hit("everyone") {
            out.append(MentionSuggestion(id: "everyone", kind: .everyone, insert: "@everyone"))
        }
        out += members.prefix(8).map {
            MentionSuggestion(id: $0.id, kind: .member($0), insert: "@\($0.username ?? "")")
        }
        if canPingEveryone {
            out += roles
                .filter { $0.isDefault != true && hit($0.name) }
                .compactMap { role in
                    let slug = Self.roleSlug(role.name)
                    guard !slug.isEmpty else { return nil }
                    return MentionSuggestion(id: "role:\(role.id)", kind: .role(name: role.name, color: role.color),
                                             insert: "@&\(slug)")
                }
        }
        results = Array(out.prefix(10))
    }

    func clear() { results = [] }

    /// `roleMentionSlug` in `src/lib/utils.ts`.
    static func roleSlug(_ name: String) -> String {
        var s = name.trimmingCharacters(in: .whitespacesAndNewlines)
        s = s.replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
        s = s.replacingOccurrences(of: "[^a-zA-Z0-9_-]", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
        return s.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    /// The "@query" being typed at the end of the draft, if any.
    static func query(in draft: String) -> String? {
        guard let at = draft.lastIndex(of: "@") else { return nil }
        if at > draft.startIndex {
            let before = draft[draft.index(before: at)]
            guard before.isWhitespace else { return nil }  // an email address, not a mention
        }
        let tail = draft[draft.index(after: at)...]
        guard tail.count <= 32, tail.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" || $0 == "." || $0 == "-" })
        else { return nil }
        return String(tail)
    }

    /// The draft with the typed "@query" swapped for the pick.
    static func applying(_ pick: MentionSuggestion, to draft: String) -> String {
        guard let at = draft.lastIndex(of: "@") else { return draft + pick.insert + " " }
        return String(draft[..<at]) + pick.insert + " "
    }
}

/// The list above the composer while an @mention is being typed.
struct MentionSuggestionList: View {
    let results: [MentionSuggestion]
    let onPick: (MentionSuggestion) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(results) { item in
                    Button { onPick(item) } label: { row(item) }
                        .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 4)
        }
        .frame(maxHeight: min(CGFloat(results.count) * 52 + 8, 240))
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Brand.divider, lineWidth: 1))
        .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
        .padding(.horizontal, 10)
        .padding(.top, 6)
    }

    private func row(_ item: MentionSuggestion) -> some View {
        HStack(spacing: 10) {
            switch item.kind {
            case .member(let profile):
                AvatarView(url: profile.avatarUrl, name: profile.name, size: 32)
                StyledName(profile, size: 15)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("@\(profile.handle)")
                    .font(.caption)
                    .foregroundStyle(Brand.textMuted)
                    .lineLimit(1)
            case .role(let name, let color):
                Image(systemName: "at")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color(hexString: color) ?? Brand.textSecondary)
                    .frame(width: 32, height: 32)
                Text(name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color(hexString: color) ?? Brand.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("Role").font(.caption).foregroundStyle(Brand.textMuted)
            case .everyone:
                Image(systemName: "megaphone.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.textSecondary)
                    .frame(width: 32, height: 32)
                Text("@everyone")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.textPrimary)
                Spacer(minLength: 8)
                Text("Notify everyone here").font(.caption).foregroundStyle(Brand.textMuted)
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 52)
        .contentShape(Rectangle())
    }
}
