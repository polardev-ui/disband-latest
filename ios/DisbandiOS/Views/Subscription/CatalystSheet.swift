import StoreKit
import SwiftUI

/// The Catalyst levels a space can reach. Ported from `src/lib/catalysts.ts`;
/// the thresholds and perks must stay identical or the same space reads as a
/// different level on iPhone than it does on the web.
struct CatalystLevel: Sendable {
    let level: Int
    let min: Int
    let name: String
    let perks: [String]

    static let all: [CatalystLevel] = [
        .init(level: 0, min: 0, name: "No level", perks: []),
        .init(level: 1, min: 1, name: "Level 1", perks: ["Custom vanity invite code"]),
        .init(level: 2, min: 3, name: "Level 2", perks: [
            "Custom vanity invite code",
            "+50 custom emoji slots for everyone",
        ]),
        .init(level: 3, min: 6, name: "Level 3", perks: [
            "Custom vanity invite code",
            "+50 custom emoji slots for everyone",
            "Animated gradient role styling",
        ]),
    ]

    static func forCount(_ count: Int) -> CatalystLevel {
        all.last { count >= $0.min } ?? all[0]
    }

    static func next(after count: Int) -> CatalystLevel? {
        all.first { $0.min > count }
    }
}

/**
 Buy Catalysts for one space.

 Catalysts are a consumable, so unlike Aero each purchase is a separate
 transaction with a destination attached: the space id travels with the
 verification call, because the server has no other way to know where the
 units belong. That is also why a purchase made with no space selected is
 refused by the server rather than guessed at — a Catalyst applied to the
 wrong space cannot be moved.

 The count shown is read straight from `server_catalysts`, the same table the
 Stripe and App Store paths both write, so a purchase from the web shows up
 here and vice versa.
 */
struct CatalystSheet: View {
    let serverId: String
    let serverName: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var store = StoreService.shared

    @State private var count = 0
    @State private var loading = true
    @State private var quantity = 1

    private var productId: String? { store.catalystProductId }
    private var product: Product? { productId.flatMap { store.products[$0] } }

    private var level: CatalystLevel { CatalystLevel.forCount(count) }
    private var next: CatalystLevel? { CatalystLevel.next(after: count) }

    private static let termsURL = URL(string: "https://www.disband.dev/terms")!
    private static let privacyURL = URL(string: "https://www.disband.dev/privacy")!

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    status
                    perks
                    buyBox
                    legal
                }
                .padding(16)
            }
            .background(Brand.surface)
            .navigationTitle("Catalysts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task {
                await store.loadProducts()
                await reloadCount()
            }
            .alert(
                "Purchase",
                isPresented: Binding(
                    get: { store.errorMessage != nil },
                    set: { if !$0 { store.errorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) { store.errorMessage = nil }
            } message: {
                Text(store.errorMessage ?? "")
            }
        }
    }

    // MARK: - Pieces

    private var status: some View {
        VStack(spacing: 10) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background(
                    LinearGradient(colors: [Color(hex: 0xFF73FA), Color(hex: 0x5865F2)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous)
                )

            if loading {
                ProgressView().frame(height: 44)
            } else {
                Text(level.name)
                    .font(.title3.weight(.heavy))
                    .foregroundStyle(Brand.textPrimary)
                Text("\(count) Catalyst\(count == 1 ? "" : "s") on \(serverName)")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textMuted)
                    .multilineTextAlignment(.center)

                if let next {
                    let need = next.min - count
                    ProgressView(
                        value: Double(max(0, count - level.min)),
                        total: Double(max(1, next.min - level.min))
                    )
                    .tint(Color(hex: 0xFF73FA))
                    .padding(.top, 2)
                    Text("\(need) more to reach \(next.name)")
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                }
            }
        }
        .padding(.top, 8)
    }

    @ViewBuilder
    private var perks: some View {
        let shown = next ?? level
        if !shown.perks.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(next == nil ? "Unlocked" : "\(shown.name) unlocks")
                    .font(.caption.weight(.bold))
                    .tracking(0.6)
                    .foregroundStyle(Brand.textMuted)
                ForEach(shown.perks, id: \.self) { perk in
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(Color(hex: 0xFF73FA))
                        Text(perk)
                            .font(.subheadline)
                            .foregroundStyle(Brand.textPrimary)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    @ViewBuilder
    private var buyBox: some View {
        VStack(spacing: 14) {
            if let product {
                Stepper(value: $quantity, in: 1...10) {
                    HStack {
                        Text("Quantity")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.textPrimary)
                        Spacer()
                        Text("\(quantity)")
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(Brand.textMuted)
                    }
                }

                Button {
                    Task {
                        let ok = await store.purchaseCatalysts(
                            productId: product.id,
                            serverId: serverId,
                            quantity: quantity
                        )
                        if ok { await reloadCount() }
                    }
                } label: {
                    HStack(spacing: 8) {
                        if store.busy { ProgressView().tint(.white) }
                        // The total is StoreKit's own price repeated, not
                        // arithmetic on it: multiplying a formatted string is
                        // wrong, and the App Store shows the real total at
                        // confirmation anyway.
                        Text(store.busy
                             ? "Working…"
                             : "Buy \(quantity) · \(product.displayPrice) each")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(
                        LinearGradient(colors: [Color(hex: 0xFF73FA), Color(hex: 0x5865F2)],
                                       startPoint: .leading, endPoint: .trailing),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                    .foregroundStyle(.white)
                }
                .disabled(store.busy)

            } else if store.loadingCatalogue {
                ProgressView().frame(height: 80)

            } else {
                VStack(spacing: 6) {
                    Text("Catalysts aren't available right now.")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                    Text("Try again shortly, or buy them at disband.dev.")
                        .font(.footnote)
                        .foregroundStyle(Brand.textMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(.vertical, 12)
            }
        }
    }

    private var legal: some View {
        VStack(spacing: 8) {
            Text("Catalysts are a one-time purchase applied to \(serverName). They do not renew and are not transferable between spaces.")
                .font(.caption)
                .foregroundStyle(Brand.textMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 18) {
                Link("Terms of Use", destination: Self.termsURL)
                Link("Privacy Policy", destination: Self.privacyURL)
            }
            .font(.caption.weight(.semibold))
            .tint(Brand.accent)
        }
    }

    // MARK: - Data

    private func reloadCount() async {
        loading = true
        defer { loading = false }
        do {
            count = try await SupabaseManager.client
                .from("server_catalysts")
                .select("id", head: true, count: .exact)
                .eq("server_id", value: serverId)
                .execute()
                .count ?? 0
        } catch {
            print("catalyst count failed: \(error)")
        }
    }
}
