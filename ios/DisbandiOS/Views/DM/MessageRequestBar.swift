import Supabase
import SwiftUI

/// Sits above the composer in a DM that is still a message request
/// (migration 0193). The recipient can accept, ignore or block; replying
/// accepts too. The sender just sees that their message went as a request.
struct MessageRequestBar: View {
    let threadId: String
    let peer: Profile?

    @Environment(DirectMessagesViewModel.self) private var directMessages
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?

    private var name: String { peer?.name ?? "They" }

    var body: some View {
        if directMessages.isOutgoingRequest(threadId) {
            Text("You're not friends with \(name), so your messages arrive as a message request until they reply or accept.")
                .font(.footnote)
                .foregroundStyle(Brand.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
        } else if directMessages.isIncomingRequest(threadId) {
            VStack(alignment: .leading, spacing: 8) {
                Text("\(name) wants to message you")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.textPrimary)
                Text("You're not friends, but you share a space. They won't know you've seen this unless you reply. Replying or accepting moves it to your messages.")
                    .font(.footnote)
                    .foregroundStyle(Brand.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Brand.dnd)
                }
                HStack(spacing: 8) {
                    Button("Accept") { Task { await respond(accept: true) } }
                        .buttonStyle(.borderedProminent)
                        .tint(Brand.accent)
                    Button("Ignore") { Task { await respond(accept: false) } }
                        .buttonStyle(.bordered)
                    Button("Block", role: .destructive) { Task { await block() } }
                        .buttonStyle(.bordered)
                }
                .disabled(busy)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }

    private func respond(accept: Bool) async {
        busy = true
        error = await directMessages.respondToRequest(threadId, accept: accept)
        busy = false
        if error == nil && !accept { dismiss() }
    }

    private func block() async {
        guard let peerId = peer?.id else { return }
        busy = true
        do {
            try await DatabaseService.blockUser(peerId)
            busy = false
            dismiss()
        } catch {
            busy = false
            self.error = (error as? PostgrestError)?.message ?? error.localizedDescription
        }
    }
}
