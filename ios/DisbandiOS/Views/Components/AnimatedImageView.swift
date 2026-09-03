import SwiftUI
import ImageIO
import UniformTypeIdentifiers

/// Decodes animated images (GIF, APNG, animated WebP where the system supports
/// it) into a `UIImage` with a populated `images` array.
///
/// `UIImage(data:)` returns only the *first frame* of an animated GIF, which is
/// why GIFs in chat rendered as stills. ImageIO is the only way to get at the
/// remaining frames and their per-frame delays.
enum AnimatedImageDecoder {
    /// Returns an animated `UIImage` when `data` holds more than one frame,
    /// otherwise nil so the caller can fall back to `UIImage(data:)`.
    static func decode(_ data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let count = CGImageSourceGetCount(source)
        guard count > 1 else { return nil }

        var frames: [UIImage] = []
        frames.reserveCapacity(count)
        var duration: Double = 0

        for index in 0..<count {
            guard let cg = CGImageSourceCreateImageAtIndex(source, index, nil) else { continue }
            frames.append(UIImage(cgImage: cg))
            duration += frameDelay(source: source, index: index)
        }

        guard frames.count > 1 else { return nil }
        // A zero total duration would make UIKit animate at an undefined rate.
        if duration <= 0 { duration = Double(frames.count) / 30 }
        return UIImage.animatedImage(with: frames, duration: duration)
    }

    /// Per-frame delay, honouring the "unclamped" value first. Browsers and iOS
    /// both clamp anything under ~11ms up to 100ms, which is what makes very
    /// fast GIFs play at a sane speed rather than as a blur.
    private static func frameDelay(source: CGImageSource, index: Int) -> Double {
        guard
            let props = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
        else { return 0.1 }

        let container = (props[kCGImagePropertyGIFDictionary] as? [CFString: Any])
            ?? (props[kCGImagePropertyPNGDictionary] as? [CFString: Any])
            ?? (props[kCGImagePropertyWebPDictionary] as? [CFString: Any])

        let unclamped = container?[kCGImagePropertyGIFUnclampedDelayTime] as? Double
            ?? container?[kCGImagePropertyAPNGUnclampedDelayTime] as? Double
        let clamped = container?[kCGImagePropertyGIFDelayTime] as? Double
            ?? container?[kCGImagePropertyAPNGDelayTime] as? Double

        let delay = unclamped ?? clamped ?? 0.1
        return delay < 0.011 ? 0.1 : delay
    }
}

/// Plays an animated `UIImage`.
///
/// SwiftUI's `Image(uiImage:)` renders only the first frame of an animated
/// image — it ignores `UIImage.images` entirely. `UIImageView` animates it
/// natively, so animated frames go through this wrapper instead.
struct AnimatedImageView: UIViewRepresentable {
    let image: UIImage
    var contentMode: UIView.ContentMode = .scaleAspectFit

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView(image: image)
        view.contentMode = contentMode
        view.clipsToBounds = true
        // Let the surrounding SwiftUI frame drive the size rather than the
        // image's intrinsic pixel dimensions, which are often huge.
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        view.startAnimating()
        return view
    }

    func updateUIView(_ view: UIImageView, context: Context) {
        if view.image !== image {
            view.image = image
            view.startAnimating()
        }
        view.contentMode = contentMode
        if !view.isAnimating { view.startAnimating() }
    }
}
