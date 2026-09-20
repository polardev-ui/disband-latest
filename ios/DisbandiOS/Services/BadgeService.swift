import Foundation
import SwiftUI

/// One badge as the database describes it.
struct BadgeDef: Codable, Identifiable, Hashable {
    let key: String
    let name: String
    let description: String
    let category: String
    let accent: String
    let sort: Int

    var id: String { key }
    var color: Color { Color(hexString: accent) }
}

/// A badge somebody actually holds, with whatever the award recorded.
struct AwardedBadge: Identifiable, Hashable {
    let def: BadgeDef
    let awardedAt: Date?
    let detail: String?

    var id: String { def.key }
}

private struct UserBadgeRow: Decodable {
    let userId: String
    let badgeKey: String
    let awardedAt: String?
    let metadata: [String: AnyCodableValue]?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case badgeKey = "badge_key"
        case awardedAt = "awarded_at"
        case metadata
    }
}

/// jsonb holds numbers, strings and dates, and Swift needs one type for all of
/// them before it can read any of them.
enum AnyCodableValue: Decodable, Hashable {
    case number(Double)
    case string(String)
    case other

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { self = .number(d) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else { self = .other }
    }
}

/**
 Badges for the people on screen.

 They used to be four booleans on the profile row, so the app decided what a
 badge was and could never show one it had not shipped. The catalogue lives in
 the database now — the app renders whatever it is told, and an SF Symbol is
 chosen per key with a fallback so a badge added server-side still appears.
 */
@MainActor
final class BadgeService {
    static let shared = BadgeService()

    private var catalogue: [String: BadgeDef] = [:]
    private var cache: [String: [AwardedBadge]] = [:]
    private var loadingCatalogue: Task<Void, Never>?

    private func loadCatalogue() async {
        guard catalogue.isEmpty else { return }
        if let existing = loadingCatalogue { await existing.value; return }
        let task = Task { [weak self] in
            guard let self else { return }
            let defs: [BadgeDef] = (try? await SupabaseManager.client
                .from("badges").select("*").execute().value) ?? []
            for d in defs { self.catalogue[d.key] = d }
        }
        loadingCatalogue = task
        await task.value
        loadingCatalogue = nil
    }

    /// Badges for one person, cached for the session.
    func badges(for userId: String) async -> [AwardedBadge] {
        if let hit = cache[userId] { return hit }
        await loadCatalogue()

        let rows: [UserBadgeRow] = (try? await SupabaseManager.client
            .from("user_badges")
            .select("user_id, badge_key, awarded_at, metadata")
            .eq("user_id", value: userId)
            .eq("visible", value: true)
            .execute().value) ?? []

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let out = rows.compactMap { row -> AwardedBadge? in
            guard let def = catalogue[row.badgeKey] else { return nil }
            let date = row.awardedAt.flatMap { iso.date(from: $0) }
            return AwardedBadge(def: def, awardedAt: date, detail: Self.detail(row.metadata))
        }.sorted { $0.def.sort < $1.def.sort }

        cache[userId] = out
        return out
    }

    func invalidate(_ userId: String) { cache[userId] = nil }

    /// Ask the server to re-evaluate what this person has earned.
    func refresh(_ userId: String) async {
        _ = try? await SupabaseManager.client
            .rpc("refresh_user_badges", params: ["p_user": userId])
            .execute()
        invalidate(userId)
    }

    private static func detail(_ meta: [String: AnyCodableValue]?) -> String? {
        guard let meta else { return nil }
        func num(_ k: String) -> Int? {
            if case .number(let d) = meta[k] { return Int(d) }
            return nil
        }
        if let n = num("reports") { return "\(n) confirmed report\(n == 1 ? "" : "s")" }
        if let n = num("members") { return "\(n) members" }
        if let n = num("servers") { return "\(n) spaces" }
        if let n = num("joined") { return "\(n) joined" }
        if let n = num("uploaded") { return "\(n) emoji" }
        if let n = num("minutes") { return "\(n / 60) hours in calls" }
        return nil
    }

    /// The SF Symbol for a badge key. Unknown keys still get a mark.
    static func symbol(for key: String) -> String {
        switch key {
        case "owner": return "crown.fill"
        case "staff": return "hammer.fill"
        case "moderator": return "checkmark.shield.fill"
        case "partner": return "star.circle.fill"
        case "og": return "sparkles"
        case "early": return "heart.fill"
        case "anniv": return "birthday.cake.fill"
        case "bot_dev": return "cpu.fill"
        case "bot_ver": return "checkmark.seal.fill"
        case "contrib": return "chevron.left.forwardslash.chevron.right"
        case "translate": return "globe"
        case "bounty": return "target"
        case "hunter": return "ladybug.fill"
        case "hunter2": return "magnifyingglass.circle.fill"
        case "security": return "lock.shield.fill"
        case "feedback": return "bubble.left.and.exclamationmark.bubble.right.fill"
        case "founder": return "flag.fill"
        case "server_v": return "externaldrive.badge.checkmark"
        case "boost": return "arrow.up.circle.fill"
        case "recruit": return "person.badge.plus.fill"
        case "emoji": return "face.smiling.fill"
        case "gift": return "gift.fill"
        case "beta": return "flask.fill"
        case "mobile": return "iphone"
        case "voice": return "mic.fill"
        default: return "rosette"
        }
    }
}

extension Color {
    /// `#rrggbb` as the database stores it.
    init(hexString: String) {
        let s = hexString.hasPrefix("#") ? String(hexString.dropFirst()) : hexString
        let v = UInt64(s, radix: 16) ?? 0x99AAB5
        self.init(
            .sRGB,
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255,
            opacity: 1
        )
    }
}
