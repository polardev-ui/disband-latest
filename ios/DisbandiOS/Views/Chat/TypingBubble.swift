import SwiftUI

/// Typing indicator: a 3-dot bubble in DMs, avatar stack + dots + label in
/// channels and groups. Avatars pop in on arrival and shrink out on departure.
struct TypingBubble: View {
    let typers: [TypingService.Event]
    let profiles: [String: Profile]
    let groupContext: Bool

    private static let maxAvatars = 3

    var body: some View {
        if !typers.isEmpty {
            HStack(alignment: .bottom, spacing: 8) {
                if groupContext {
                    avatarStack
                }
                VStack(alignment: .leading, spacing: 2) {
                    TypingDots()
                    if groupContext {
                        Text(label)
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.textMuted)
                            .lineLimit(1)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 6)
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }

    private var typerIds: [String] { typers.map(\.userId) }

    private var label: String {
        let names = typers.map(\.name)
        switch names.count {
        case 1: return "\(names[0]) is typing…"
        case 2: return "\(names[0]) and \(names[1]) are typing…"
        case 3: return "\(names[0]), \(names[1]), and \(names[2]) are typing…"
        default: return "Several people are typing…"
        }
    }

    private var avatarStack: some View {
        HStack(spacing: -6) {
            ForEach(typers.prefix(Self.maxAvatars), id: \.userId) { typer in
                if let profile = profiles[typer.userId] {
                    AvatarView(url: profile.avatarUrl, name: profile.name, size: 24)
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                }
            }
            if typers.count > Self.maxAvatars {
                Text("+\(typers.count - Self.maxAvatars)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Brand.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Brand.elevated, in: Circle())
                    .overlay(Circle().stroke(Brand.divider, lineWidth: 1))
            }
        }
        .animation(.spring(response: 0.25), value: typerIds)
    }
}

private struct TypingDots: View {
    @State private var phase = 0
    @State private var timer: Timer?

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Brand.textMuted)
                    .frame(width: 6, height: 6)
                    .opacity(phase == i ? 1 : 0.35)
                    .offset(y: phase == i ? -3 : 0)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Brand.elevated, in: Capsule())
        .onAppear {
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                phase = (phase + 1) % 3
            }
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
    }
}
