import SwiftUI

/// What the Home panel is showing: the inbox, or one server.
enum SpaceSelection: Hashable {
    case inbox
    case server(String)
}

/// The vertical strip of spaces on Home's left edge — the same model as the
/// desktop rail. Inbox on top, then servers, then create / discover.
struct ServerRail: View {
    let servers: [Server]
    @Binding var selection: SpaceSelection
    var inboxUnread: Int
    /// The server whose voice channel you're connected to, if any.
    var voiceServerId: String?
    var onJoin: () -> Void
    var onCreate: () -> Void
    var onDiscover: () -> Void

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                railButton(selected: selection == .inbox, label: "Messages") {
                    selection = .inbox
                } icon: {
                    ZStack {
                        Rectangle().fill(Brand.accent.gradient)
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                } badge: {
                    UnreadDot(count: inboxUnread)
                }

                Capsule()
                    .fill(Brand.divider)
                    .frame(width: 26, height: 2)
                    .padding(.vertical, 2)

                ForEach(servers) { server in
                    let isSelected = selection == .server(server.id)
                    railButton(selected: isSelected, label: server.name) {
                        selection = .server(server.id)
                    } icon: {
                        RemoteImage(url: server.iconUrl, contentMode: .fill) {
                            ZStack {
                                Color(seed: server.id)
                                Text(Self.initials(server.name))
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }
                    } badge: {
                        if voiceServerId == server.id {
                            Image(systemName: "speaker.wave.2.fill")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 18, height: 18)
                                .background(Brand.online, in: Circle())
                                .overlay(Circle().stroke(Brand.background, lineWidth: 2.5))
                                .offset(x: 3, y: 3)
                        } else if server.verified == true {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.verified)
                                .background(Circle().fill(Brand.background).padding(-1.5))
                                .offset(x: 3, y: 3)
                        }
                    }
                }

                Menu {
                    Button(action: onJoin) { Label("Join with Invite", systemImage: "link") }
                    Button(action: onCreate) { Label("Create a Space", systemImage: "plus") }
                } label: {
                    utilityIcon("plus", tint: Brand.online)
                }
                .accessibilityLabel("Add a space")

                Button(action: onDiscover) { utilityIcon("safari.fill", tint: Brand.accent) }
                    .accessibilityLabel("Discover spaces")
            }
            .padding(.vertical, 12)
            // Room for the floating dock to sit over the end of the list.
            .padding(.bottom, 90)
        }
        .frame(width: 72)
    }

    private func railButton<Icon: View, Badge: View>(
        selected: Bool,
        label: String,
        action: @escaping () -> Void,
        @ViewBuilder icon: () -> Icon,
        @ViewBuilder badge: () -> Badge
    ) -> some View {
        Button {
            UISelectionFeedbackGenerator().selectionChanged()
            action()
        } label: {
            icon()
                .frame(width: 48, height: 48)
                // Squircle when selected, circle otherwise — the same morph
                // the desktop rail uses.
                .clipShape(RoundedRectangle(cornerRadius: selected ? 16 : 24, style: .continuous))
                .overlay(alignment: .bottomTrailing) { badge() }
                .frame(maxWidth: .infinity)
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(Color.white)
                        .frame(width: 4, height: selected ? 38 : 0)
                        .offset(x: -2)
                }
                .animation(.snappy(duration: 0.25), value: selected)
        }
        .buttonStyle(RailPressStyle())
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func utilityIcon(_ symbol: String, tint: Color) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 19, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 48, height: 48)
            .background(Brand.surface, in: Circle())
    }

    static func initials(_ name: String) -> String {
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap(\.first).map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }
}

private struct RailPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

struct UnreadDot: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text(count > 99 ? "99+" : "\(count)")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 5)
                .frame(minWidth: 20, minHeight: 20)
                .background(Brand.dnd, in: Capsule())
                .overlay(Capsule().stroke(Brand.background, lineWidth: 3))
                .offset(x: 5, y: 5)
        }
    }
}
