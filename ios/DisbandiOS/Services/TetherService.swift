import Foundation

/// Tether on iOS: talk to the web app's `/api/tether/*` routes.
///
/// The ask route (`/api/tether/ask`) is authoritative for the Aero gate, rate
/// limits, and model cost — exactly like the web client, the app only decides
/// whether an ask fires at all:
///   - a sent message mentions `@tether`, or
///   - the message was sent in a DM thread with Tether itself (no mention
///     needed there; you're already talking to it).
///
/// Firing is always best-effort and detached from sending: the reply arrives
/// through the normal realtime message stream, and an ask failure must never
/// remove or flag the message that triggered it.
actor TetherService {
    static let shared = TetherService()

    /// Tether's identity as the client needs it (from `/api/tether/info`).
    struct TetherInfo: Decodable, Sendable {
        let id: String
        let username: String?
        let displayName: String?
        let avatarUrl: String?

        enum CodingKeys: String, CodingKey {
            case id, username
            case displayName = "display_name"
            case avatarUrl = "avatar_url"
        }
    }

    private struct ThreadMembers: Decodable {
        let userA: String
        let userB: String

        enum CodingKeys: String, CodingKey {
            case userA = "user_a"
            case userB = "user_b"
        }
    }

    private var cachedInfo: TetherInfo?

    /// Matches "@tether" as a standalone word, case-insensitively —
    /// the same rule as the web client's `mentionsTether`.
    nonisolated static func mentionsTether(_ content: String) -> Bool {
        content.range(of: "@tether\\b", options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Resolve (and cache) Tether's user id. Provisions lazily server-side,
    /// so this works before the first ask.
    func tetherInfo() async -> TetherInfo? {
        if let cachedInfo { return cachedInfo }
        guard let token = try? await SupabaseManager.client.auth.session.accessToken else {
            return nil
        }
        var request = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/tether/info"))
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200,
              let info = try? JSONDecoder().decode(TetherInfo.self, from: data) else {
            return nil
        }
        cachedInfo = info
        return info
    }

    /// Open (or get) the caller's DM thread with Tether. Requires the 0102
    /// migration server-side, which lets flagged bots skip the friendship
    /// gate — and requires Aero, enforced again by the ask route.
    func openTetherThread() async -> String? {
        guard let info = await tetherInfo() else { return nil }
        return try? await DatabaseService.getOrCreateDmThread(friendId: info.id)
    }

    /// Fire an ask for an already-sent message when warranted. Detached-safe:
    /// never throws, never touches send state.
    func fireAskIfNeeded(messageId: String, content: String, surface: String,
                         threadId: String?, userId: String) async {
        let mentioned = Self.mentionsTether(content)
        var inTetherThread = false
        if surface == "dm", let threadId {
            inTetherThread = await isTetherThread(threadId, userId: userId)
        }
        guard mentioned || inTetherThread else { return }
        // Client-side Aero gate is a cost saver only; the route re-checks.
        guard await isAero(userId: userId) else { return }
        await ask(messageId: messageId, surface: surface)
    }

    private func isTetherThread(_ threadId: String, userId: String) async -> Bool {
        guard let info = await tetherInfo() else { return false }
        let rows: [ThreadMembers] = (try? await SupabaseManager.client
            .from("dm_threads").select("user_a,user_b").eq("id", value: threadId)
            .execute().value) ?? []
        guard let thread = rows.first else { return false }
        let other = thread.userA == userId ? thread.userB : thread.userA
        return other == info.id
    }

    private func isAero(userId: String) async -> Bool {
        await EntitlementService.shared.entitlement(for: userId).plan == "aero"
    }

    private func ask(messageId: String, surface: String) async {
        guard let token = try? await SupabaseManager.client.auth.session.accessToken else {
            return
        }
        var request = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/tether/ask"))
        request.httpMethod = "POST"
        // The route runs the tool loop with a hard deadline of its own; 90s
        // keeps the client around long enough for a real answer.
        request.timeoutInterval = 90
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "messageId": messageId,
            "surface": surface,
        ])
        _ = try? await URLSession.shared.data(for: request)
    }
}
