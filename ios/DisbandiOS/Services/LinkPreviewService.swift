import Foundation

/// Open Graph metadata for a link posted in chat.
struct LinkPreview: Identifiable, Sendable, Equatable {
    var url: String
    var title: String
    var description: String?
    var imageUrl: String?

    var id: String { url }

    var host: String {
        URL(string: url)?.host?.replacingOccurrences(of: "www.", with: "") ?? url
    }
}

/// Fetches link previews through the web app's `/api/link/preview`.
///
/// Deliberately not scraped on the device: that endpoint already carries the
/// SSRF guard and rate limiting, and pointing the phone at arbitrary URLs
/// chosen by whoever sent the message would hand a stranger the ability to
/// make the app fetch anything, from the user's network.
actor LinkPreviewService {
    static let shared = LinkPreviewService()

    private var cache: [String: LinkPreview?] = [:]
    private var inflight: [String: Task<LinkPreview?, Never>] = [:]

    func preview(for url: String) async -> LinkPreview? {
        if let cached = cache[url] { return cached }
        if let running = inflight[url] { return await running.value }

        let task = Task<LinkPreview?, Never> { await self.fetch(url) }
        inflight[url] = task
        let result = await task.value
        inflight[url] = nil
        cache[url] = result
        return result
    }

    private func fetch(_ url: String) async -> LinkPreview? {
        guard var components = URLComponents(
            url: AppConfig.webAppURL.appendingPathComponent("api/link/preview"),
            resolvingAgainstBaseURL: false
        ) else { return nil }
        components.queryItems = [URLQueryItem(name: "url", value: url)]
        guard let endpoint = components.url else { return nil }

        var request = URLRequest(url: endpoint)
        request.timeoutInterval = 8

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            let payload = try JSONDecoder().decode(Payload.self, from: data)

            let title = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines)
            let description = payload.description?.trimmingCharacters(in: .whitespacesAndNewlines)
            let image = payload.image?.trimmingCharacters(in: .whitespacesAndNewlines)

            // A preview with nothing but the host adds noise rather than
            // information, so it is not worth a card.
            guard let title, !title.isEmpty else { return nil }

            return LinkPreview(
                url: url,
                title: title,
                description: (description?.isEmpty == false) ? description : nil,
                imageUrl: (image?.isEmpty == false) ? image : nil
            )
        } catch {
            return nil
        }
    }

    private struct Payload: Decodable {
        let title: String?
        let description: String?
        let image: String?
    }
}

/// Pulls invite codes and plain links out of message text.
///
/// Mirrors `src/lib/utils.ts` on the web so both clients agree on what counts
/// as an invite; a link that is an invite is rendered as a join card instead of
/// a preview, never both.
enum MessageLinks {
    // `/invite/` is accepted alongside `/server/` so invites already sent from
    // older builds still render a join card rather than a dead link. Case
    // insensitive throughout: keyboards capitalise "Https://" at the start of
    // a message, and a capital H stopped every URL from being recognised.
    private static let inviteRegex = try! NSRegularExpression(
        pattern: #"(?:https?://[^\s]+)?/(?:server|invite)/([a-zA-Z0-9]{7})\b"#,
        options: [.caseInsensitive]
    )
    private static let urlRegex = try! NSRegularExpression(
        pattern: #"https?://[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'"`]"#,
        options: [.caseInsensitive]
    )

    static func inviteCodes(in text: String) -> [String] {
        let range = NSRange(text.startIndex..., in: text)
        var codes: [String] = []
        for match in inviteRegex.matches(in: text, range: range) {
            guard match.numberOfRanges > 1,
                  let r = Range(match.range(at: 1), in: text) else { continue }
            let code = String(text[r])
            if !codes.contains(code) { codes.append(code) }
        }
        return codes
    }

    static func previewURLs(in text: String, max: Int = 2) -> [String] {
        let invites = Set(inviteCodes(in: text))
        let range = NSRange(text.startIndex..., in: text)
        var urls: [String] = []
        for match in urlRegex.matches(in: text, range: range) {
            guard let r = Range(match.range, in: text) else { continue }
            let url = String(text[r])
            // Skip a link that is already being shown as an invite card.
            if let code = inviteCodes(in: url).first, invites.contains(code) { continue }
            if urls.contains(url) { continue }
            urls.append(url)
            if urls.count >= max { break }
        }
        return urls
    }
}
