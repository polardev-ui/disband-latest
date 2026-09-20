import SwiftUI
import WebRTC

/// Renders one WebRTC video track (a participant's camera or screen).
struct MeshVideoView: UIViewRepresentable {
    let track: RTCVideoTrack
    var mirrored = false
    /// Screens must never be cropped; faces fill their tile.
    var fit = false

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.videoContentMode = fit ? .scaleAspectFit : .scaleAspectFill
        view.clipsToBounds = true
        view.transform = mirrored ? CGAffineTransform(scaleX: -1, y: 1) : .identity
        track.add(view)
        context.coordinator.track = track
        return view
    }

    func updateUIView(_ view: RTCMTLVideoView, context: Context) {
        view.transform = mirrored ? CGAffineTransform(scaleX: -1, y: 1) : .identity
        guard context.coordinator.track !== track else { return }
        context.coordinator.track?.remove(view)
        track.add(view)
        context.coordinator.track = track
    }

    static func dismantleUIView(_ view: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.track?.remove(view)
        coordinator.track = nil
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var track: RTCVideoTrack?
    }
}
