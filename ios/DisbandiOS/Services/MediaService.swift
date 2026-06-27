import Foundation

struct MediaUploadResult {
    let url: String
    let key: String?
}

/// A GIF result from the Giphy proxy.
struct GiphyGif: Codable, Identifiable, Hashable {
    let id: String
    let url: String?
    let preview: String?

    struct Images: Codable, Hashable {
        struct Variant: Codable, Hashable { let url: String? }
        let original: Variant?
        let fixedWidth: Variant?
        enum CodingKeys: String, CodingKey {
            case original
            case fixedWidth = "fixed_width"
        }
    }
    let images: Images?

    var fullUrl: String? { url ?? images?.original?.url ?? images?.fixedWidth?.url ?? preview }
    var thumbUrl: String? { preview ?? images?.fixedWidth?.url ?? fullUrl }
}

private struct GiphyResponse: Codable {
    let results: [GiphyGif]?
    let data: [GiphyGif]?
}

/// Uploads to the same media API the web/desktop apps use and proxies Giphy search.
enum MediaService {
    private static let apiBase = AppConfig.mediaAPIURL  // https://api.wsgpolar.me/v1

    enum MediaError: LocalizedError {
        case uploadFailed(String)
        var errorDescription: String? {
            switch self { case .uploadFailed(let m): return m }
        }
    }

    /// Uploads image data via multipart/form-data to `/images`, returns the hosted URL.
    static func uploadImage(_ data: Data, filename: String = "upload.jpg",
                            mimeType: String = "image/jpeg") async throws -> MediaUploadResult {
        let endpoint = apiBase.appendingPathComponent("images")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)",
                         forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        body.append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n")

        let (respData, response) = try await URLSession.shared.upload(for: request, from: body)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw MediaError.uploadFailed("Upload failed (HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0))")
        }
        struct APIResponse: Codable { let success: Bool?; let url: String?; let key: String?; let message: String? }
        let decoded = try JSONDecoder().decode(APIResponse.self, from: respData)
        guard let url = decoded.url, decoded.success != false else {
            throw MediaError.uploadFailed(decoded.message ?? "Upload failed")
        }
        return MediaUploadResult(url: url, key: decoded.key)
    }

    /// Searches GIFs via the media-API Giphy proxy.
    static func searchGifs(_ query: String, limit: Int = 24) async throws -> [GiphyGif] {
        let q = query.trimmingCharacters(in: .whitespaces).isEmpty ? "trending" : query
        var comps = URLComponents(url: apiBase.appendingPathComponent("giphy/search"),
                                  resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "q", value: q),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        let (data, _) = try await URLSession.shared.data(from: comps.url!)
        let decoded = try JSONDecoder().decode(GiphyResponse.self, from: data)
        return decoded.results ?? decoded.data ?? []
    }
}

private extension Data {
    mutating func append(_ string: String) {
        if let d = string.data(using: .utf8) { append(d) }
    }
}
