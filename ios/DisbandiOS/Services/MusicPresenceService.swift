import AuthenticationServices
import Foundation
import Observation
import Supabase
import UIKit

/**
 Shares what you're playing on Spotify while Disband is open on this phone,
 the way the web and desktop apps do (`AppContext`'s listening effect).

 The Spotify connection lives on the server (made in Settings on the web or
 desktop), so this only asks our API what is playing and publishes the
 answer: to the presence channel, and to `profiles.listening` for anyone not
 watching presence. iOS stops apps in the background, so it only runs while
 the app is in front. It doesn't clear the row when it stops, because the
 person's desktop may be writing the same row; viewers drop a track once its
 length has run out instead (`Listening.isCurrent`).
 */
@MainActor
@Observable
final class MusicPresenceService {
    /// nil until the first answer; then whether a Spotify account is linked.
    private(set) var connected: Bool?
    private(set) var current: Listening?

    private var loop: Task<Void, Never>?
    private var lastPublished: Listening?
    private var userId: String?
    private weak var presence: PresenceService?

    /// Start (or restart) polling for the signed-in user. Pass nil to stop.
    func start(userId: String?, presence: PresenceService) {
        stop()
        self.userId = userId
        self.presence = presence
        guard userId != nil else { connected = nil; current = nil; return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let wait = await self.tick()
                try? await Task.sleep(nanoseconds: wait * 1_000_000_000)
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    /// Check right away, e.g. after connecting or on coming back to the app.
    func refreshNow() {
        guard let userId, let presence else { return }
        start(userId: userId, presence: presence)
    }

    /// One poll. Returns how long to wait before the next one, in seconds.
    private func tick() async -> UInt64 {
        guard let result = await fetchNowPlaying() else { return 15 }  // network or Spotify trouble
        connected = result.connected
        // Nothing linked: ask rarely. A connection made on another device
        // still shows up within a few minutes, or straight away from Settings.
        guard result.connected else {
            if lastPublished != nil { await publish(nil) }
            current = nil
            return 300
        }
        current = result.listening
        if changed(result.listening) { await publish(result.listening) }
        return 8
    }

    /// Republish when the track changes, or when the same track restarted or
    /// was seeked (its start moves by more than polling jitter).
    private func changed(_ next: Listening?) -> Bool {
        guard let next else { return lastPublished != nil }
        guard let last = lastPublished, last.identity == next.identity else { return true }
        guard let a = last.startedDate, let b = next.startedDate else { return false }
        return abs(a.timeIntervalSince(b)) > 2
    }

    private func publish(_ listening: Listening?) async {
        lastPublished = listening
        await presence?.updateListening(listening)
        guard let userId else { return }
        _ = try? await SupabaseManager.client
            .from("profiles")
            .update(ListeningUpdate(listening: listening))
            .eq("id", value: userId)
            .execute()
    }

    private struct NowPlaying: Decodable {
        let connected: Bool?
        let listening: Listening?
    }

    private struct ListeningUpdate: Encodable {
        let listening: Listening?
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(listening, forKey: .listening)  // null clears it
        }
        enum CodingKeys: String, CodingKey { case listening }
    }

    private func fetchNowPlaying() async -> (connected: Bool, listening: Listening?)? {
        guard let token = try? await SupabaseManager.client.auth.session.accessToken else { return nil }
        var req = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/music/spotify/now-playing"))
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (data, response) = try? await URLSession.shared.data(for: req),
              let http = response as? HTTPURLResponse, http.statusCode == 200,
              let body = try? JSONDecoder().decode(NowPlaying.self, from: data) else { return nil }
        return (body.connected == true, body.listening)
    }

    // MARK: Connecting

    private struct ConnectConfig: Decodable {
        let connected: Bool?
        let clientId: String?
        let redirectUri: String?
        enum CodingKeys: String, CodingKey {
            case connected
            case clientId = "client_id"
            case redirectUri = "redirect_uri"
        }
    }

    private var authSession: ASWebAuthenticationSession?
    private let anchor = PresentationAnchor()

    /// Link a Spotify account. Spotify's sign-in opens in the system sheet;
    /// the web callback page hands the one-time code back on `disband://`
    /// (it does that when the state starts with "app:"), and the code is
    /// exchanged here with this app's own session, so nobody has to be
    /// signed in on the web. Returns an error to show, or nil once linked
    /// (or when the person cancelled).
    func connect() async -> String? {
        guard let token = try? await SupabaseManager.client.auth.session.accessToken else {
            return "You're signed out. Sign in and try again."
        }
        var req = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/music/spotify/token"))
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let config = try? JSONDecoder().decode(ConnectConfig.self, from: data),
              let clientId = config.clientId, let redirect = config.redirectUri else {
            return "Couldn't reach Disband. Check your connection and try again."
        }

        var auth = URLComponents(string: "https://accounts.spotify.com/authorize")!
        auth.queryItems = [
            .init(name: "client_id", value: clientId),
            .init(name: "response_type", value: "code"),
            .init(name: "redirect_uri", value: redirect),
            .init(name: "scope", value: "user-read-currently-playing user-read-playback-state"),
            .init(name: "state", value: "app:\(UUID().uuidString)"),
        ]
        guard let authURL = auth.url else { return "Couldn't start Spotify sign-in." }

        let callback: URL? = await withCheckedContinuation { continuation in
            let session = ASWebAuthenticationSession(url: authURL, callbackURLScheme: "disband") { url, _ in
                continuation.resume(returning: url)
            }
            session.presentationContextProvider = anchor
            authSession = session
            if !session.start() { continuation.resume(returning: nil) }
        }
        authSession = nil

        guard let callback,
              let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value else {
            return nil  // cancelled
        }

        var exchange = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/music/spotify/token"))
        exchange.httpMethod = "POST"
        exchange.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        exchange.setValue("application/json", forHTTPHeaderField: "Content-Type")
        exchange.httpBody = try? JSONSerialization.data(withJSONObject: ["code": code, "redirect_uri": redirect])
        guard let (_, response) = try? await URLSession.shared.data(for: exchange),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            return "Spotify didn't accept that sign-in. Try again."
        }
        connected = true
        refreshNow()
        return nil
    }

    /// Unlink Spotify from this account, everywhere.
    func disconnect() async -> Bool {
        guard let token = try? await SupabaseManager.client.auth.session.accessToken else { return false }
        var req = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/music/spotify/token"))
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (_, response) = try? await URLSession.shared.data(for: req),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return false }
        connected = false
        await publish(nil)
        current = nil
        return true
    }
}

/// Where the Spotify sign-in sheet presents from: the app's key window.
private final class PresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
