import Foundation
import Supabase
import WebRTC

/// Fetches relay (TURN) credentials for calls.
///
/// STUN only discovers a public address; it cannot carry media. A phone on a
/// mobile network sits behind carrier-grade NAT, so a phone-to-desktop call
/// frequently has no working candidate pair and connects with no audio in
/// either direction. A relay removes that failure mode.
///
/// Cloudflare issues time-limited credentials rather than a static
/// username/password, so they cannot be compiled into the app: `/api/turn`
/// mints them with a server-side token and this asks for them.
actor TurnService {
    static let shared = TurnService()

    private var servers: [RTCIceServer] = []
    private var fetchedAt: Date?
    private var inflight: Task<[RTCIceServer], Never>?

    /// Comfortably inside the credential lifetime the server issues.
    private static let cacheLifetime: TimeInterval = 45 * 60

    /// Never blocks a call for long: a slow or unreachable relay endpoint
    /// should degrade to STUN, not hold up dialling.
    private static let timeout: TimeInterval = 6

    /// Cached servers, refreshing first when they are missing or stale.
    /// Falls back to STUN alone, which still connects most same-network calls.
    func iceServers() async -> [RTCIceServer] {
        if let fetchedAt, Date().timeIntervalSince(fetchedAt) < Self.cacheLifetime, !servers.isEmpty {
            return AppConfig.baseIceServers + servers
        }

        if let inflight {
            return AppConfig.baseIceServers + (await inflight.value)
        }

        let task = Task<[RTCIceServer], Never> { await self.fetch() }
        inflight = task
        let fetched = await task.value
        inflight = nil

        if !fetched.isEmpty {
            servers = fetched
            fetchedAt = Date()
        }
        return AppConfig.baseIceServers + fetched
    }

    /// Warm the cache so the first call of a session does not pay for this.
    func prewarm() async {
        _ = await iceServers()
    }

    private func fetch() async -> [RTCIceServer] {
        guard let token = try? await SupabaseManager.client.auth.session.accessToken else {
            return []
        }

        var request = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/turn"))
        request.httpMethod = "GET"
        request.timeoutInterval = Self.timeout
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                print("TurnService: relay endpoint returned a non-200; falling back to STUN")
                return []
            }
            let payload = try JSONDecoder().decode(TurnPayload.self, from: data)
            return payload.iceServers.map { entry in
                RTCIceServer(
                    urlStrings: entry.urls,
                    username: entry.username,
                    credential: entry.credential
                )
            }
        } catch {
            print("TurnService: could not fetch relay credentials (\(error)); falling back to STUN")
            return []
        }
    }

    private struct TurnPayload: Decodable {
        struct Entry: Decodable {
            let urls: [String]
            let username: String?
            let credential: String?
        }
        let iceServers: [Entry]
    }
}
