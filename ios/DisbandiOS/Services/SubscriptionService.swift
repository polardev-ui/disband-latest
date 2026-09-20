import Foundation
import Observation
import SwiftUI
import Realtime
import Supabase

/// Plans, mirroring the web app's `SubscriptionPlan`: Free, and Disband Aero.
///
/// Basic and Super were merged into Aero (migration 0072). Rows written before
/// that still say "basic" or "super", and gifts may too, so every raw value
/// goes through `init(normalizing:)` — the port of the web's `normalizePlan`.
/// Decoding "aero" with the old enum failed, which made every Aero subscriber
/// look unsubscribed on iPhone.
enum SubscriptionPlan: String, Codable, Sendable {
    case free, aero

    init(normalizing raw: String?) {
        switch raw?.lowercased() {
        case "aero", "basic", "super": self = .aero
        default: self = .free
        }
    }

    init(from decoder: Decoder) throws {
        self.init(normalizing: try? decoder.singleValueContainer().decode(String.self))
    }

    var isPaid: Bool { self == .aero }

    var label: String {
        switch self {
        case .free: return "Free"
        case .aero: return "Aero"
        }
    }

    var productName: String { self == .aero ? "Disband Aero" : "Disband Free" }

    /// The Aero gold, shared with the web (`#fee75c`).
    static let aeroGold = Color(hex: 0xFEE75C)
}

struct Subscription: Codable, Sendable {
    let userId: String
    let plan: String
    let status: String
    let currentPeriodEnd: String?

    enum CodingKeys: String, CodingKey {
        case plan, status
        case userId = "user_id"
        case currentPeriodEnd = "current_period_end"
    }
}

/// Feature limits per plan. Kept in step with `ENTITLEMENTS` in
/// `src/lib/subscription.ts` — if you change one, change the other.
struct Entitlements: Sendable {
    let maxUploadBytes: Int
    let maxMessageChars: Int
    let maxBioLength: Int
    let animatedAvatar: Bool
    let animatedBanner: Bool
    let screenShare: Bool
    let historyExport: Bool
    let prioritySupport: Bool

    static let free = Entitlements(
        maxUploadBytes: 50 * 1024 * 1024, maxMessageChars: 2000, maxBioLength: 190,
        animatedAvatar: false, animatedBanner: false, screenShare: false,
        historyExport: false, prioritySupport: false
    )
    static let aero = Entitlements(
        maxUploadBytes: 500 * 1024 * 1024, maxMessageChars: 4000, maxBioLength: 230,
        animatedAvatar: true, animatedBanner: true, screenShare: true,
        historyExport: true, prioritySupport: true
    )

    static func forPlan(_ plan: SubscriptionPlan) -> Entitlements {
        switch plan {
        case .free: return .free
        case .aero: return .aero
        }
    }
}

/// Tracks the signed-in user's subscription and keeps entitlements live.
///
/// Mirrors the web `useSubscription` hook, including which Stripe statuses
/// count as paid: `trialing` is paid intent and `past_due` means a renewal is
/// being retried, so cutting perks there would punish someone whose card just
/// needs updating.
@MainActor
@Observable
final class SubscriptionService {
    private(set) var subscription: Subscription?
    private(set) var plan: SubscriptionPlan = .free
    private(set) var loading = true

    var entitlements: Entitlements { Entitlements.forPlan(plan) }

    private static let grantingStatuses: Set<String> = ["active", "trialing", "past_due"]

    private var channel: RealtimeChannelV2?
    private var watchTask: Task<Void, Never>?
    private var userId: String?

    private var client: SupabaseClient { SupabaseManager.client }

    func start(userId: String?) async {
        guard self.userId != userId else { return }
        stop()
        self.userId = userId
        guard userId != nil else {
            subscription = nil
            plan = .free
            loading = false
            return
        }
        await reload()
        await subscribe()
    }

    func stop() {
        watchTask?.cancel()
        watchTask = nil
        let ch = channel
        channel = nil
        Task { await ch?.unsubscribe() }
    }

    func reload() async {
        guard let userId else { return }
        loading = true
        defer { loading = false }
        do {
            let rows: [Subscription] = try await client
                .from("subscriptions")
                .select("*")
                .eq("user_id", value: userId)
                .limit(1)
                .execute().value
            apply(rows.first)
        } catch {
            // Leave the last known plan in place rather than silently
            // downgrading a paying user because one request failed.
        }
    }

    private func apply(_ row: Subscription?) {
        subscription = row
        guard let row, Self.grantingStatuses.contains(row.status) else {
            plan = .free
            return
        }
        plan = SubscriptionPlan(normalizing: row.plan)
    }

    /// Picks up upgrades the moment the webhook or /api/stripe/sync writes them,
    /// so a purchase made on the web applies here without a restart.
    private func subscribe() async {
        guard let userId else { return }
        let (channel, stream) = await RealtimeService.observeChanges(
            table: "subscriptions",
            filter: "user_id=eq.\(userId)"
        )
        self.channel = channel
        watchTask = Task { [weak self] in
            for await _ in stream {
                await self?.reload()
            }
        }
    }
}
