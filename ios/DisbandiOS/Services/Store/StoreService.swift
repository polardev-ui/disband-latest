import Foundation
import StoreKit
import Supabase

/**
 In-app purchases: Disband Aero, and Catalysts for a space.

 Apple requires digital goods consumed inside an iOS app to be sold through
 In-App Purchase, so the Stripe checkout the web and desktop apps use is not
 an option here — this is the iOS half of the same two products, and the
 entitlements it grants land in the same `subscriptions` and
 `server_catalysts` tables the Stripe webhook writes.

 ## Nothing here decides what anyone is entitled to

 StoreKit's local verification says a transaction is genuine and unmodified.
 It does not say the purchase has not since been refunded, that the
 subscription has not lapsed, or that the same Apple ID is not signed into two
 Disband accounts. Only the server can answer those, so every transaction is
 sent to the `appstore/verify` function, which re-reads it from Apple's own
 App Store Server API and writes the entitlement. This class transports
 purchases; it never grants anything.

 That is also why `finish()` is called only after the server has accepted a
 transaction. An unfinished transaction is redelivered by StoreKit on every
 launch, which is exactly the retry we want if the app is killed between
 Apple taking the money and our server hearing about it.

 ## The updates listener

 `Transaction.updates` carries anything that happened outside a purchase call:
 a renewal, an Ask-to-Buy approval, a purchase made on another device, a
 refund. It has to be running before the first `await` of app launch or those
 are missed, so ``start()`` is called from app startup, not from the paywall.
 */
@MainActor
final class StoreService: ObservableObject {
    static let shared = StoreService()

    /// Products fetched from the App Store, keyed by product id.
    @Published private(set) var products: [String: Product] = [:]

    /// The product id that grants Aero, and the one that grants Catalysts.
    ///
    /// Resolved from `apple_products` rather than compiled in, so the paywall
    /// does not have to know the SKU and a rename stays a database change.
    /// Nil until the catalogue has loaded, or if that row is inactive.
    @Published private(set) var aeroProductId: String?
    @Published private(set) var catalystProductId: String?

    /// False once a load has finished, so the paywall can tell "still
    /// fetching" apart from "App Store Connect has no such product" — the
    /// second is silent in StoreKit and otherwise looks like a hung spinner.
    @Published private(set) var loadingCatalogue = true
    /// True while a purchase or restore is in flight, for disabling buttons.
    @Published private(set) var busy = false
    /// The last user-facing failure, if any.
    @Published var errorMessage: String?

    private var updatesTask: Task<Void, Never>?
    private var client: SupabaseClient { SupabaseManager.client }

    private init() {}

    // MARK: - Lifecycle

    /// Begin listening for transactions. Call once, early, from app startup.
    func start() {
        guard updatesTask == nil else { return }
        updatesTask = Task.detached { [weak self] in
            for await update in Transaction.updates {
                guard let self else { return }
                await self.handle(update, serverId: nil)
            }
        }
        Task { await loadProducts() }
    }

    // MARK: - Catalogue

    /**
     Which product ids to ask StoreKit for.

     Read from the database rather than compiled in, so a new SKU or a price
     change is a row rather than a release of the app. `apple_products` is
     world-readable for exactly this reason: the paywall has to be able to
     render before anyone signs in.
     */
    private func productIds() async -> [String] {
        struct Row: Decodable { let product_id: String; let grants: String }
        do {
            let rows: [Row] = try await client
                .from("apple_products")
                .select("product_id,grants")
                .eq("active", value: true)
                .execute()
                .value
            aeroProductId = rows.first { $0.grants == "aero" }?.product_id
            catalystProductId = rows.first { $0.grants == "catalyst" }?.product_id
            return rows.map(\.product_id)
        } catch {
            print("apple_products fetch failed: \(error)")
            return []
        }
    }

    func loadProducts() async {
        loadingCatalogue = true
        defer { loadingCatalogue = false }
        let ids = await productIds()
        guard !ids.isEmpty else { return }
        do {
            let fetched = try await Product.products(for: ids)
            products = Dictionary(uniqueKeysWithValues: fetched.map { ($0.id, $0) })
            // StoreKit returns nothing for an id that does not exist in App
            // Store Connect, and silently — so say which ones went missing
            // rather than showing an empty paywall with no explanation.
            let missing = Set(ids).subtracting(products.keys)
            if !missing.isEmpty {
                print("StoreKit: no such product(s) in App Store Connect: \(missing.sorted())")
            }
        } catch {
            print("StoreKit product load failed: \(error)")
        }
    }

    // MARK: - Buying

    /// Buy Aero. Returns true once the server has granted it.
    @discardableResult
    func purchaseAero(productId: String) async -> Bool {
        await purchase(productId: productId, serverId: nil)
    }

    /// Buy Catalysts for a space. The space id travels with the verification
    /// so the server knows where to put them.
    @discardableResult
    func purchaseCatalysts(productId: String, serverId: String, quantity: Int = 1) async -> Bool {
        await purchase(productId: productId, serverId: serverId, quantity: quantity)
    }

    private func purchase(productId: String, serverId: String?, quantity: Int = 1) async -> Bool {
        guard let product = products[productId] else {
            errorMessage = "That item is not available right now."
            return false
        }
        guard let userId = client.auth.currentUser?.id else {
            errorMessage = "Sign in before buying."
            return false
        }

        busy = true
        defer { busy = false }
        errorMessage = nil

        do {
            var options: Set<Product.PurchaseOption> = [
                // Ties the App Store transaction to the Disband account at the
                // moment of purchase. A renewal a month from now may arrive at
                // our server as a notification with the app never having been
                // opened; this token is how that renewal still finds its owner.
                .appAccountToken(userId)
            ]
            if quantity > 1, product.type == .consumable {
                options.insert(.quantity(quantity))
            }

            switch try await product.purchase(options: options) {
            case .success(let verification):
                return await handle(verification, serverId: serverId)

            case .userCancelled:
                return false

            case .pending:
                // Ask to Buy, or a payment needing approval. It will arrive
                // through `Transaction.updates` if and when it is approved.
                errorMessage = "This purchase needs approval before it can finish."
                return false

            @unknown default:
                return false
            }
        } catch {
            errorMessage = "The purchase could not be completed."
            print("StoreKit purchase failed: \(error)")
            return false
        }
    }

    /// Re-send everything the Apple ID is still entitled to.
    ///
    /// Not a "restore" in the old receipt-refresh sense: it walks the current
    /// entitlements and re-verifies each one server-side, which is what makes
    /// a fresh install, or a new Disband account on the same phone, pick its
    /// subscription back up.
    func restore() async {
        busy = true
        defer { busy = false }
        errorMessage = nil

        var restored = 0
        for await entitlement in Transaction.currentEntitlements {
            if await handle(entitlement, serverId: nil, finishing: false) { restored += 1 }
        }
        if restored == 0 {
            errorMessage = "No purchases to restore on this Apple ID."
        }
    }

    // MARK: - Verification

    /**
     Hand one transaction to the server and, if it takes it, finish it.

     `finishing` is false for restores: those transactions were already
     finished when they were bought, and finishing a subscription's
     transaction again is meaningless.
     */
    @discardableResult
    private func handle(
        _ result: VerificationResult<Transaction>,
        serverId: String?,
        finishing: Bool = true
    ) async -> Bool {
        guard case .verified(let transaction) = result else {
            // StoreKit itself could not vouch for this one. Not finished on
            // purpose — a jailbroken-device forgery should keep failing rather
            // than be quietly cleared away.
            print("StoreKit: unverified transaction, ignoring")
            return false
        }

        let ok = await verifyWithServer(
            transactionId: String(transaction.id),
            serverId: serverId
        )

        if ok && finishing {
            await transaction.finish()
        }
        return ok
    }

    private func verifyWithServer(transactionId: String, serverId: String?) async -> Bool {
        struct Body: Encodable {
            let transactionId: String
            let serverId: String?
        }
        struct Reply: Decodable {
            let ok: Bool?
            let granted: String?
            let error: String?
        }

        do {
            let reply: Reply = try await client.functions.invoke(
                "appstore/verify",
                options: FunctionInvokeOptions(body: Body(
                    transactionId: transactionId,
                    serverId: serverId
                ))
            )
            if reply.ok == true { return true }
            errorMessage = reply.error ?? "That purchase could not be applied."
            return false
        } catch let FunctionsError.httpError(code, data) {
            // A refusal, not an outage. The function answers JSON with a
            // message meant for the buyer ("already attached to a different
            // Disband account", "choose a space for these Catalysts"), and
            // showing "check your connection" instead would send them off to
            // debug their wifi over a decision the server already made.
            let reply = try? JSONDecoder().decode(Reply.self, from: data)
            errorMessage = reply?.error ?? "That purchase could not be applied (\(code))."
            print("appstore/verify refused: \(code)")
            return false
        } catch {
            // Deliberately not finished: StoreKit will hand this transaction
            // back on the next launch, and the next attempt may reach the
            // server. Someone who paid must not lose what they bought to a
            // dropped connection.
            errorMessage = "We couldn't confirm that purchase yet — it will finish automatically."
            print("appstore/verify failed: \(error)")
            return false
        }
    }

    // MARK: - Display

    /// Localised price string straight from StoreKit, never our own formatting:
    /// the App Store decides the currency, the tax, and the digits.
    func displayPrice(for productId: String) -> String? {
        products[productId]?.displayPrice
    }
}
