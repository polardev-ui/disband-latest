import SwiftUI

/// Disband mobile palette — a dark, high-contrast theme tuned for readability on
/// small screens (larger type, generous spacing) while echoing the desktop look.
/// Semantic colours for the whole app.
///
/// These resolve through `current`, which `ThemeManager` swaps when the user
/// picks a theme. Keeping the call sites as `Brand.surface` etc. means every
/// existing view re-themes without being touched; views rebuild because the
/// root is keyed on the active theme id.
enum Brand {
    /// Resolving through the shared `@Observable` manager means a view that
    /// reads `Brand.surface` in its body automatically depends on the active
    /// theme and repaints when it changes — no view-tree reset required.
    @MainActor static var current: Palette { ThemeManager.shared.palette }

    @MainActor static var background: Color { current.background }
    @MainActor static var surface: Color { current.surface }
    @MainActor static var surfaceRaised: Color { current.surfaceRaised }
    @MainActor static var elevated: Color { current.elevated }
    @MainActor static var accent: Color { current.accent }
    @MainActor static var accentSoft: Color { current.accentSoft }
    @MainActor static var textPrimary: Color { current.textPrimary }
    @MainActor static var textSecondary: Color { current.textSecondary }
    @MainActor static var textMuted: Color { current.textMuted }
    @MainActor static var divider: Color { current.divider }

    // Presence and destructive colours are fixed: they carry meaning, so they
    // must not drift per theme.
    static let online = Color(hex: 0x23A55A)
    static let idle = Color(hex: 0xF0B232)
    static let dnd = Color(hex: 0xF23F43)
    static let danger = Color(hex: 0xDA373C)
}

extension UserStatus {
    /// Fits a narrow segmented control — taking the first word of the full
    /// label turned "Do Not Disturb" into a bare "Do".
    var shortLabel: String {
        switch self {
        case .online: return "Online"
        case .idle: return "Away"
        case .dnd: return "Busy"
        case .offline: return "Invisible"
        }
    }

    @MainActor var color: Color {
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

    /// Ultra-compact timestamp for list rows: "now", "5m", "2h", "Yesterday",
    /// "Mon", "Aug 5".
    static func compact(_ string: String?) -> String {
        guard let date = date(from: string) else { return "" }
        let now = Date()
        let seconds = now.timeIntervalSince(date)
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(Int(seconds / 60))m" }
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "\(Int(seconds / 3600))h" }
        if cal.isDateInYesterday(date) { return "Yesterday" }
        let days = cal.dateComponents([.day], from: date, to: now).day ?? 0
        if days < 7 {
            return date.formatted(.dateTime.weekday(.abbreviated))
        }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}

extension Bundle {
    /// "1.0 (12)" — read from the bundle so the in-app version can never drift
    /// from what was actually shipped. It was hardcoded, and still read "0.4.4"
    /// after the app moved to 1.0.
    var appVersionDisplay: String {
        let short = infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
        let build = infoDictionary?["CFBundleVersion"] as? String ?? "—"
        return "\(short) (\(build))"
    }
}
