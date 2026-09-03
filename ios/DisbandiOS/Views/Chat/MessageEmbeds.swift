import SwiftUI

/// Everything a message renders *below* its text: server invites and link
/// previews. On iOS both used to be plain blue text, so an invite someone sent
/// you could only be joined by copying the code out by hand.
struct MessageEmbeds: View {
    let text: String

    var body: some View {
        let invites = MessageLinks.inviteCodes(in: text)
        let links = MessageLinks.previewURLs(in: text)

        if !invites.isEmpty || !links.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(invites, id: \.self) { ServerInviteCard(code: $0) }
                ForEach(links, id: \.self) { LinkPreviewCard(url: $0) }
            }
            .padding(.top, 6)
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Server invite                                                      */
/* ------------------------------------------------------------------ */

struct ServerInviteCard: View {
    let code: String

    @Environment(AppState.self) private var app
    @State private var server: DatabaseService.InvitePreview?
    @State private var loading = true
    @State private var joining = false
    @State private var joined = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("YOU'VE BEEN INVITED TO JOIN A SERVER")
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
                        Text(server.name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.textPrimary)
                            .lineLimit(1)
                        Text("\(server.memberCount) member\(server.memberCount == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(Brand.textMuted)
                    }
                    Spacer(minLength: 0)
                }

                Button {
                    Task { await join() }
                } label: {
                    Text(joined ? "Joined" : (joining ? "Joining\u{2026}" : "Join Server"))
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(joined ? Brand.elevated : Brand.accent, in: .rect(cornerRadius: 8))
                        .foregroundStyle(joined ? Brand.textMuted : .white)
                }
                .buttonStyle(.plain)
                .disabled(joining || joined)
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

    private func load() async {
        loading = true
        defer { loading = false }
        server = try? await DatabaseService.serverByInvite(code: code)
    }

    private func join() async {
        guard !joining else { return }
        joining = true
        defer { joining = false }
        do {
            try await DatabaseService.joinServer(invite: code)
            joined = true
        } catch {
            self.error = "Couldn't join that server."
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
