import StoreKit
import SwiftUI

/**
 The Aero paywall.

 Everything App Review looks for on an auto-renewable subscription screen is
 here and is required, not decoration: the subscription's name, its length,
 the price as StoreKit reports it, a plain statement of how renewal and
 cancellation work, a Restore Purchases control, and working links to the
 Terms of Use and the Privacy Policy. A paywall missing any of them is a
 rejection, and they are grouped together at the bottom so they cannot be
 removed one at a time by accident.

 The price is never formatted here. `Product.displayPrice` already carries the
 storefront's currency, its digit grouping and whatever tax rules apply, and
 writing "$2.99" into the app would be wrong in most of the world.

 Nothing on this screen grants anything either — the purchase is handed to
 ``StoreService``, which hands it to the server, which writes the entitlement.
 `SubscriptionService` is listening on realtime, so the plan flips over on its
 own once that write lands, which is why there is no "now reload" step after a
 successful purchase.
 */
struct AeroPaywallSheet: View {
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var store = StoreService.shared

    /// Set once the plan turns paid while the sheet is open, so the sheet can
    /// say thank you rather than vanishing under the buyer.
    @State private var justSubscribed = false

    private var productId: String? { store.aeroProductId }
    private var product: Product? { productId.flatMap { store.products[$0] } }

    private static let termsURL = URL(string: "https://www.disband.dev/terms")!
    private static let privacyURL = URL(string: "https://www.disband.dev/privacy")!

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    header
                    if justSubscribed || subscriptions.plan.isPaid {
                        thanks
                    } else {
                        features
                        buyBox
                    }
                    legal
                }
                .padding(16)
            }
            .background(Brand.surface)
            .navigationTitle("Disband Aero")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await store.loadProducts() }
            .onChange(of: subscriptions.plan.isPaid) { _, paid in
                if paid { justSubscribed = true }
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

    private var header: some View {
        VStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(.black)
                .frame(width: 68, height: 68)
                .background(SubscriptionPlan.aeroGold,
                            in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Text("Everything Disband does, with the ceiling lifted.")
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.textPrimary)
        }
        .padding(.top, 8)
    }

    private var features: some View {
        VStack(spacing: 0) {
            ForEach(Array(Self.perks.enumerated()), id: \.offset) { index, perk in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: perk.symbol)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SubscriptionPlan.aeroGold)
                        .frame(width: 26, height: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(perk.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.textPrimary)
                        Text(perk.detail)
                            .font(.footnote)
                            .foregroundStyle(Brand.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 10)
                if index < Self.perks.count - 1 {
                    Rectangle().fill(Brand.divider).frame(height: 1)
                }
            }
        }
        .padding(.horizontal, 16)
        .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    @ViewBuilder
    private var buyBox: some View {
        VStack(spacing: 12) {
            if let product {
                // Name, length and price together — App Review requires all
                // three to be visible before the buy button, not on a
                // following screen.
                VStack(spacing: 4) {
                    Text(product.displayPrice)
                        .font(.system(size: 34, weight: .heavy))
                        .foregroundStyle(Brand.textPrimary)
                    Text(periodLabel(for: product))
                        .font(.subheadline)
                        .foregroundStyle(Brand.textMuted)
                }

                Button {
                    Task { await store.purchaseAero(productId: product.id) }
                } label: {
                    HStack(spacing: 8) {
                        if store.busy { ProgressView().tint(.black) }
                        Text(store.busy ? "Working…" : "Subscribe")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(SubscriptionPlan.aeroGold,
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(.black)
                }
                .disabled(store.busy)

            } else if store.loadingCatalogue {
                ProgressView().frame(height: 90)

            } else {
                // StoreKit answers an unknown product id with silence, so
                // without this the screen is an endless spinner and the cause
                // — a product that is not live in App Store Connect — is
                // invisible to everyone including us.
                VStack(spacing: 6) {
                    Text("Aero isn't available right now.")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                    Text("Try again in a little while, or subscribe at disband.dev.")
                        .font(.footnote)
                        .foregroundStyle(Brand.textMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(.vertical, 12)
            }

            Button("Restore purchases") {
                Task { await store.restore() }
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Brand.textSecondary)
            .disabled(store.busy)
        }
    }

    private var thanks: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 34))
                .foregroundStyle(SubscriptionPlan.aeroGold)
            Text("Aero is active on this account.")
                .font(.headline)
                .foregroundStyle(Brand.textPrimary)
            Text("Manage or cancel it any time in Settings → your name → Subscriptions.")
                .font(.footnote)
                .foregroundStyle(Brand.textMuted)
                .multilineTextAlignment(.center)
            Button("Done") { dismiss() }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Brand.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .foregroundStyle(.white)
                .padding(.top, 4)
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    /// The renewal terms and the two links. Required, and deliberately plain.
    private var legal: some View {
        VStack(spacing: 10) {
            Text("""
            Payment is charged to your Apple Account at confirmation. The \
            subscription renews automatically unless it is cancelled at least \
            24 hours before the end of the current period, and your account is \
            charged for renewal within 24 hours of the period ending. Manage \
            and cancel in your Apple Account settings after purchase.
            """)
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
        .padding(.top, 4)
    }

    // MARK: - Helpers

    /// "per month" / "per year" from StoreKit's own subscription period, so a
    /// change of plan length in App Store Connect does not silently leave the
    /// wrong word on the screen.
    private func periodLabel(for product: Product) -> String {
        guard let period = product.subscription?.subscriptionPeriod else {
            return "One-time purchase"
        }
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "period"
        }
        return period.value == 1
            ? "per \(unit), auto-renewing"
            : "every \(period.value) \(unit)s, auto-renewing"
    }

    private struct Perk {
        let symbol: String
        let title: String
        let detail: String
    }

    /// Kept in step with `Entitlements.aero` and the web's `ENTITLEMENTS`.
    /// Claiming a perk here that the server does not grant is a refund
    /// request, so these two move together.
    private static let perks: [Perk] = [
        .init(symbol: "arrow.up.circle.fill", title: "500 MB uploads",
              detail: "Ten times the free limit, per file."),
        .init(symbol: "video.fill", title: "1440p video and screen share",
              detail: "Calls and streams at full quality."),
        .init(symbol: "person.crop.circle.badge.plus", title: "Animated avatar and banner",
              detail: "GIFs on your profile, everywhere you appear."),
        .init(symbol: "bolt.fill", title: "4 Catalysts a month",
              detail: "Spend them on any space to raise its perks."),
        .init(symbol: "paintpalette.fill", title: "Every theme",
              detail: "The whole appearance catalogue, including premium skins."),
        .init(symbol: "text.bubble.fill", title: "4,000-character messages",
              detail: "Double the length, and a longer bio."),
    ]
}
