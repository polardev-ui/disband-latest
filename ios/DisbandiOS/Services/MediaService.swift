import AVFoundation
import CoreTransferable
import Foundation
import UniformTypeIdentifiers

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
    /// An animated thumbnail for the picker grid — prefers the fixed-width GIF,
    /// which the system decodes as an animated image for a live preview.
    var thumbUrl: String? { images?.fixedWidth?.url ?? fullUrl }
}

private struct GiphyResponse: Codable {
    let results: [GiphyGif]?
    let data: [GiphyGif]?
}

/// Uploads to the same media API the web/desktop apps use and proxies Giphy search.
enum MediaService {
    private static let apiBase = AppConfig.mediaAPIURL  // giphy, link previews
    private static let cdnBase = AppConfig.cdnURL       // uploads and delivery

    enum MediaError: LocalizedError {
        case uploadFailed(String)
        var errorDescription: String? {
            switch self { case .uploadFailed(let m): return m }
        }
    }

    /**
     Uploads data via multipart/form-data to `/images`, returns the hosted URL.

     `onProgress` receives 0...1 as the bytes go out. Without it the app could
     only show a spinner, which says a file is uploading but not whether it is
     nearly done or barely started — the difference that matters on a phone
     sending a video over a weak connection.
     */
    static func uploadImage(_ data: Data, filename: String = "upload.jpg",
                            mimeType: String = "image/jpeg",
                            onProgress: (@Sendable (Double) -> Void)? = nil)
        async throws -> MediaUploadResult
    {
        let endpoint = cdnBase.appendingPathComponent("images")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)",
                         forHTTPHeaderField: "Content-Type")

        // The CDN only accepts uploads from a signed-in user, so the bucket
        // cannot be used as free storage by whoever finds the endpoint.
        if let token = try? await SupabaseManager.client.auth.session.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        body.append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n")

        let (respData, response): (Data, URLResponse)
        if let onProgress {
            (respData, response) = try await UploadProgressReporter.upload(
                request: request, body: body, onProgress: onProgress,
            )
        } else {
            (respData, response) = try await URLSession.shared.upload(for: request, from: body)
        }
        return try decodeUpload(respData, response)
    }

    private static func decodeUpload(_ respData: Data, _ response: URLResponse) throws -> MediaUploadResult {
        struct APIResponse: Codable { let success: Bool?; let url: String?; let key: String?; let message: String?; let error: String? }
        let decoded = try? JSONDecoder().decode(APIResponse.self, from: respData)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 413 { throw MediaError.uploadFailed("That file is bigger than your upload limit.") }
            throw MediaError.uploadFailed(decoded?.message ?? decoded?.error ?? "Upload failed (HTTP \(status))")
        }
        guard let decoded, let url = decoded.url, decoded.success != false else {
            throw MediaError.uploadFailed(decoded?.message ?? "Upload failed")
        }
        return MediaUploadResult(url: url, key: decoded.key)
    }

    // MARK: - Files (video)

    /**
     Uploads a file from disk, streaming it rather than loading it into memory.

     The multipart body is assembled into a temporary file and handed to
     `URLSession` as a file upload. Building it as `Data` meant holding the
     whole video in memory twice, and a large one got the app terminated.
     */
    static func uploadFile(at fileURL: URL, filename: String, mimeType: String,
                           onProgress: (@Sendable (Double) -> Void)? = nil) async throws -> MediaUploadResult {
        var request = URLRequest(url: cdnBase.appendingPathComponent("images"))
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = try? await SupabaseManager.client.auth.session.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let bodyURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("upload-\(UUID().uuidString).multipart")
        defer { try? FileManager.default.removeItem(at: bodyURL) }
        try writeMultipart(from: fileURL, to: bodyURL, boundary: boundary,
                           filename: filename, mimeType: mimeType)

        let reporter = UploadProgressReporter(onProgress: onProgress ?? { _ in })
        let session = URLSession(configuration: .default, delegate: reporter, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (respData, response) = try await session.upload(for: request, fromFile: bodyURL)
        return try decodeUpload(respData, response)
    }

    private static func writeMultipart(from source: URL, to destination: URL, boundary: String,
                                       filename: String, mimeType: String) throws {
        FileManager.default.createFile(atPath: destination.path, contents: nil)
        let out = try FileHandle(forWritingTo: destination)
        defer { try? out.close() }
        var head = Data()
        head.append("--\(boundary)\r\n")
        head.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        head.append("Content-Type: \(mimeType)\r\n\r\n")
        try out.write(contentsOf: head)

        let input = try FileHandle(forReadingFrom: source)
        defer { try? input.close() }
        while let chunk = try input.read(upToCount: 4 * 1024 * 1024), !chunk.isEmpty {
            try out.write(contentsOf: chunk)
        }
        var tail = Data()
        tail.append("\r\n--\(boundary)--\r\n")
        try out.write(contentsOf: tail)
    }

    /**
     Re-encodes a picked video as H.264 MP4, at most 1080p.

     iPhones record HEVC in a QuickTime container, which Safari plays and
     Chrome and Firefox don't — so a video sent from a phone showed as a black
     box to everyone on the web and desktop apps. MP4/H.264 plays everywhere,
     and is usually smaller than the camera original.
     */
    static func prepareVideo(_ source: URL, onProgress: (@Sendable (Double) -> Void)? = nil) async throws -> URL {
        let asset = AVURLAsset(url: source)
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1920x1080) else {
            throw MediaError.uploadFailed("This video can't be converted.")
        }
        let output = FileManager.default.temporaryDirectory
            .appendingPathComponent("video-\(UUID().uuidString).mp4")
        export.outputURL = output
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true

        let ticker = Task {
            while !Task.isCancelled {
                onProgress?(Double(export.progress))
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
        defer { ticker.cancel() }
        await withCheckedContinuation { cont in export.exportAsynchronously { cont.resume() } }
        guard export.status == .completed else {
            throw MediaError.uploadFailed(export.error?.localizedDescription ?? "Couldn't prepare the video.")
        }
        return output
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

/**
 Runs one upload and reports how much of it has gone out.

 URLSession only reports upload progress through a delegate, and the delegate
 has to outlive the call, so it owns its own session and holds itself until the
 task finishes.
 */
private final class UploadProgressReporter: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    static func upload(
        request: URLRequest,
        body: Data,
        onProgress: @escaping @Sendable (Double) -> Void,
    ) async throws -> (Data, URLResponse) {
        let reporter = UploadProgressReporter(onProgress: onProgress)
        let session = URLSession(configuration: .default, delegate: reporter, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        return try await session.upload(for: request, from: body)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64,
                    totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }
}

private extension Data {
    mutating func append(_ string: String) {
        if let d = string.data(using: .utf8) { append(d) }
    }
}

/// A video chosen in the photo picker, delivered as a file on disk.
///
/// Loading a video as `Data` reads the whole thing into memory; a file
/// representation hands over a copy on disk instead. The copy is ours to
/// keep, because the picker deletes its own once this returns.
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let copy = FileManager.default.temporaryDirectory
                .appendingPathComponent("picked-\(UUID().uuidString).\(received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension)")
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}
