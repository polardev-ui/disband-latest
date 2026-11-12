import SwiftUI

/// The message box, as on desktop: a flat rounded rectangle (12pt corners)
/// in the composer colour with a hairline border that turns brand-coloured
/// while typing. Attach on the left; GIF and emoji on the right, giving way
/// to send once there is something to send.
struct MessageComposer: View {
    @Binding var text: String
    var uploading: Bool = false
    var onSend: () -> Void
    var onGif: () -> Void = {}
    var onPhoto: () -> Void = {}
    /// Nil where polls can't be posted (while editing a message).
    var onPoll: (() -> Void)? = nil
    /// "Message #general", "Message @name": says where this will go.
    var placeholder: String = "Message"
    /// Photos or videos are waiting to go, so send works with no text.
    var hasAttachments: Bool = false
    /// Images or GIFs pasted into the box (their original bytes).
    var onPasteImages: (([Data]) -> Void)? = nil

    @State private var focused = false

    private var canSend: Bool {
        hasAttachments || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            attachButton

            // Height matches the 44pt buttons, so with the row bottom-aligned
            // a single line sits on the same centre as they do; extra lines
            // grow upward past it. A text view rather than a TextField so
            // images and GIFs can be pasted.
            ComposerTextView(text: $text, focused: $focused, onPasteImages: onPasteImages)
                .frame(minHeight: 44)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(placeholder)
                            .font(.body)
                            .foregroundStyle(Brand.textMuted)
                            .lineLimit(1)
                            .padding(.top, 11)
                            .allowsHitTesting(false)
                    }
                }
                .accessibilityLabel(placeholder)

            if canSend {
                sendButton
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            } else {
                HStack(spacing: 0) {
                    Button(action: onGif) {
                        Text("GIF")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(Brand.textSecondary)
                            .padding(.horizontal, 5)
                            .frame(height: 20)
                            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Brand.textSecondary, lineWidth: 1.6))
                            .frame(width: 40, height: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Send a GIF")
                    Button(action: onGif) {
                        Image(systemName: "face.smiling")
                            .font(.system(size: 21, weight: .regular))
                            .foregroundStyle(Brand.textSecondary)
                            .frame(width: 40, height: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Emoji and GIFs")
                }
                .buttonStyle(PressScaleStyle(scale: 0.9))
                .transition(.opacity)
            }
        }
        .padding(.leading, 6)
        .padding(.trailing, 4)
        .padding(.vertical, 2)
        .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(focused ? Brand.accent.opacity(0.7) : Color.white.opacity(0.06), lineWidth: 1)
        )
        .animation(Motion.quick, value: canSend)
        .animation(.easeOut(duration: 0.15), value: focused)
        .padding(.horizontal, 12)
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
            if let onPoll {
                Button { onPoll() } label: { Label("Poll", systemImage: "chart.bar.xaxis") }
            }
        } label: {
            ZStack {
                if uploading {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(Brand.elevated)
                        .frame(width: 26, height: 26)
                        .background(Brand.textSecondary, in: Circle())
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
            Image(systemName: "paperplane.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 32)
                .background(Brand.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Send")
    }
}
