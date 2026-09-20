import Supabase
import SwiftUI

/// Your referral link, how many people it has brought in, and the race for
/// December's prize — the web's Referrals settings and leaderboard, in one.
struct ReferralsView: View {
    @Environment(AppState.self) private var app

    @State private var code: String?
    @State private var verified = 0
    @State private var pending = 0
    @State private var leaders: [Leader] = []
    @State private var loading = true
    @State private var copied = false

    struct Leader: Decodable, Identifiable {
        let standing: Int
        let userId: String
        let displayName: String?
        let username: String?
        let verifiedCount: Int
        var id: String { userId }
        var name: String { Profile.visible(displayName) ?? Profile.visible(username) ?? "Someone" }

        enum CodingKeys: String, CodingKey {
            case standing, username
            case userId = "user_id"
            case displayName = "display_name"
            case verifiedCount = "verified_count"
        }
    }

    private var link: URL? {
        code.map { AppConfig.webAppURL.appendingPathComponent("referral").appendingPathComponent($0) }
    }

    private var myStanding: Int? { leaders.first { $0.userId == app.currentUserId }?.standing }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                hero
                linkCard
                howItWorks
                leaderboard
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollIndicators(.hidden)
        .background(Brand.background)
        .navigationTitle("Referrals")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .hidesDock()
        .solidNavigationBar()
    }

    // MARK: - Sections

    private var hero: some View {
        VStack(spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "gift.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.black)
                    .frame(width: 38, height: 38)
                    .background(SubscriptionPlan.aeroGold, in: Circle())
                VStack(alignment: .leading, spacing: 1) {
                    Text("Win a $100 Visa gift card")
                        .font(.headline).foregroundStyle(.white)
                    Text("Most verified referrals in December takes it.")
                        .font(.subheadline).foregroundStyle(.white.opacity(0.75))
                }
                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                stat(verified, "Verified")
                stat(pending, "Awaiting email")
                stat(myStanding, "Your rank", prefix: "#")
            }
        }
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(LinearGradient(colors: [Brand.accent, Brand.accent.opacity(0.55), Color(hex: 0x2B1F5C)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
        }
    }

    private func stat(_ value: Int?, _ label: String, prefix: String = "") -> some View {
        VStack(spacing: 2) {
            Text(value.map { "\(prefix)\($0)" } ?? "—")
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
                .contentTransition(.numericText())
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var linkCard: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Your link")
                    .font(.headline).foregroundStyle(Brand.textPrimary)
                if let link {
                    Text(link.absoluteString
                        .replacingOccurrences(of: "https://", with: "")
                        .replacingOccurrences(of: "www.", with: ""))
                        .font(.callout.monospaced())
                        .foregroundStyle(Brand.textSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .textSelection(.enabled)

                    HStack(spacing: 10) {
                        Button {
                            UIPasteboard.general.string = link.absoluteString
                            UINotificationFeedbackGenerator().notificationOccurred(.success)
                            copied = true
                            Task { try? await Task.sleep(nanoseconds: 1_500_000_000); copied = false }
                        } label: {
                            Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                                .frame(maxWidth: .infinity, minHeight: 46)
                                .background(Brand.elevated, in: Capsule())
                                .foregroundStyle(Brand.textPrimary)
                        }
                        ShareLink(item: link,
                                  message: Text("Join me on Disband — it's free.")) {
                            Label("Share", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity, minHeight: 46)
                                .background(Brand.accent.gradient, in: Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.plain)
                } else if loading {
                    ProgressView().tint(Brand.accent)
                } else {
                    Text("Your code isn't ready yet. Pull to refresh in a moment.")
                        .font(.subheadline).foregroundStyle(Brand.textMuted)
                }
            }
        }
    }

    private var howItWorks: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("How it works").font(.headline).foregroundStyle(Brand.textPrimary)
                step(1, "Share your link. It opens Disband's sign-up with your code already applied.")
                step(2, "Your friend makes an account — on the web, desktop or mobile.")
                step(3, "It counts once they verify their email address.")
            }
        }
    }

    private func step(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Brand.accent, in: Circle())
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Brand.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var leaderboard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Leaderboard").font(.headline).foregroundStyle(Brand.textPrimary)
                Spacer()
                Text("Top \(max(leaders.count, 1))").font(.caption).foregroundStyle(Brand.textMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            if leaders.isEmpty {
                Text(loading ? "Loading…" : "Nobody's on the board yet. Be first.")
                    .font(.subheadline).foregroundStyle(Brand.textMuted)
                    .padding(.horizontal, 16).padding(.bottom, 16)
            } else {
                ForEach(leaders) { leader in
                    let isMe = leader.userId == app.currentUserId
                    HStack(spacing: 12) {
                        medal(leader.standing)
                        Text(leader.name)
                            .font(.body.weight(isMe ? .bold : .medium))
                            .foregroundStyle(Brand.textPrimary)
                            .lineLimit(1)
                        if isMe {
                            Text("You")
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 6).frame(height: 18)
                                .background(Brand.accent.opacity(0.25), in: Capsule())
                                .foregroundStyle(Brand.accent)
                        }
                        Spacer()
                        Text("\(leader.verifiedCount)")
                            .font(.body.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Brand.textSecondary)
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 48)
                    .background(isMe ? Brand.accent.opacity(0.12) : .clear)
                }
                .padding(.bottom, 8)
            }
        }
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    @ViewBuilder private func medal(_ standing: Int) -> some View {
        let colors: [Int: Color] = [1: SubscriptionPlan.aeroGold, 2: Color(hex: 0xC0C7D0), 3: Color(hex: 0xD08A4E)]
        if let color = colors[standing] {
            Image(systemName: "medal.fill")
                .font(.system(size: 16))
                .foregroundStyle(color)
                .frame(width: 28)
        } else {
            Text("\(standing)")
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(Brand.textMuted)
                .frame(width: 28)
        }
    }

    // MARK: - Data

    private func load() async {
        guard let uid = app.currentUserId else { return }
        let client = SupabaseManager.client
        struct CodeRow: Decodable { let code: String }

        async let codeRows: [CodeRow]? = try? client.from("referral_codes")
            .select("code").eq("user_id", value: uid).limit(1).execute().value
        async let verifiedCount = try? client.from("referrals")
            .select("id", head: true, count: .exact)
            .eq("referrer_id", value: uid).eq("status", value: "verified").execute().count
        async let pendingCount = try? client.from("referrals")
            .select("id", head: true, count: .exact)
            .eq("referrer_id", value: uid).eq("status", value: "pending").execute().count
        async let board: [Leader]? = try? client
            .rpc("referral_leaderboard", params: ["p_limit": 50]).execute().value

        code = await codeRows?.first?.code
        verified = await verifiedCount ?? 0
        pending = await pendingCount ?? 0
        leaders = await board ?? []
        loading = false
    }
}
