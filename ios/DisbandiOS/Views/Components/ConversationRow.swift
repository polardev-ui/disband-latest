import SwiftUI

/// Standard row for conversation lists (DMs and group chats).
///
/// DM rows show a message preview, relative timestamp, and unread badge with
/// bold/bright styling while unread (Discord-style). Group rows pass a
/// `subtitle` (e.g. "N members") instead of a preview.
struct ConversationRow: View {
    let iconUrl: String?
    let name: String
    var userId: String? = nil
    var subtitle: String? = nil
    var status: UserStatus? = nil
    var preview: String? = nil
    var time: String? = nil
    var unread: Int = 0
    /// The person's name style, for one-to-one DMs.
    var nameStyle: NameStyle? = nil
    /// Pinned to the top of the list.
    var pinned: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            // Unread marker: a blue dot on the leading edge, inside the card.
            // The count badge alone (trailing) was easy to miss when scanning
            // the list, and reserving the slot when read keeps rows aligned.
            Circle()
                .fill(unread > 0 ? Brand.accent : Color.clear)
                .frame(width: 8, height: 8)

            AvatarView(url: iconUrl, name: name, size: 46, status: status)

            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Group {
                        if let nameStyle, nameStyle != NameStyle() {
                            StyledName(text: name, style: nameStyle,
                                       size: 16,
                                       weight: unread > 0 ? .bold : .medium,
                                       fallbackColor: Brand.textPrimary)
                        } else {
                            Text(name)
                                .font(.system(size: 16, weight: unread > 0 ? .bold : .medium))
                                .foregroundStyle(Brand.textPrimary)
                        }
                    }
                    .lineLimit(1)
                    GuildTagView(userId: userId, size: .small)
                    Spacer(minLength: 6)
                    if pinned {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Brand.textMuted)
                            .rotationEffect(.degrees(45))
                            .accessibilityLabel("Pinned")
                    }
                    if let time, !time.isEmpty {
                        Text(time)
                            .font(.caption)
                            .foregroundStyle(unread > 0 ? Brand.textPrimary : Brand.textMuted)
                            .lineLimit(1)
                    }
                }

                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(bottomLine)
                        .font(.system(size: 14, weight: unread > 0 ? .medium : .regular))
                        .foregroundStyle(unread > 0 ? Brand.textPrimary : Brand.textMuted)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    if unread > 0 {
                        Text(unread > 99 ? "99+" : "\(unread)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Brand.danger))
                            .contentTransition(.numericText())
                            .transition(.scale.combined(with: .opacity))
                    }
                }
            }
        }
        .padding(.vertical, 7)
        .contentShape(Rectangle())
        .animation(Motion.pop, value: unread)
    }

    private var bottomLine: String {
        preview ?? subtitle ?? ""
    }
}
