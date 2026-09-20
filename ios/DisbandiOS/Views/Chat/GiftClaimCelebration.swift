import SwiftUI

/**
 What a claim looks like: the gift bursts, a rocket carries it up, the perks
 light one by one, and the tier medallion lands.

 The reveal waits for the rocket to leave rather than sitting under it —
 text behind a moving rocket is unreadable however it is layered. Reduce
 Motion gets the same information with nothing moving.
 */
struct GiftClaimCelebration: View {
    let plan: String
    let months: Int
    let from: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var phase = 0          // 0 gift · 1 launch · 2 reveal
    @State private var litPerks = 0
    @State private var launch = false
    @State private var flameUp = false

    private var isAero: Bool { SubscriptionPlan(normalizing: plan).isPaid }
    private var accent: Color { SubscriptionPlan.aeroGold }
    private var planName: String { "Disband Aero" }
    private var tier: SubscriptionTier? { SubscriptionTier.forMonths(months) }

    private var perks: [String] {
        isAero
            ? ["500 MB file uploads", "2K video at 120 fps", "Animated avatar and banner",
               "Unlimited custom emoji", "2 space boosts a month", "Screen sharing"]
            : ["150 MB file uploads", "1080p video at 60 fps", "Animated avatar",
               "5 custom emoji slots", "Faster rate limits", "Exclusive theme"]
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hexString: "1b1f3a"), Color(hexString: "05060a")],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            if phase == 0 && !reduceMotion {
                Image(systemName: "gift.fill")
                    .font(.system(size: 88))
                    .foregroundStyle(accent)
                    .transition(.scale.combined(with: .opacity))
            }

            if phase == 1 && !reduceMotion {
                RocketView(accent: accent, flameUp: flameUp)
                    .offset(y: launch ? -900 : 120)
                    .opacity(launch ? 0 : 1)
            }

            if phase == 2 {
                reveal
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .task { await run() }
    }

    private var reveal: some View {
        VStack(spacing: 6) {
            if let tier {
                SubscriptionMedallionView(tier: tier, topTier: isAero, size: 96)
                    .padding(.bottom, 8)
            }
            Text("\(from) gifted you")
                .font(.footnote)
                .foregroundStyle(Brand.textMuted)
            Text(planName)
                .font(.system(size: 32, weight: .heavy))
                .foregroundStyle(accent)
            Text("\(months == 12 ? "1 year" : "\(months) month\(months == 1 ? "" : "s")") applied"
                 + (tier.map { " · \($0.label) badge unlocked" } ?? ""))
                .font(.subheadline)
                .foregroundStyle(Brand.textSecondary)
                .multilineTextAlignment(.center)

            VStack(alignment: .leading, spacing: 7) {
                ForEach(Array(perks.enumerated()), id: \.offset) { i, perk in
                    HStack(spacing: 9) {
                        Image(systemName: "checkmark")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(accent)
                        Text(perk)
                            .font(.subheadline)
                            .foregroundStyle(Brand.textPrimary)
                    }
                    .opacity(i < litPerks ? 1 : 0)
                    .offset(x: i < litPerks ? 0 : -10)
                }
            }
            .padding(.top, 20)

            Button {
                dismiss()
            } label: {
                Text("Let's go")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 30)
                    .padding(.vertical, 11)
                    .background(accent, in: .capsule)
            }
            .buttonStyle(.plain)
            .padding(.top, 26)
            .opacity(litPerks >= perks.count ? 1 : 0)
        }
        .padding(24)
    }

    private func run() async {
        if reduceMotion {
            phase = 2
            litPerks = perks.count
            return
        }

        flameUp = true
        try? await Task.sleep(for: .milliseconds(850))
        withAnimation(.easeOut(duration: 0.2)) { phase = 1 }
        withAnimation(.timingCurve(0.45, 0, 0.6, 0.25, duration: 1.6)) { launch = true }

        try? await Task.sleep(for: .milliseconds(1600))
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { phase = 2 }

        for i in 0..<perks.count {
            try? await Task.sleep(for: .milliseconds(180))
            withAnimation(.easeOut(duration: 0.25)) { litPerks = i + 1 }
        }
    }
}

/// The rocket, drawn so the flame can flicker and the hull can take the
/// plan's accent colour.
private struct RocketView: View {
    let accent: Color
    let flameUp: Bool

    var body: some View {
        VStack(spacing: -4) {
            ZStack {
                Capsule()
                    .fill(LinearGradient(colors: [Color(hexString: "8a929c"), .white,
                                                  Color(hexString: "e4e8ee"), Color(hexString: "98a1ab")],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: 64, height: 128)

                Triangle()
                    .fill(LinearGradient(colors: [Color(hexString: "ff6b5a"), Color(hexString: "a32b1e")],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: 64, height: 46)
                    .offset(y: -62)

                Circle()
                    .fill(RadialGradient(colors: [Color(hexString: "dff4ff"), Color(hexString: "1b5f87")],
                                         center: .init(x: 0.34, y: 0.3), startRadius: 1, endRadius: 18))
                    .frame(width: 28, height: 28)
                    .overlay(Circle().stroke(Color(hexString: "7c8792"), lineWidth: 3))
                    .offset(y: -18)

                Rectangle().fill(accent).frame(width: 64, height: 10).offset(y: 26)
            }
            .overlay(alignment: .bottomLeading) {
                Triangle().fill(Color(hexString: "c0392b"))
                    .frame(width: 26, height: 40).rotationEffect(.degrees(200)).offset(x: -18, y: 10)
            }
            .overlay(alignment: .bottomTrailing) {
                Triangle().fill(Color(hexString: "c0392b"))
                    .frame(width: 26, height: 40).rotationEffect(.degrees(160)).offset(x: 18, y: 10)
            }

            // Two cones out of phase, so the flame never repeats a shape.
            ZStack {
                Triangle().fill(LinearGradient(colors: [Color(hexString: "ffd166"), Color(hexString: "ff4d2e")],
                                               startPoint: .top, endPoint: .bottom))
                    .frame(width: 38, height: 62)
                    .rotationEffect(.degrees(180))
                    .scaleEffect(y: flameUp ? 1.25 : 0.72, anchor: .top)
                    .animation(.easeInOut(duration: 0.11).repeatForever(autoreverses: true), value: flameUp)
                Triangle().fill(LinearGradient(colors: [.white, Color(hexString: "ffb020")],
                                               startPoint: .top, endPoint: .bottom))
                    .frame(width: 20, height: 40)
                    .rotationEffect(.degrees(180))
                    .scaleEffect(y: flameUp ? 0.68 : 1.2, anchor: .top)
                    .animation(.easeInOut(duration: 0.09).repeatForever(autoreverses: true), value: flameUp)
            }
        }
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: .init(x: rect.midX, y: rect.minY))
        p.addLine(to: .init(x: rect.maxX, y: rect.maxY))
        p.addLine(to: .init(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}
