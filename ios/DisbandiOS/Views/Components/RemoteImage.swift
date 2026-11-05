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
///
/// Animated sources (GIF/APNG) are decoded to a multi-frame `UIImage` and
/// rendered through `AnimatedImageView`; SwiftUI's own `Image` shows only the
/// first frame, which is why GIFs used to appear frozen.
struct RemoteImage<Placeholder: View>: View {
    let url: String?
    var contentMode: ContentMode = .fill
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: UIImage?

    var body: some View {
        Group {
            // A cached image draws on the very first frame. Waiting for the
            // task flashed the placeholder first, even for a picture already
            // in memory — enough to nudge a chat that had just settled.
            if let image = image ?? url.flatMap({ ImageCache.shared.image(for: $0) }) {
                if (image.images?.count ?? 0) > 1 {
                    AnimatedImageView(
                        image: image,
                        contentMode: contentMode == .fill ? .scaleAspectFill : .scaleAspectFit
                    )
                    // The UIKit view reports no size of its own, so without
                    // this it filled whatever box it was offered and a GIF sat
                    // letterboxed in empty space. Give it the image's shape.
                    .aspectRatio(
                        image.size.width / max(image.size.height, 1),
                        contentMode: contentMode
                    )
                    // A UIKit view takes the touch for itself, so a button
                    // wrapped round a GIF (a space icon with an animated
                    // picture) never saw the tap. Images never need touches.
                    .allowsHitTesting(false)
                } else {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                }
            } else {
                placeholder()
            }
        }
        .task(id: url) { await load() }
    }

    private func load() async {
        guard let url, let parsed = URL(string: url) else { image = nil; return }
        if image != nil, ImageCache.shared.image(for: url) === image { return }
        image = nil
        if let cached = ImageCache.shared.image(for: url) { image = cached; return }

        for attempt in 0..<4 {
            if Task.isCancelled { return }
            do {
                var req = URLRequest(url: parsed)
                req.cachePolicy = .returnCacheDataElseLoad
                req.timeoutInterval = 20
                let (data, _) = try await URLSession.shared.data(for: req)
                // Animated first: UIImage(data:) would silently flatten it.
                if let img = AnimatedImageDecoder.decode(data) ?? UIImage(data: data) {
                    ImageCache.shared.set(img, for: url)
                    MediaSize.shared.record(img, for: url)
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

/// Remembered aspect ratios (width / height) of images shown in chat, so a
/// placeholder can be the size the picture will be. Attachments carry no
/// dimensions, so each image is measured once — the first time it is
/// fetched — and kept on the device from then on.
@MainActor
final class MediaSize {
    static let shared = MediaSize()
    private static let key = "chatMediaAspects"
    private static let limit = 3000
    private var aspects: [String: Double]
    private var saveTask: Task<Void, Never>?

    private init() {
        aspects = UserDefaults.standard.dictionary(forKey: Self.key) as? [String: Double] ?? [:]
    }

    func aspect(for url: String) -> Double? { aspects[url] }

    func record(_ image: UIImage, for url: String) {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return }
        let ratio = Double(size.width / size.height)
        guard aspects[url] != ratio else { return }
        if aspects.count >= Self.limit { aspects.removeAll(keepingCapacity: true) }
        aspects[url] = ratio
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            UserDefaults.standard.set(self.aspects, forKey: Self.key)
        }
    }

    /// The box an image takes in a message, from its aspect when known.
    static func box(aspect: Double?, maxWidth: CGFloat = 260, maxHeight: CGFloat = 280) -> CGSize {
        guard let a = aspect, a > 0 else { return CGSize(width: maxWidth, height: maxWidth * 0.75) }
        var w = min(maxWidth, maxHeight * CGFloat(a))
        w = max(w, 80)
        return CGSize(width: w, height: min(maxHeight, w / CGFloat(a)))
    }

    /// Fetch, decode, cache and measure the images not seen before, in
    /// parallel, giving up after `timeout`. Called before a conversation
    /// paints so its pictures arrive with it instead of shoving it down.
    static func prefetch(_ urls: [String], timeout: Duration = .milliseconds(1500)) async {
        let missing = Array(Set(urls.filter { ImageCache.shared.image(for: $0) == nil }))
        guard !missing.isEmpty else { return }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { try? await Task.sleep(for: timeout) }
            group.addTask {
                await withTaskGroup(of: Void.self) { inner in
                    for url in missing.prefix(40) {
                        inner.addTask { await fetch(url) }
                    }
                }
            }
            // Whichever finishes first: all images, or the time limit.
            await group.next()
            group.cancelAll()
        }
    }

    nonisolated private static func fetch(_ url: String) async {
        guard let parsed = URL(string: url) else { return }
        var req = URLRequest(url: parsed)
        req.cachePolicy = .returnCacheDataElseLoad
        req.timeoutInterval = 15
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let img = AnimatedImageDecoder.decode(data) ?? UIImage(data: data) else { return }
        ImageCache.shared.set(img, for: url)
        await MainActor.run { MediaSize.shared.record(img, for: url) }
    }
}

/// A chat image in a box that is already its final size, so loading it never
/// moves the conversation.
struct SizedChatImage: View {
    let url: String
    var maxWidth: CGFloat = 260
    var maxHeight: CGFloat = 280

    var body: some View {
        let box = MediaSize.box(aspect: MediaSize.shared.aspect(for: url),
                                maxWidth: maxWidth, maxHeight: maxHeight)
        RemoteImage(url: url, contentMode: .fill) {
            Rectangle().fill(Brand.elevated)
                .overlay(ProgressView().tint(Brand.textMuted))
        }
        .frame(width: box.width, height: box.height)
        .clipShape(.rect(cornerRadius: 10))
    }
}
