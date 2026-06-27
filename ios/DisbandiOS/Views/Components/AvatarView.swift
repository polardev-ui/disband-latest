import SwiftUI

/// Circular avatar that loads a remote image with a colored initials fallback.
struct AvatarView: View {
    let url: String?
    let name: String
    var size: CGFloat = 40
    var status: UserStatus? = nil
    /// Optional gradient ring drawn around the avatar (e.g. a profile's accent gradient).
    var ringColors: [Color]? = nil
    var ringWidth: CGFloat = 0

    var body: some View {
        // Status dot is the LAST element so it always overlays the ring/avatar.
        ZStack(alignment: .bottomTrailing) {
            avatar
                .overlay {
                    if let ringColors, ringColors.count >= 2, ringWidth > 0 {
                        Circle().strokeBorder(
                            LinearGradient(colors: ringColors,
                                           startPoint: .topLeading, endPoint: .bottomTrailing),
                            lineWidth: ringWidth)
                    }
                }
            if let status {
                Circle()
                    .fill(status.color)
                    .frame(width: size * 0.30, height: size * 0.30)
                    .overlay(Circle().stroke(Brand.background, lineWidth: size * 0.06))
                    .offset(x: size * 0.02, y: size * 0.02)
            }
        }
    }

    @ViewBuilder private var avatar: some View {
        RemoteImage(url: url, contentMode: .fill) { fallback }
            .frame(width: size, height: size)
            .clipShape(Circle())
    }

    private var fallback: some View {
        Circle()
            .fill(Color(seed: name))
            .overlay(
                Text(initials)
                    .font(.system(size: size * 0.4, weight: .semibold))
                    .foregroundStyle(.white)
            )
    }

    private var initials: String {
        guard let first = name.trimmingCharacters(in: .whitespaces).first else { return "?" }
        return String(first).uppercased()
    }
}

/// Generic loading / empty / error placeholder.
struct StateView: View {
    enum Kind { case loading, empty, error }
    let kind: Kind
    var title: String = ""
    var systemImage: String = "tray"

    var body: some View {
        VStack(spacing: 12) {
            switch kind {
            case .loading:
                ProgressView().controlSize(.large).tint(Brand.accent)
            case .empty:
                Image(systemName: systemImage)
                    .font(.system(size: 40))
                    .foregroundStyle(Brand.textMuted)
                Text(title).font(.headline).foregroundStyle(Brand.textSecondary)
            case .error:
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 40))
                    .foregroundStyle(Brand.dnd)
                Text(title.isEmpty ? "Something went wrong" : title)
                    .font(.subheadline)
                    .foregroundStyle(Brand.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
