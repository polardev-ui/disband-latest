import SwiftUI

/// The message box: a single capsule floating above the conversation rather
/// than a bar bolted to the bottom edge. Attach sits inside it on the left;
/// send slides in on the right only once there is something to send.
struct MessageComposer: View {
    @Binding var text: String
    var uploading: Bool = false
    var onSend: () -> Void
    var onGif: () -> Void = {}
    var onPhoto: () -> Void = {}

    @FocusState private var focused: Bool

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            attachButton

            TextField("Message", text: $text, axis: .vertical)
                .lineLimit(1...6)
                .font(.body)
                .foregroundStyle(Brand.textPrimary)
                .focused($focused)
                // Height matches the 44pt buttons, so with the row bottom-
                // aligned a single line sits on the same centre as they do;
                // extra lines grow upward past it.
                .padding(.vertical, 11)
                .frame(minHeight: 44)

            if canSend {
                sendButton
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
        }
        .padding(.leading, 4)
        .padding(.trailing, canSend ? 4 : 14)
        .padding(.vertical, 3)
        .background {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .fill(Brand.elevated.opacity(0.75))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .strokeBorder(focused ? Brand.accent.opacity(0.55) : Color.white.opacity(0.07),
                                      lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.25), radius: 14, y: 6)
        }
        .animation(.snappy(duration: 0.22), value: canSend)
        .animation(.easeOut(duration: 0.15), value: focused)
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .padding(.bottom, 8)
        // Swiping down on the composer dismisses the keyboard (the iOS
        // "keyboard grab" gesture). Only when it's actually up.
        .highPriorityGesture(
            DragGesture(minimumDistance: 12)
                .onEnded { value in
                    if value.translation.height > 30 { focused = false }
                }
        )
    }

    /// 44×44 is Apple's minimum comfortable touch target.
    private var attachButton: some View {
        Menu {
            Button { onPhoto() } label: { Label("Photo", systemImage: "photo") }
            Button { onGif() } label: { Label("GIF", systemImage: "sparkles") }
        } label: {
            ZStack {
                if uploading {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Brand.textPrimary)
                        .frame(width: 36, height: 36)
                        .background(Brand.surface, in: Circle())
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .disabled(uploading)
        .accessibilityLabel("Attach")
    }

    private var sendButton: some View {
        Button(action: onSend) {
            Image(systemName: "arrow.up")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(Brand.accent.gradient, in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Send")
    }
}
