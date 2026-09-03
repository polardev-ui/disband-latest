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
                    .padding(.vertical, 12)
                    .frame(minHeight: 30)
            }
            .padding(.leading, 6)
            .padding(.trailing, 16)
            .background(Brand.elevated, in: .rect(cornerRadius: 24))

            sendButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Brand.surface)
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
