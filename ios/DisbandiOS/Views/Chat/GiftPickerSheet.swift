import SwiftUI

/*
 The composer's gift button: the gifts you've bought and not yet handed
 out, ready to drop into the conversation. Tapping one puts its link in the
 message box, where it renders as a claim card for whoever opens it.

 Buying gifts stays off iOS: they're paid by card checkout, which Apple
 doesn't allow for digital goods in an app.
*/

struct OwnedGift: Decodable, Identifiable, Hashable {
    let code: String
    let plan: String
    let months: Int
    let status: String
    let expiresAt: String?
    let createdAt: String?

    var id: String { code }

    enum CodingKeys: String, CodingKey {
        case code, plan, months, status
        case expiresAt = "expires_at"
        case createdAt = "created_at"
    }

    var planName: String { plan == "lite" ? "Disband Lite" : "Disband Aero" }
    var length: String { months == 12 ? "1 year" : "\(months) month\(months == 1 ? "" : "s")" }
    var link: String { AppConfig.webAppURL.appendingPathComponent("gift/\(code)").absoluteString }

    /// Bought, paid for, not claimed and not expired.
    var sendable: Bool {
        guard status == "unclaimed" else { return false }
        if let end = RelativeTime.date(from: expiresAt) { return end > Date() }
        return true
    }
}

struct GiftPickerSheet: View {
    /// Called with the chosen gift's link.
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var gifts: [OwnedGift]?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    if let gifts {
                        if gifts.isEmpty { empty } else { list(gifts) }
                    } else if let error {
                        Text(error).font(.system(size: 14)).foregroundStyle(Brand.dnd)
                    } else {
                        LoadingDots(color: Brand.textMuted, size: 7)
                            .frame(maxWidth: .infinity).padding(.top, 40)
                    }
                }
                .padding(20)
            }
            .background(Brand.background)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task { await load() }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image(systemName: "gift.fill")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(
                    LinearGradient(colors: [Color(hex: 0xEB459E), Brand.accent],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: .rect(cornerRadius: 16)
                )
            VStack(alignment: .leading, spacing: 3) {
                Text("Send a gift")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Brand.textPrimary)
                Text("Pick one of your gifts to drop into this chat.")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.textMuted)
            }
        }
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Text("No gifts to send")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Brand.textPrimary)
            Text("Gifts you've bought and not handed out yet show up here.")
                .font(.system(size: 14))
                .foregroundStyle(Brand.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .background(Brand.surface, in: .rect(cornerRadius: 16))
    }

    private func list(_ gifts: [OwnedGift]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(gifts.enumerated()), id: \.element.id) { index, gift in
                Button {
                    Haptics.success()
                    onPick(gift.link)
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: gift.plan == "lite" ? "bolt.fill" : "sparkles")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(gift.plan == "lite" ? Color(hex: 0x3BA55C) : Color(hex: 0xF0B232))
                            .frame(width: 38, height: 38)
                            .background(Brand.elevated, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(gift.planName) · \(gift.length)")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Brand.textPrimary)
                            if let end = RelativeTime.date(from: gift.expiresAt) {
                                Text("Claim by \(end.formatted(.dateTime.day().month(.abbreviated).year()))")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Brand.textMuted)
                            }
                        }
                        Spacer(minLength: 8)
                        Text("Send")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .frame(height: 32)
                            .background(Brand.accent, in: Capsule())
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if index < gifts.count - 1 {
                    Rectangle().fill(Brand.divider).frame(height: 0.5).padding(.leading, 64)
                }
            }
        }
        .background(Brand.surface, in: .rect(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.white.opacity(0.06)))
    }

    private func load() async {
        struct Mine: Decodable { let sent: [OwnedGift] }
        do {
            let data = try await StaffAPI.request("/api/gifts/mine")
            let mine = try JSONDecoder().decode(Mine.self, from: data)
            gifts = mine.sent.filter(\.sendable)
        } catch {
            self.error = "Couldn't load your gifts. Try again in a moment."
        }
    }
}
