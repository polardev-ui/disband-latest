import SwiftUI

/// Standard row for conversation lists (DMs and group chats).
///
/// DM rows show a message preview, relative timestamp, and unread badge with
/// bold/bright styling while unread (Discord-style). Group rows pass a
/// `subtitle` (e.g. "N members") instead of a preview.
struct ConversationRow: View {
    let iconUrl: String?
    let name: String
    var subtitle: String? = nil
    var status: UserStatus? = nil
    var preview: String? = nil
    var time: String? = nil
    var unread: Int = 0

    var body: some View {
        HStack(spacing: 12) {
            // Unread marker: a blue dot on the leading edge, inside the card.
            // The count badge alone (trailing) was easy to miss when scanning
            // the list, and reserving the slot when read keeps rows aligned.
            Circle()
                .fill(unread > 0 ? Brand.accent : Color.clear)
                .frame(width: 8, height: 8)

            AvatarView(url: iconUrl, name: name, size: 44, status: status)

            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(name)
                        .font(.subheadline)
                        .fontWeight(unread > 0 ? .semibold : .regular)
                        .foregroundStyle(unread > 0 ? Brand.textPrimary : Brand.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    if let time, !time.isEmpty {
                        Text(time)
                            .font(.caption)
                            .foregroundStyle(unread > 0 ? Brand.textPrimary : Brand.textMuted)
                            .lineLimit(1)
                    }
                }

                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(bottomLine)
                        .font(.subheadline)
                        .foregroundStyle(unread > 0 ? Brand.accent : Brand.textMuted)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    if unread > 0 {
                        Text("\(unread)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Brand.danger))
                    }
                }
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }

    private var bottomLine: String {
        preview ?? subtitle ?? ""
    }
}
