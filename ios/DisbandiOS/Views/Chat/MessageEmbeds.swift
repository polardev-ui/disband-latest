import SwiftUI

/// Everything a message renders *below* its text: server invites and link
/// previews. On iOS both used to be plain blue text, so an invite someone sent
/// you could only be joined by copying the code out by hand.
struct MessageEmbeds: View {
    let text: String

    var body: some View {
        let invites = MessageLinks.inviteCodes(in: text)
        let gifts = MessageLinks.giftCodes(in: text)
        let links = MessageLinks.previewURLs(in: text)
        let bots = MessageLinks.botInviteCodes(in: text)

        if !invites.isEmpty || !gifts.isEmpty || !links.isEmpty || !bots.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(bots, id: \.self) { BotInviteCard(code: $0) }
                ForEach(invites, id: \.self) { ServerInviteCard(code: $0) }
                ForEach(gifts, id: \.self) { GiftClaimCard(code: $0) }
                ForEach(links, id: \.self) { LinkPreviewCard(url: $0) }
            }
            .padding(.top, 6)
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Server invite                                                      */
/* ------------------------------------------------------------------ */

/// Invite lookups already made this session. The database allows 15 a
/// minute per person, and every card looked itself up again whenever it
/// scrolled back into view, so a channel full of invites (#self-promo) ran
/// out and its cards claimed the invites were invalid.
@MainActor
private enum InviteCache {
    static var previews: [String: DatabaseService.InvitePreview] = [:]
    static var invalid: Set<String> = []
}

extension Notification.Name {
    /// A space was just joined from an invite card; Home opens it.
    static let disbandJoinedSpace = Notification.Name("disband.joinedSpace")
}

struct ServerInviteCard: View {
    let code: String

    @Environment(AppState.self) private var app
    @State private var server: DatabaseService.InvitePreview?
    @State private var loading = true
    @State private var joining = false
    @State private var joined = false
    @State private var error: String?
    /// The lookup failed (offline, rate limited), as opposed to the invite
    /// not existing. Offers a retry instead of calling it invalid.
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("YOU'VE BEEN INVITED TO JOIN A SPACE")
                .font(.caption2.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(Brand.textMuted)

            if loading {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("Loading invite\u{2026}")
                        .font(.subheadline)
                        .foregroundStyle(Brand.textMuted)
                }
            } else if let server {
                HStack(spacing: 10) {
                    AvatarView(url: server.iconUrl, name: server.name, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text(server.name)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Brand.textPrimary)
                                .lineLimit(1)
                            if server.verified == true {
                                Image(systemName: "checkmark.seal.fill")
                                    .font(.footnote)
                                    .foregroundStyle(Brand.verified)
                            }
                        }
                        Text("\(server.memberCount) member\(server.memberCount == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(Brand.textMuted)
                    }
                    Spacer(minLength: 0)
                }

                Button {
                    Task { await join() }
                } label: {
                    Text(joined ? "Joined" : (joining ? "Joining\u{2026}" : "Join Space"))
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(joined ? Brand.elevated : Brand.accent, in: .rect(cornerRadius: 8))
                        .foregroundStyle(joined ? Brand.textMuted : .white)
                }
                .buttonStyle(.plain)
                .disabled(joining || joined)
            } else if failed {
                HStack {
                    Text("Couldn't load this invite.")
                        .font(.subheadline)
                        .foregroundStyle(Brand.textMuted)
                    Spacer()
                    Button("Retry") { Task { await load(force: true) } }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.accent)
                }
            } else {
                Text(error ?? "This invite is invalid or has expired.")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textMuted)
            }
        }
        .padding(12)
        .frame(maxWidth: 300, alignment: .leading)
        .background(Brand.elevated, in: .rect(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Brand.accent.opacity(0.35), lineWidth: 1)
        )
        .task(id: code) { await load() }
    }

    private func load(force: Bool = false) async {
        let key = code.lowercased()
        if !force {
            if let cached = InviteCache.previews[key] { server = cached; loading = false; return }
            if InviteCache.invalid.contains(key) { server = nil; loading = false; return }
        }
        loading = true
        failed = false
        defer { loading = false }
        do {
            let found = try await DatabaseService.serverByInvite(code: code)
            server = found
            if let found { InviteCache.previews[key] = found } else { InviteCache.invalid.insert(key) }
        } catch {
            server = nil
            failed = true
        }
    }

    private func join() async {
        guard !joining else { return }
        joining = true
        defer { joining = false }
        do {
            let serverId = try await DatabaseService.joinServer(invite: code)
            joined = true
            Haptics.success()
            // Open it: the card used to say "Joined" and leave you where you
            // were, with the new space nowhere in the rail until a restart.
            NotificationCenter.default.post(name: .disbandJoinedSpace, object: serverId)
        } catch {
            self.error = "Couldn't join that space."
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Link preview                                                       */
/* ------------------------------------------------------------------ */

struct LinkPreviewCard: View {
    let url: String

    @State private var preview: LinkPreview?

    var body: some View {
        // No placeholder while loading: most links have no preview at all, and
        // a card that appears and then vanishes is worse than one that simply
        // arrives a moment later.
        if let preview, let link = URL(string: preview.url) {
            Link(destination: link) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(preview.host)
                        .font(.caption2)
                        .foregroundStyle(Brand.textMuted)
                    Text(preview.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.accent)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let description = preview.description {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(Brand.textSecondary)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }
                    if let image = preview.imageUrl {
                        RemoteImage(url: image, contentMode: .fill) {
                            RoundedRectangle(cornerRadius: 8).fill(Brand.surfaceRaised)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 140)
                        .clipShape(.rect(cornerRadius: 8))
                    }
                }
                .padding(10)
                .frame(maxWidth: 300, alignment: .leading)
                .background(Brand.elevated, in: .rect(cornerRadius: 10))
                .overlay(alignment: .leading) {
                    // The accent spine, matching how the web renders these.
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Brand.accent.opacity(0.6))
                        .frame(width: 3)
                }
            }
            .buttonStyle(.plain)
        } else {
            Color.clear
                .frame(height: 0)
                .task(id: url) { preview = await LinkPreviewService.shared.preview(for: url) }
        }
    }
}
