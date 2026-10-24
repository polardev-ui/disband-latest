import Foundation
import Supabase

/**
 The signed-in user's favourite GIFs, shared with the web and desktop through
 `/api/gifs/favorites`, so a star on the phone shows up everywhere.

 Favourites are matched the way the web matches them (`gifFavKey`): host
 without `www.` plus path, ignoring query and fragment, since CDNs add sizing
 and tracking parameters to the same GIF.
 */
@MainActor
final class GifFavoritesService: ObservableObject {
    static let shared = GifFavoritesService()

    struct Favorite: Codable, Identifiable, Hashable {
        let id: Int?
        let url: String
        let title: String?
        var stableId: String { GifFavoritesService.key(url) }
    }

    @Published private(set) var favorites: [Favorite] = []
    @Published private(set) var loaded = false

    private init() {}

    nonisolated static func key(_ url: String) -> String {
        let raw = url.trimmingCharacters(in: .whitespaces)
        guard let comps = URLComponents(string: raw), let host = comps.host else { return raw }
        var h = host.lowercased()
        if h.hasPrefix("www.") { h.removeFirst(4) }
        var path = comps.path
        while path.hasSuffix("/") { path.removeLast() }
        return h + path
    }

    func isFavorite(_ url: String) -> Bool {
        let k = Self.key(url)
        return favorites.contains { Self.key($0.url) == k }
    }

    func refresh() async {
        guard let data = try? await request(method: "GET", body: nil) else { return }
        struct Response: Decodable { let favorites: [Favorite] }
        if let decoded = try? JSONDecoder().decode(Response.self, from: data) {
            favorites = decoded.favorites
        }
        loaded = true
    }

    /// Optimistic: the star flips at once and rolls back if the server says no.
    func toggle(_ url: String, title: String? = nil) async {
        let k = Self.key(url)
        let previous = favorites
        let existing = favorites.first { Self.key($0.url) == k }
        if let existing {
            favorites.removeAll { Self.key($0.url) == k }
            let body: [String: Any] = existing.id.map { ["id": $0] } ?? ["url": existing.url]
            if (try? await request(method: "DELETE", body: body)) == nil { favorites = previous }
        } else {
            favorites.append(Favorite(id: nil, url: url, title: title))
            var body: [String: Any] = ["url": url]
            if let title { body["title"] = title }
            if (try? await request(method: "POST", body: body)) == nil {
                favorites = previous
            } else {
                await refresh()
            }
        }
    }

    private func request(method: String, body: [String: Any]?) async throws -> Data {
        let token = try await SupabaseManager.client.auth.session.accessToken
        var req = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/gifs/favorites"))
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }
}
