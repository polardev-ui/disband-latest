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
    ///
    /// `maxPixelSize` shrinks every frame to fit that many pixels on its long
    /// side, and `maxFrames` keeps an even spread of at most that many frames
    /// (the timing is kept). Both cut memory for big animations: a 320px,
    /// 150-frame sticker is about 60 MB decoded in full.
    static func decode(_ data: Data, maxPixelSize: Int? = nil, maxFrames: Int? = nil) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let count = CGImageSourceGetCount(source)
        guard count > 1 else { return nil }

        let step = max(1, Int((Double(count) / Double(maxFrames ?? count)).rounded(.up)))
        let thumbOptions: CFDictionary? = maxPixelSize.map {
            [kCGImageSourceCreateThumbnailFromImageAlways: true,
             kCGImageSourceCreateThumbnailWithTransform: true,
             kCGImageSourceShouldCacheImmediately: true,
             kCGImageSourceThumbnailMaxPixelSize: $0] as CFDictionary
        }

        var frames: [UIImage] = []
        frames.reserveCapacity(count / step + 1)
        var duration: Double = 0

        for index in 0..<count {
            duration += frameDelay(source: source, index: index)
            guard index % step == 0 else { continue }
            let cg = thumbOptions.map { CGImageSourceCreateThumbnailAtIndex(source, index, $0) }
                ?? CGImageSourceCreateImageAtIndex(source, index, nil)
            guard let cg else { continue }
            frames.append(UIImage(cgImage: cg))
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
            ?? container?[kCGImagePropertyWebPUnclampedDelayTime] as? Double
        let clamped = container?[kCGImagePropertyGIFDelayTime] as? Double
            ?? container?[kCGImagePropertyAPNGDelayTime] as? Double
            ?? container?[kCGImagePropertyWebPDelayTime] as? Double

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

    /// A `UIImageView` reports the image's pixel dimensions as its intrinsic
    /// content size, and SwiftUI takes a representable at its word: a 1024pt
    /// avatar made every ancestor 1024pt wide. Layout priorities do not help,
    /// because they rank constraints rather than removing the intrinsic size —
    /// only refusing to report one does.
    final class SizeAgnosticImageView: UIImageView {
        override var intrinsicContentSize: CGSize {
            CGSize(width: UIView.noIntrinsicMetric, height: UIView.noIntrinsicMetric)
        }
    }

    func makeUIView(context: Context) -> UIImageView {
        let view = SizeAgnosticImageView(image: image)
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

    /// Take the size SwiftUI proposes rather than the image's own. Without
    /// this an unspecified proposal falls back to the intrinsic size, which is
    /// exactly the case that broke the call screen: an animated avatar behind
    /// the blur sized the whole layer to the source image, so the ZStack grew
    /// past the screen and everything centred in it — the caller's name, the
    /// call controls — was pushed off to the right and clipped.
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIImageView, context: Context) -> CGSize? {
        // Fall back to the image's own size only when nothing is proposed at
        // all. Defaulting to SwiftUI's 10x10 would shrink a GIF that sits in a
        // `maxWidth` frame down to nothing.
        proposal.replacingUnspecifiedDimensions(by: image.size)
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
