import SwiftUI

struct GiftRow: Decodable {
    let code: String
    let plan: String
    let months: Int
    let status: String
    let buyerId: String
    let claimedBy: String?

    enum CodingKeys: String, CodingKey {
        case code, plan, months, status
        case buyerId = "buyer_id"
        case claimedBy = "claimed_by"
    }
}

private struct ClaimResult: Decodable {
    let ok: Bool
    let error: String?
    let plan: String?
    let months: Int?
}

/**
 A gift posted into a conversation.

 The same card the web app renders, from the same link — sending a gift is
 just sending a message. Anyone who can see it may claim it, and the race is
 settled in the database, so a claim that loses says so instead of leaving a
 button that quietly does nothing.
 */
struct GiftClaimCard: View {
    let code: String

    @Environment(AppState.self) private var app
    @State private var gift: GiftRow?
    @State private var buyerName = "Someone"
    @State private var loading = true
    @State private var claiming = false
    @State private var error: String?
    @State private var celebrate = false

    private var accent: Color {
        gift?.plan == "super" ? Color(hexString: "fee75c") : Color(hexString: "57f287")
    }
    private var planName: String {
        gift?.plan == "super" ? "Disband Super" : "Disband Basic"
    }
    private var monthsLabel: String {
        guard let m = gift?.months else { return "" }
        return m == 12 ? "1 year" : "\(m) month\(m == 1 ? "" : "s")"
    }

    var body: some View {
        Group {
            if loading {
                EmptyView()
            } else if let gift {
                card(gift)
            }
        }
        .task(id: code) { await load() }
        .fullScreenCover(isPresented: $celebrate) {
            if let gift {
                GiftClaimCelebration(plan: gift.plan, months: gift.months, from: buyerName)
            }
        }
    }

    private func card(_ gift: GiftRow) -> some View {
        let mine = gift.buyerId == app.currentUserId
        let claimedByMe = gift.claimedBy != nil && gift.claimedBy == app.currentUserId

        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "gift.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(accent)
                    .frame(width: 44, height: 44)
                    .background(accent.opacity(0.16), in: .circle)

                VStack(alignment: .leading, spacing: 2) {
                    Text(mine ? "YOUR GIFT" : "A GIFT FROM \(buyerName.uppercased())")
                        .font(.caption2.weight(.bold))
                        .tracking(0.6)
                        .foregroundStyle(Brand.textMuted)
                        .lineLimit(1)
                    Text(planName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                    Text(monthsLabel + (gift.status == "unclaimed" ? " · first to claim it gets it" : ""))
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                }
                Spacer(minLength: 0)
            }

            if claimedByMe {
                Label("Claimed by you", systemImage: "checkmark")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(accent)
            } else if gift.status == "claimed" {
                Text("Already claimed.").font(.caption).foregroundStyle(Brand.textMuted)
            } else if gift.status == "expired" {
                Text("This gift expired.").font(.caption).foregroundStyle(Brand.textMuted)
            } else if gift.status == "pending" {
                Text("Waiting for payment to clear…").font(.caption).foregroundStyle(Brand.textMuted)
            } else if mine {
                Text("Waiting for someone to claim it.")
                    .font(.caption).foregroundStyle(Brand.textMuted)
            } else {
                Button {
                    Task { await claim() }
                } label: {
                    Text(claiming ? "Claiming…" : "Claim")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(accent, in: .rect(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(claiming)
            }

            if let error {
                Text(error).font(.caption2).foregroundStyle(Brand.danger)
            }
        }
        .padding(12)
        .background(Brand.elevated, in: .rect(cornerRadius: 10))
        .overlay(alignment: .leading) {
            Rectangle().fill(accent).frame(width: 4)
                .clipShape(.rect(topLeadingRadius: 10, bottomLeadingRadius: 10))
        }
    }

    private func load() async {
        let rows: [GiftRow] = (try? await SupabaseManager.client
            .from("gifts")
            .select("code, plan, months, status, buyer_id, claimed_by")
            .eq("code", value: code)
            .limit(1)
            .execute().value) ?? []
        gift = rows.first
        loading = false

        if let buyer = rows.first?.buyerId,
           let profile = try? await DatabaseService.profile(id: buyer) {
            buyerName = profile.displayName ?? profile.username ?? "Someone"
        }
    }

    private func claim() async {
        guard !claiming else { return }
        claiming = true
        error = nil
        defer { claiming = false }

        let result: ClaimResult? = try? await SupabaseManager.client
            .rpc("claim_gift", params: ["p_code": code])
            .execute().value

        guard let result, result.ok else {
            error = result?.error ?? "Could not claim this gift."
            await load()   // a lost race should show as claimed, not still offer
            return
        }

        if let me = app.currentUserId {
            EntitlementService.shared.invalidate(me)
            BadgeService.shared.invalidate(me)
        }
        if let buyer = gift?.buyerId { BadgeService.shared.invalidate(buyer) }
        await load()
        celebrate = true
    }
}
