import SwiftUI

/// The message box, after Discord's mobile one: a tall (52pt), well-rounded
/// bar in the composer colour with a hairline border that turns
/// brand-coloured while typing. A plain + on the left opens the attach menu;
/// gift, GIF and emoji sit on the right, and once there is something to send
/// they give way to emoji and a send button.
struct MessageComposer: View {
    @Binding var text: String
    var uploading: Bool = false
    var onSend: () -> Void
    var onGif: () -> Void = {}
    var onPhoto: () -> Void = {}
    /// Nil where polls can't be posted (while editing a message).
    var onPoll: (() -> Void)? = nil
    /// Nil where gifts don't belong (while editing a message).
    var onGift: (() -> Void)? = nil
    /// "Message #general", "Message @name": says where this will go.
    var placeholder: String = "Message"
    /// Photos or videos are waiting to go, so send works with no text.
    var hasAttachments: Bool = false
    /// Images or GIFs pasted into the box (their original bytes).
    var onPasteImages: (([Data]) -> Void)? = nil

    @State private var focused = false
    @State private var emojiRequest = 0

    private var canSend: Bool {
        hasAttachments || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private let radius: CGFloat = 24

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            attachButton

            // A text view rather than a TextField so images and GIFs can be
            // pasted. One line sits on the buttons' centre; more lines grow
            // upward past them.
            ComposerTextView(text: $text, focused: $focused, onPasteImages: onPasteImages,
                             emojiRequest: emojiRequest)
                .frame(minHeight: ComposerTextView.minHeight)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(placeholder)
                            .font(.body)
                            .foregroundStyle(Brand.textMuted)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .padding(.top, ComposerTextView.verticalInset)
                            .allowsHitTesting(false)
                    }
                }
                .accessibilityLabel(placeholder)
                .padding(.leading, 2)

            HStack(spacing: 0) {
                if canSend {
                    emojiButton
                    sendButton
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                } else {
                    if let onGift {
                        iconButton("gift.fill", label: "Send a gift", action: onGift)
                            .transition(.opacity)
                    }
                    gifButton.transition(.opacity)
                    emojiButton
                }
            }
            .padding(.trailing, 4)
        }
        .padding(.leading, 4)
        .background(Brand.elevated, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(focused ? Brand.accent.opacity(0.7) : Color.white.opacity(0.07), lineWidth: 1)
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

    // MARK: - Buttons

    /// A plain +, as on Discord. 44pt wide and the bar's full height, so
    /// it's easy to hit.
    private var attachButton: some View {
        Menu {
            Button { onPhoto() } label: { Label("Photos", systemImage: "photo.on.rectangle") }
            Button { onGif() } label: { Label("GIF", systemImage: "sparkles") }
            if let onPoll {
                Button { onPoll() } label: { Label("Poll", systemImage: "chart.bar.xaxis") }
            }
            if let onGift {
                Button { onGift() } label: { Label("Gift", systemImage: "gift") }
            }
        } label: {
            ZStack {
                if uploading {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "plus")
                        .font(.system(size: 22, weight: .regular))
                        .foregroundStyle(Brand.textSecondary)
                }
            }
            .frame(width: 44, height: ComposerTextView.minHeight)
            .contentShape(Rectangle())
        }
        .disabled(uploading)
        .accessibilityLabel("Attach")
    }

    private var gifButton: some View {
        Button(action: onGif) {
            Text("GIF")
                .font(.system(size: 11, weight: .heavy))
                .foregroundStyle(Brand.textSecondary)
                .padding(.horizontal, 5)
                .frame(height: 21)
                .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Brand.textSecondary, lineWidth: 1.7))
                .frame(width: 42, height: ComposerTextView.minHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(scale: 0.9))
        .accessibilityLabel("Send a GIF")
    }

    /// Opens the keyboard on its emoji page.
    private var emojiButton: some View {
        iconButton("face.smiling.inverse", label: "Emoji") {
            emojiRequest += 1
            if !focused { focused = true }
        }
    }

    private func iconButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 21, weight: .regular))
                .foregroundStyle(Brand.textSecondary)
                .frame(width: 42, height: ComposerTextView.minHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(scale: 0.9))
        .accessibilityLabel(label)
    }

    private var sendButton: some View {
        Button(action: onSend) {
            Image(systemName: "paperplane.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 36)
                .background(Brand.accent, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .frame(width: 50, height: ComposerTextView.minHeight)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Send")
    }
}
