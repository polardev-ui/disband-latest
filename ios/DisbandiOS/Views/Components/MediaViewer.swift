import AVKit
import Photos
import SwiftUI

/**
 Full-screen viewer for an image or video in chat.

 Tapping a photo did nothing and tapping a video handed it to Safari, so the
 only way to look closely at something someone sent — or to keep it — was to
 leave the app. This is the whole of what a viewer needs to be: pinch and
 double-tap to zoom, drag to pan, swipe down to dismiss, and a save that puts
 the file in Photos rather than in a browser's downloads.
 */
struct MediaViewer: View {
    let url: URL
    let kind: AttachmentType
    var fileName: String?

    @Environment(\.dismiss) private var dismiss

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var saveState: SaveState = .idle
    @State private var showShare = false

    private enum SaveState: Equatable {
        case idle, saving, saved, failed(String)
    }

    private var isVideo: Bool { kind == .video }
    private static let maxScale: CGFloat = 6

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if isVideo {
                VideoPlayer(player: AVPlayer(url: url))
                    .ignoresSafeArea()
            } else {
                zoomableImage
            }

            controls
        }
        .statusBarHidden()
        // Dragging down closes, but only while the image is not zoomed in —
        // otherwise panning a zoomed photo would dismiss the viewer instead.
        .gesture(scale <= 1.01 && !isVideo ? dismissDrag : nil)
        .sheet(isPresented: $showShare) { ShareSheet(items: [url]) }
    }

    private var zoomableImage: some View {
        RemoteImage(url: url.absoluteString, contentMode: .fit) {
            ProgressView().tint(.white)
        }
        .scaleEffect(scale)
        .offset(offset)
        .gesture(
            SimultaneousGesture(
                MagnificationGesture()
                    .onChanged { value in
                        scale = min(max(lastScale * value, 1), Self.maxScale)
                    }
                    .onEnded { _ in
                        lastScale = scale
                        if scale <= 1 { resetZoom() }
                    },
                DragGesture()
                    .onChanged { value in
                        guard scale > 1 else { return }
                        offset = CGSize(width: lastOffset.width + value.translation.width,
                                        height: lastOffset.height + value.translation.height)
                    }
                    .onEnded { _ in lastOffset = offset },
            ),
        )
        .onTapGesture(count: 2) {
            withAnimation(.spring(response: 0.3)) {
                if scale > 1 { resetZoom() } else { scale = 2.5; lastScale = 2.5 }
            }
        }
        .ignoresSafeArea()
    }

    private var controls: some View {
        VStack {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.black.opacity(0.45), in: .circle)
                }
                .accessibilityLabel("Close")

                Spacer()

                if let fileName, !fileName.isEmpty {
                    Text(fileName)
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(.black.opacity(0.45), in: .capsule)
                }

                Spacer()

                Button { showShare = true } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.black.opacity(0.45), in: .circle)
                }
                .accessibilityLabel("Share")
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            Spacer()

            saveButton
                .padding(.bottom, 28)
        }
    }

    @ViewBuilder private var saveButton: some View {
        switch saveState {
        case .saved:
            Label("Saved to Photos", systemImage: "checkmark.circle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Brand.online.opacity(0.9), in: .capsule)
        case .failed(let message):
            Text(message)
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(.red.opacity(0.85), in: .capsule)
                .padding(.horizontal, 32)
        default:
            Button { Task { await save() } } label: {
                Label(saveState == .saving ? "Saving…" : "Save",
                      systemImage: "arrow.down.circle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 10)
                    .background(.black.opacity(0.5), in: .capsule)
            }
            .disabled(saveState == .saving)
        }
    }

    private var dismissDrag: some Gesture {
        DragGesture()
            .onChanged { value in
                if value.translation.height > 0 { offset = value.translation }
            }
            .onEnded { value in
                if value.translation.height > 120 {
                    dismiss()
                } else {
                    withAnimation(.spring(response: 0.3)) { offset = .zero }
                }
            }
    }

    private func resetZoom() {
        scale = 1
        lastScale = 1
        offset = .zero
        lastOffset = .zero
    }

    /**
     Saves to the photo library.

     `addOnly` authorisation is deliberate: writing one photo does not need
     permission to read everything already in the library, and asking for the
     smaller thing is far more likely to get a yes.
     */
    private func save() async {
        saveState = .saving

        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            saveState = .failed("Allow photo access in Settings to save this.")
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            try await PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: isVideo ? .video : .photo, data: data, options: nil)
            }
            saveState = .saved
        } catch {
            saveState = .failed("Could not save this file.")
        }
    }
}

/// UIKit's share sheet, for sending a file on to another app.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
