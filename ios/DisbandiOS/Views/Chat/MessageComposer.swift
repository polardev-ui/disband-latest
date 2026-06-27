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
            Menu {
                Button { onPhoto() } label: { Label("Photo", systemImage: "photo") }
                Button { onGif() } label: { Label("GIF", systemImage: "sparkles") }
            } label: {
                if uploading {
                    ProgressView().controlSize(.small).frame(width: 32, height: 32)
                } else {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(Brand.textMuted)
                }
            }
            .disabled(uploading)

            TextField("Message", text: $text, axis: .vertical)
                .lineLimit(1...5)
                .foregroundStyle(Brand.textPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Brand.elevated, in: .rect(cornerRadius: 20))

            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(canSend ? Brand.accent : Brand.textMuted)
            }
            .disabled(!canSend)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Brand.surface)
    }
}
