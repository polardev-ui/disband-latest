import SwiftUI

/// Someone started a call in one of your group chats while the app is open.
struct GroupRingBanner: View {
    let ring: GroupRing

    @Environment(VoiceSession.self) private var voice
    @Environment(DirectMessagesViewModel.self) private var vm

    private var group: GroupChat? { vm.groups.first { $0.id == ring.groupId } }

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: group?.iconUrl, name: ring.groupName, size: 46)
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: "phone.fill")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 20, height: 20)
                        .background(Brand.online, in: Circle())
                        .overlay(Circle().stroke(Brand.surface, lineWidth: 2))
                        .offset(x: 3, y: 3)
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(ring.groupName)
                    .font(.headline)
                    .foregroundStyle(Brand.textPrimary)
                    .lineLimit(1)
                Text("\(ring.callerName) started a call")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)

            Button {
                CallHaptics.shared.stop()
                voice.declineRing()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Brand.dnd, in: Circle())
            }
            .accessibilityLabel("Decline")

            Button {
                CallHaptics.shared.stop()
                Task {
                    await voice.join(.group(id: ring.groupId, name: ring.groupName, iconUrl: group?.iconUrl))
                }
            } label: {
                Image(systemName: "phone.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Brand.online, in: Circle())
            }
            .accessibilityLabel("Join call")
        }
        .padding(12)
        .background {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Brand.surface.opacity(0.7)))
                .shadow(color: .black.opacity(0.4), radius: 20, y: 8)
        }
    }
}
