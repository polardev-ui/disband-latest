import SwiftUI

/**
 Typing indicator: one pill that slides in above the composer.

 It used to be a row in the chat's VStack, so someone starting to type
 *reflowed the whole screen* — the composer and the last message jumped down
 a line, and jumped back when they stopped. A pill that floats over the list
 instead takes no layout height, so nothing moves but the pill.

 Up to three avatars, overlapping, then the dots. Past three it counts the
 rest rather than growing, because the pill has to stay one line wide enough
 to read and narrow enough not to cover the conversation.
 */
struct TypingBubble: View {
    let typers: [TypingService.Event]
    let profiles: [String: Profile]
    let groupContext: Bool

    private static let maxAvatars = 3

    var body: some View {
        if !typers.isEmpty {
            HStack(spacing: 8) {
                // Shown everywhere now, not just in groups: knowing *who* is
                // typing matters in a DM too when you have several open.
                avatarStack
                TypingDots()
            }
            .padding(.leading, 6)
            .padding(.trailing, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(Brand.elevated)
                    .shadow(color: .black.opacity(0.28), radius: 10, y: 3)
            )
            .overlay(Capsule().stroke(Brand.divider.opacity(0.6), lineWidth: 0.5))
            .padding(.leading, 16)
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            // In and out from below, so it reads as rising off the composer
            // rather than appearing from nowhere.
            .transition(
                .move(edge: .bottom)
                    .combined(with: .opacity)
                    .combined(with: .scale(scale: 0.92, anchor: .bottomLeading))
            )
            .allowsHitTesting(false)
        }
    }

    private var typerIds: [String] { typers.map(\.userId) }

    private var avatarStack: some View {
        HStack(spacing: -8) {
            ForEach(typers.prefix(Self.maxAvatars), id: \.userId) { typer in
                Group {
                    if let profile = profiles[typer.userId] {
                        AvatarView(url: profile.avatarUrl, name: profile.name, size: 22)
                    } else {
                        // The name arrives with the typing event even when the
                        // profile has not been fetched yet, so the pill never
                        // shows a gap where a face should be.
                        AvatarView(url: nil, name: typer.name, size: 22)
                    }
                }
                .overlay(Circle().stroke(Brand.elevated, lineWidth: 2))
                .transition(.scale(scale: 0.4).combined(with: .opacity))
            }
            if typers.count > Self.maxAvatars {
                Text("+\(typers.count - Self.maxAvatars)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Brand.textMuted)
                    .frame(width: 22, height: 22)
                    .background(Brand.surfaceRaised, in: Circle())
                    .overlay(Circle().stroke(Brand.elevated, lineWidth: 2))
            }
        }
        .animation(.spring(response: 0.25), value: typerIds)
    }
}

private struct TypingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulsing = false

    /// A third of the cycle apart, so the pulse travels left to right evenly
    /// instead of the three dots drifting in and out of phase.
    private let cycle = 1.2
    private let stagger = 0.16

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Brand.textMuted)
                    .frame(width: 6, height: 6)
                    // Scale and opacity rather than an offset: the old version
                    // moved each dot up 3px, which shifted the baseline and read
                    // as a jitter next to text. Reduce Motion keeps the fade —
                    // it still says "someone is typing" — and drops the scale.
                    .scaleEffect(reduceMotion ? 1 : (pulsing ? 1 : 0.72))
                    .opacity(pulsing ? 1 : 0.35)
                    .animation(
                        .easeInOut(duration: cycle / 2)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * stagger),
                        value: pulsing
                    )
            }
        }
        .onAppear { pulsing = true }
        .onDisappear { pulsing = false }
    }
}
