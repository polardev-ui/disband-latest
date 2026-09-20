import SwiftUI

/// A banner that fills its slot and crops — and can never widen the layout.
///
/// A fill-scaled image asks for its natural aspect at the given height, so a
/// very wide banner asked to be wider than the phone. With the image as the
/// frame's content, that request won: whole cards and profile sheets were
/// laid out past the screen edge, pushing avatars and names off the side.
/// Here the size comes from a clear view that takes whatever width it is
/// offered, and the image is only drawn over it.
struct BannerImage<Fallback: View>: View {
    let url: String?
    let height: CGFloat
    @ViewBuilder var fallback: () -> Fallback

    var body: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .overlay {
                if url != nil {
                    RemoteImage(url: url, contentMode: .fill) { fallback() }
                } else {
                    fallback()
                }
            }
            .clipped()
    }
}
