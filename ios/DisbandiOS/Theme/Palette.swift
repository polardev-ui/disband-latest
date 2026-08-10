import Foundation
import Observation
import SwiftUI

/// Theme registry, mirroring `src/lib/theme/themes.ts` and the `[data-theme]`
/// blocks in `globals.css`. Ids and plan gating must stay in step with the web
/// app, since the choice is stored on `profiles.theme` and shared between them.
enum ThemeId: String, CaseIterable, Codable, Sendable {
    case dark, midnight, light, sunset, ocean
    case roseGold = "rose-gold"
    case plasma, nord
}

struct Palette: Sendable {
    let background: Color      // --bg-tertiary
    let surface: Color         // --bg-secondary
    let surfaceRaised: Color   // --bg-primary
    let elevated: Color        // --interactive-hover
    let accent: Color          // --brand
    let accentSoft: Color
    let textPrimary: Color     // --text-normal
    let textSecondary: Color
    let textMuted: Color       // --text-muted
    let divider: Color
    /// Light themes need dark status-bar/keyboard chrome.
    let colorScheme: ColorScheme
}

struct ThemeDefinition: Identifiable, Sendable {
    let id: ThemeId
    let label: String
    let detail: String
    let palette: Palette
    /// Minimum plan required; nil means free.
    let requiredPlan: SubscriptionPlan?

    var swatch: [Color] { [palette.background, palette.surface, palette.surfaceRaised, palette.accent] }
}

enum Themes {
    static let all: [ThemeDefinition] = [
        ThemeDefinition(
            id: .dark, label: "Disband Dark", detail: "Classic Disband dark theme",
            palette: Palette(
                background: Color(hex: 0x1E1F22), surface: Color(hex: 0x2B2D31),
                surfaceRaised: Color(hex: 0x313338), elevated: Color(hex: 0x35373C),
                accent: Color(hex: 0x5865F2), accentSoft: Color(hex: 0x4752C4),
                textPrimary: Color(hex: 0xF2F3F5), textSecondary: Color(hex: 0xB5BAC1),
                textMuted: Color(hex: 0x949BA4), divider: Color(hex: 0x3F4147),
                colorScheme: .dark),
            requiredPlan: nil),

        ThemeDefinition(
            id: .midnight, label: "AMOLED", detail: "Pure black for OLED displays",
            palette: Palette(
                background: Color(hex: 0x050506), surface: Color(hex: 0x0A0A0B),
                surfaceRaised: Color(hex: 0x060607), elevated: Color(hex: 0x1A1B1E),
                accent: Color(hex: 0x5865F2), accentSoft: Color(hex: 0x4752C4),
                textPrimary: Color(hex: 0xF2F3F5), textSecondary: Color(hex: 0xB5BAC1),
                textMuted: Color(hex: 0x949BA4), divider: Color(hex: 0x2E3035),
                colorScheme: .dark),
            requiredPlan: nil),

        ThemeDefinition(
            id: .light, label: "Disband Light", detail: "Bright and clean",
            palette: Palette(
                background: Color(hex: 0xE3E5E8), surface: Color(hex: 0xF2F3F5),
                surfaceRaised: Color(hex: 0xFFFFFF), elevated: Color(hex: 0xE3E5E8),
                accent: Color(hex: 0x5865F2), accentSoft: Color(hex: 0x4752C4),
                textPrimary: Color(hex: 0x313338), textSecondary: Color(hex: 0x4E5058),
                textMuted: Color(hex: 0x5C5E66), divider: Color(hex: 0xD4D7DC),
                colorScheme: .light),
            requiredPlan: nil),

        ThemeDefinition(
            id: .sunset, label: "Sunset", detail: "Warm tones, pink accent",
            palette: Palette(
                background: Color(hex: 0x181214), surface: Color(hex: 0x231C1E),
                surfaceRaised: Color(hex: 0x2A2224), elevated: Color(hex: 0x32282B),
                accent: Color(hex: 0xEB459E), accentSoft: Color(hex: 0xC23884),
                textPrimary: Color(hex: 0xF2E8E4), textSecondary: Color(hex: 0xCBB6B0),
                textMuted: Color(hex: 0xA8948E), divider: Color(hex: 0x3F3538),
                colorScheme: .dark),
            requiredPlan: nil),

        ThemeDefinition(
            id: .ocean, label: "Ocean", detail: "Cool blues, teal accent",
            palette: Palette(
                background: Color(hex: 0x0D1B2A), surface: Color(hex: 0x1B2838),
                surfaceRaised: Color(hex: 0x1B2A3A), elevated: Color(hex: 0x1F3042),
                accent: Color(hex: 0x2DD4BF), accentSoft: Color(hex: 0x24A99A),
                textPrimary: Color(hex: 0xE2E8F0), textSecondary: Color(hex: 0xB6C2D1),
                textMuted: Color(hex: 0x94A3B8), divider: Color(hex: 0x334155),
                colorScheme: .dark),
            requiredPlan: .basic),

        ThemeDefinition(
            id: .roseGold, label: "Rose Gold", detail: "Elegant rose tones, gold accent",
            palette: Palette(
                background: Color(hex: 0x1C1415), surface: Color(hex: 0x2C1D1F),
                surfaceRaised: Color(hex: 0x332224), elevated: Color(hex: 0x3D282B),
                accent: Color(hex: 0xF5A0B8), accentSoft: Color(hex: 0xCC8399),
                textPrimary: Color(hex: 0xFCE7F0), textSecondary: Color(hex: 0xE0BECD),
                textMuted: Color(hex: 0xC9A0B0), divider: Color(hex: 0x4A3035),
                colorScheme: .dark),
            requiredPlan: .super_),

        ThemeDefinition(
            id: .plasma, label: "Plasma", detail: "Deep purple with vibrant magenta",
            palette: Palette(
                background: Color(hex: 0x0E0A16), surface: Color(hex: 0x1A0F2E),
                surfaceRaised: Color(hex: 0x1F1137), elevated: Color(hex: 0x281A40),
                accent: Color(hex: 0xC77DFF), accentSoft: Color(hex: 0xA463D6),
                textPrimary: Color(hex: 0xEADAFF), textSecondary: Color(hex: 0xC0A9DA),
                textMuted: Color(hex: 0x9D7CBF), divider: Color(hex: 0x2D1B45),
                colorScheme: .dark),
            requiredPlan: .super_),

        ThemeDefinition(
            id: .nord, label: "Nord", detail: "Arctic blues, frost accent",
            palette: Palette(
                background: Color(hex: 0x2E3440), surface: Color(hex: 0x3B4252),
                surfaceRaised: Color(hex: 0x434C5E), elevated: Color(hex: 0x4C566A),
                accent: Color(hex: 0x88C0D0), accentSoft: Color(hex: 0x6E9DAC),
                textPrimary: Color(hex: 0xECEFF4), textSecondary: Color(hex: 0xCBD2DC),
                textMuted: Color(hex: 0xA5ABB6), divider: Color(hex: 0x4C566A),
                colorScheme: .dark),
            requiredPlan: .super_),
    ]

    static func definition(_ id: ThemeId) -> ThemeDefinition {
        all.first { $0.id == id } ?? all[0]
    }

    /// Whether `plan` unlocks `theme`. Super unlocks everything.
    static func isUnlocked(_ theme: ThemeDefinition, plan: SubscriptionPlan) -> Bool {
        guard let required = theme.requiredPlan else { return true }
        switch plan {
        case .super_: return true
        case .basic: return required == .basic
        case .free: return false
        }
    }
}

/// Holds the active theme and persists it to the profile so it follows the user
/// across devices, the same way the desktop app stores `profiles.theme`.
@MainActor
@Observable
final class ThemeManager {
    /// Single instance so `Brand` can resolve colours without every view having
    /// to thread the palette through. Reading `palette` inside a `body` still
    /// registers an Observation dependency, so views repaint on change.
    static let shared = ThemeManager()

    private(set) var themeId: ThemeId = .dark

    var palette: Palette { Themes.definition(themeId).palette }

    private static let localKey = "disband.theme"

    init() {
        if let raw = UserDefaults.standard.string(forKey: Self.localKey),
           let id = ThemeId(rawValue: raw) {
            themeId = id
        }
    }

    /// Adopt the theme stored on the signed-in profile.
    func adopt(from profile: Profile?) {
        guard let raw = profile?.theme, let id = ThemeId(rawValue: raw), id != themeId else { return }
        set(id, persistRemotely: false)
    }

    func set(_ id: ThemeId, persistRemotely: Bool = true) {
        themeId = id
        UserDefaults.standard.set(id.rawValue, forKey: Self.localKey)
        guard persistRemotely else { return }
        Task {
            // Best effort: the local choice already applied, and it re-syncs on
            // the next successful profile save.
            try? await ProfileService.updateTheme(id.rawValue)
        }
    }
}
