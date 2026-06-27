import SwiftUI

/// In-memory image cache (backed additionally by URLSession's disk cache).
final class ImageCache {
    static let shared = ImageCache()
    private let cache = NSCache<NSString, UIImage>()
    private init() { cache.countLimit = 500 }

    func image(for key: String) -> UIImage? { cache.object(forKey: key as NSString) }
    func set(_ image: UIImage, for key: String) { cache.setObject(image, forKey: key as NSString) }
}

/// A reliable remote image: caches in memory, falls back to a placeholder, and
/// retries transient failures — so avatars/banners don't intermittently vanish.
struct RemoteImage<Placeholder: View>: View {
    let url: String?
    var contentMode: ContentMode = .fill
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                placeholder()
            }
        }
        .task(id: url) { await load() }
    }

    private func load() async {
        image = nil
        guard let url, let parsed = URL(string: url) else { return }
        if let cached = ImageCache.shared.image(for: url) { image = cached; return }

        for attempt in 0..<4 {
            if Task.isCancelled { return }
            do {
                var req = URLRequest(url: parsed)
                req.cachePolicy = .returnCacheDataElseLoad
                req.timeoutInterval = 20
                let (data, _) = try await URLSession.shared.data(for: req)
                if let img = UIImage(data: data) {
                    ImageCache.shared.set(img, for: url)
                    if !Task.isCancelled { image = img }
                    return
                }
            } catch {
                // exponential-ish backoff before retrying
                try? await Task.sleep(nanoseconds: UInt64(250_000_000 * (attempt + 1)))
            }
        }
    }
}
