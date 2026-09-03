import SwiftUI

struct MessageComposer: View {
    @Binding var text: String
    var uploading: Bool = false
    var onSend: () -> Void
    var onGif: () -> Void = {}
    var onPhoto: () -> Void = {}

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            // The whole bar is one pill with the attach button living *inside*
            // it (Instagram-style) rather than sitting outside as a separate
            // small target.
            HStack(alignment: .bottom, spacing: 6) {
                attachButton

                TextField("Message", text: $text, axis: .vertical)
                    .lineLimit(1...5)
                    .font(.body)
                    .foregroundStyle(Brand.textPrimary)
                    // 8 + 28 + 8 = 44: a comfortable single-line pill that
                    // matches the attach button exactly, so the two centre on
                    // each other without padding the bar out.
                    .padding(.vertical, 8)
                    .frame(minHeight: 28)
            }
            .padding(.leading, 7)
            .padding(.trailing, 16)
            .background(Brand.elevated, in: .rect(cornerRadius: 24))

            sendButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Brand.surface)
        // Swiping down on the bar dismisses the keyboard (the iOS "keyboard
        // grab" gesture). Only when it's actually up.
        .highPriorityGesture(
            DragGesture(minimumDistance: 12)
                .onEnded { value in
                    if value.translation.height > 30 {
                        UIApplication.shared.sendAction(
                            #selector(UIResponder.resignFirstResponder),
                            to: nil, from: nil, for: nil)
                    }
                }
        )
    }

    /// 44×44 is Apple's minimum comfortable touch target; the old 30pt glyph
    /// had no padding around it and was easy to miss.
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
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 30, height: 30)
                        .background(Brand.accent, in: .circle)
                }
            }
            // Same height as the single-line text field beside it. With the
            // row bottom-aligned, equal heights are what put the two centres
            // on one line; unequal ones left the circle floating above the
            // text.
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .disabled(uploading)
    }

    private var sendButton: some View {
        Button(action: onSend) {
            Image(systemName: "arrow.up")
                .font(.system(size: 19, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(canSend ? Brand.accent : Brand.elevated, in: .circle)
                .frame(width: 48, height: 48)
                .contentShape(Rectangle())
        }
        .disabled(!canSend)
        .animation(.easeOut(duration: 0.15), value: canSend)
    }
}
