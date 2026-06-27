import SwiftUI

/// Disband mobile palette — a dark, high-contrast theme tuned for readability on
/// small screens (larger type, generous spacing) while echoing the desktop look.
enum Brand {
    static let background = Color(hex: 0x1E1F22)
    static let surface = Color(hex: 0x2B2D31)
    static let surfaceRaised = Color(hex: 0x313338)
    static let elevated = Color(hex: 0x383A40)
    static let accent = Color(hex: 0x5865F2)       // blurple
    static let accentSoft = Color(hex: 0x4752C4)
    static let textPrimary = Color(hex: 0xF2F3F5)
    static let textSecondary = Color(hex: 0xB5BAC1)
    static let textMuted = Color(hex: 0x949BA4)
    static let online = Color(hex: 0x23A55A)
    static let idle = Color(hex: 0xF0B232)
    static let dnd = Color(hex: 0xF23F43)
    static let danger = Color(hex: 0xDA373C)
}

extension UserStatus {
    var color: Color {
        switch self {
        case .online: return Brand.online
        case .idle: return Brand.idle
        case .dnd: return Brand.dnd
        case .offline: return Brand.textMuted
        }
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }

    /// Parse a CSS-style hex string ("#5865F2" or "5865F2"). Returns nil if invalid.
    init?(hexString: String?) {
        guard var s = hexString?.trimmingCharacters(in: .whitespaces) else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt32(s, radix: 16) else { return nil }
        self.init(hex: value)
    }

    /// Stable color derived from an arbitrary string (used for avatar fallbacks).
    init(seed: String) {
        let palette: [UInt32] = [
            0x5865F2, 0xEB459E, 0xED4245, 0xFAA61A,
            0x57F287, 0x3BA55C, 0x9B59B6, 0x1ABC9C, 0xE67E22,
        ]
        var hash: UInt32 = 5381
        for byte in seed.utf8 { hash = (hash &* 33) &+ UInt32(byte) }
        self.init(hex: palette[Int(hash % UInt32(palette.count))])
    }
}

/// Compact relative timestamp from a Postgres ISO timestamp string.
enum RelativeTime {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain = ISO8601DateFormatter()

    static func date(from string: String?) -> Date? {
        guard let string else { return nil }
        return iso.date(from: string) ?? isoPlain.date(from: string)
    }

    static func short(_ string: String?) -> String {
        guard let date = date(from: string) else { return "" }
        let now = Date()
        let cal = Calendar.current
        if cal.isDateInToday(date) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        if cal.isDateInYesterday(date) {
            return "Yesterday " + date.formatted(date: .omitted, time: .shortened)
        }
        let days = cal.dateComponents([.day], from: date, to: now).day ?? 0
        if days < 7 {
            return date.formatted(.dateTime.weekday(.abbreviated).hour().minute())
        }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}
