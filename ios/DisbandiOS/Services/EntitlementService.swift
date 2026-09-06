import Foundation

/// Someone's effective plan and how many months they have paid for.
struct Entitlement: Decodable, Hashable {
    let plan: String
    let months: Int
    let since: Date?
    let giftUntil: Date?

    static let free = Entitlement(plan: "free", months: 0, since: nil, giftUntil: nil)

    enum CodingKeys: String, CodingKey {
        case plan, months, since
        case giftUntil = "gift_until"
    }

    init(plan: String, months: Int, since: Date?, giftUntil: Date?) {
        self.plan = plan; self.months = months; self.since = since; self.giftUntil = giftUntil
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        plan = (try? c.decode(String.self, forKey: .plan)) ?? "free"
        months = (try? c.decode(Int.self, forKey: .months)) ?? 0
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        func date(_ s: String?) -> Date? {
            guard let s else { return nil }
            return iso.date(from: s) ?? plain.date(from: s)
        }
        since = date(try? c.decode(String.self, forKey: .since))
        giftUntil = date(try? c.decode(String.self, forKey: .giftUntil))
    }
}

/**
 The plan behind a badge.

 A plan can come from a Stripe subscription or from claimed gift time, and
 neither source alone is the answer — `get_entitlement` resolves both. Cached
 per person because this is read beside every name on screen.
 */
@MainActor
final class EntitlementService {
    static let shared = EntitlementService()

    private var cache: [String: Entitlement] = [:]

    func entitlement(for userId: String) async -> Entitlement {
        if let hit = cache[userId] { return hit }
        let value: Entitlement = (try? await SupabaseManager.client
            .rpc("get_entitlement", params: ["p_user": userId])
            .execute().value) ?? .free
        cache[userId] = value
        return value
    }

    func invalidate(_ userId: String) { cache[userId] = nil }
}
