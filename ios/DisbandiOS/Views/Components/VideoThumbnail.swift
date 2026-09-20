import AVFoundation
import SwiftUI

/// A video's poster frame with a play button, so a video message looks like a
/// video instead of a file. Frames are pulled from the remote file (only the
/// bytes needed, thanks to MP4's fast-start layout) and cached per URL.
struct VideoThumbnail: View {
    let url: URL
    var maxWidth: CGFloat = 280

    @State private var poster: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            if let poster {
                Image(uiImage: poster)
                    .resizable()
                    .scaledToFill()
            } else {
                Rectangle().fill(Brand.elevated)
                if !failed { ProgressView().tint(Brand.textMuted) }
            }
            Image(systemName: "play.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(.black.opacity(0.45), in: Circle())
                .overlay(Circle().stroke(.white.opacity(0.25), lineWidth: 1))
        }
        .frame(maxWidth: maxWidth)
        .aspectRatio(aspect, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .task(id: url) { await load() }
        .accessibilityLabel("Video")
    }

    private var aspect: CGFloat {
        guard let poster, poster.size.height > 0 else { return 16 / 9 }
        // Portrait phone videos stay portrait, but not absurdly tall.
        return max(poster.size.width / poster.size.height, 0.6)
    }

    private func load() async {
        if let cached = PosterCache.shared.object(forKey: url as NSURL) {
            poster = cached
            return
        }
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 720, height: 720)
        do {
            let (image, _) = try await generator.image(at: CMTime(seconds: 0.4, preferredTimescale: 600))
            let ui = UIImage(cgImage: image)
            PosterCache.shared.setObject(ui, forKey: url as NSURL)
            poster = ui
        } catch {
            failed = true
        }
    }
}

private enum PosterCache {
    static let shared: NSCache<NSURL, UIImage> = {
        let cache = NSCache<NSURL, UIImage>()
        cache.countLimit = 120
        return cache
    }()
}
