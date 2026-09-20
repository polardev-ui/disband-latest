import SwiftUI

/// One subscription tier: the colour the badge takes at a given tenure.
struct SubscriptionTier: Identifiable, Hashable {
    let key: String
    let label: String
    let months: Int
    let base: Color
    let deep: Color
    let light: Color

    var id: String { key }

    var durationLabel: String {
        switch months {
        case 1: return "1 month"
        case 12: return "1 year"
        case let m where m % 12 == 0: return "\(m / 12) years"
        default: return "\(months) months"
        }
    }

    static let all: [SubscriptionTier] = [
        .init(key: "bronze", label: "Bronze", months: 1,
              base: Color(hexString: "c47a3d"), deep: Color(hexString: "7d4620"), light: Color(hexString: "e8a874")),
        .init(key: "silver", label: "Silver", months: 3,
              base: Color(hexString: "b9c0c8"), deep: Color(hexString: "6f767e"), light: Color(hexString: "e6ebf0")),
        .init(key: "gold", label: "Gold", months: 6,
              base: Color(hexString: "e8a33d"), deep: Color(hexString: "8a5a12"), light: Color(hexString: "ffd489")),
        .init(key: "platinum", label: "Platinum", months: 12,
              base: Color(hexString: "5ec8d8"), deep: Color(hexString: "1f6b79"), light: Color(hexString: "a9ecf6")),
        .init(key: "diamond", label: "Diamond", months: 24,
              base: Color(hexString: "a97bf0"), deep: Color(hexString: "5b2f9c"), light: Color(hexString: "d8bcff")),
        .init(key: "ruby", label: "Ruby", months: 60,
              base: Color(hexString: "d61f2f"), deep: Color(hexString: "780c1a"), light: Color(hexString: "ff8f8f")),
        .init(key: "opal", label: "Opal", months: 120,
              base: Color(hexString: "8bd4e8"), deep: Color(hexString: "4a7f96"), light: Color(hexString: "ffe6fb")),
    ]

    /// The highest tier reached. Below a month there is no badge at all.
    static func forMonths(_ months: Int) -> SubscriptionTier? {
        all.last { months >= $0.months }
    }

    static func next(after months: Int) -> SubscriptionTier? {
        all.first { $0.months > months }
    }
}

/**
 The subscription badge.

 Colour carries the tenure; Super adds four studs and a halo, so the plan and
 the length both read without any text beside the mark. Opal blends every
 earlier tier into one face — the last tier contains the ones before it.
 */
struct SubscriptionMedallionView: View {
    let tier: SubscriptionTier
    /// Aero's gold studs and halo.
    var topTier: Bool = false
    var size: CGFloat = 20

    private var r: CGFloat { size / 2 }

    var body: some View {
        ZStack {
            if topTier {
                Circle().fill(tier.base.opacity(0.18)).frame(width: size * 1.28, height: size * 1.28)
            }

            if tier.key == "opal" {
                ZStack {
                    Circle().fill(Color(hexString: "dfe9f2"))
                    ForEach(Array(SubscriptionTier.all.prefix(6).enumerated()), id: \.offset) { i, t in
                        let a = Double(i) * (2 * .pi / 6) - .pi / 2
                        Circle()
                            .fill(t.base.opacity(0.9))
                            .frame(width: size * 0.58, height: size * 0.58)
                            .offset(x: cos(a) * r * 0.52, y: sin(a) * r * 0.52)
                    }
                }
                .frame(width: size, height: size)
                .blur(radius: size * 0.12)
                .clipShape(Circle())
                .overlay(Circle().stroke(.white.opacity(0.85), lineWidth: max(1, size * 0.04)))

                Circle().fill(Color(hexString: "2b4a5c").opacity(0.78))
                    .frame(width: size * 0.72, height: size * 0.72)
            } else {
                Circle()
                    .fill(RadialGradient(colors: [tier.light, tier.base, tier.deep],
                                         center: .init(x: 0.38, y: 0.3),
                                         startRadius: 0, endRadius: r))
                    .frame(width: size, height: size)
                    .overlay(Circle().stroke(tier.light.opacity(0.85), lineWidth: max(1, size * 0.04)))

                Circle().fill(tier.deep.opacity(0.85))
                    .frame(width: size * 0.72, height: size * 0.72)
            }

            DisbandMark(light: tier.light, deep: tier.deep)
                .frame(width: size * 0.53, height: size * 0.53)

            if topTier {
                ForEach(0..<4, id: \.self) { i in
                    let a = Double(i) * (.pi / 2) - .pi / 2
                    Diamond()
                        .fill(tier.light)
                        .frame(width: size * 0.2, height: size * 0.2)
                        .offset(x: cos(a) * r, y: sin(a) * r)
                }
            }
        }
        .frame(width: size * (topTier ? 1.3 : 1), height: size * (topTier ? 1.3 : 1))
    }
}

/// The Disband mark: a tall flame-diamond flanked by two corner triangles.
private struct DisbandMark: View {
    let light: Color
    let deep: Color

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                Path { p in
                    p.move(to: .init(x: w * 0.5, y: h * 0.06))
                    p.addLine(to: .init(x: w * 0.72, y: h * 0.46))
                    p.addLine(to: .init(x: w * 0.5, y: h * 0.95))
                    p.addLine(to: .init(x: w * 0.28, y: h * 0.46))
                    p.closeSubpath()
                }.fill(light)
                Path { p in
                    p.move(to: .init(x: w * 0.06, y: h * 0.78))
                    p.addLine(to: .init(x: w * 0.3, y: h * 0.78))
                    p.addLine(to: .init(x: w * 0.18, y: h * 0.55))
                    p.closeSubpath()
                }.fill(light.opacity(0.8))
                Path { p in
                    p.move(to: .init(x: w * 0.94, y: h * 0.78))
                    p.addLine(to: .init(x: w * 0.7, y: h * 0.78))
                    p.addLine(to: .init(x: w * 0.82, y: h * 0.55))
                    p.closeSubpath()
                }.fill(light.opacity(0.8))
            }
        }
    }
}

private struct Diamond: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: .init(x: rect.midX, y: rect.minY))
        p.addLine(to: .init(x: rect.maxX, y: rect.midY))
        p.addLine(to: .init(x: rect.midX, y: rect.maxY))
        p.addLine(to: .init(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}
