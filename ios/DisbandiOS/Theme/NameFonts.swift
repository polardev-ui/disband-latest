import CoreText
import SwiftUI
import UIKit

/// The display-name fonts, matching `src/lib/nameFonts.ts`. The files are
/// copies of the web's (Resources/Fonts) and are registered at launch, so a
/// name looks the same on every platform.
enum NameFont: String, CaseIterable, Identifiable {
    case standard = "default"
    case matcha, gothic, future, spooky, pixels, brutal, graffiti, dunker, sharp

    var id: String { rawValue }

    var label: String {
        switch self {
        case .standard: return "Default"
        default: return rawValue.capitalized
        }
    }

    private var file: (name: String, ext: String)? {
        switch self {
        case .standard: return nil
        case .matcha: return ("Matcha", "otf")
        case .gothic: return ("Gothic", "otf")
        case .future: return ("Future", "otf")
        case .spooky: return ("Spooky", "otf")
        case .pixels: return ("Pixels", "ttf")
        case .brutal: return ("Brutal", "ttf")
        case .graffiti: return ("Graffiti", "otf")
        case .dunker: return ("Dunker", "otf")
        case .sharp: return ("Sharp", "otf")
        }
    }

    /// Spooky is the Halloween font: only offered in October, like the web.
    /// Someone who picked it keeps showing it.
    var isOffered: Bool {
        self != .spooky || Calendar.current.component(.month, from: Date()) == 10
    }

    init(id: String?) {
        self = id.flatMap(NameFont.init(rawValue:)) ?? .standard
    }

    // MARK: Registration

    /// PostScript name per font, filled by `registerAll()`.
    private static var postScriptNames: [NameFont: String] = [:]

    /// Register every bundled font with Core Text. Call once at launch.
    static func registerAll() {
        guard postScriptNames.isEmpty else { return }
        for font in allCases {
            guard let file = font.file,
                  let url = Bundle.main.url(forResource: file.name, withExtension: file.ext),
                  let provider = CGDataProvider(url: url as CFURL),
                  let cgFont = CGFont(provider),
                  let name = cgFont.postScriptName as String? else { continue }
            // Already registered (a second launch path) is fine; the name is
            // what we need either way.
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            postScriptNames[font] = name
        }
    }

    /// A SwiftUI font at the given size, or nil for the default face.
    func font(size: CGFloat) -> Font? {
        guard let name = NameFont.postScriptNames[self] else { return nil }
        return .custom(name, fixedSize: size)
    }
}

/// The colour, gradient and font of a display name. Shared by `StyledName`
/// and the name editor's preview.
struct NameStyle: Equatable {
    var font: NameFont = .standard
    var color: String?
    var color2: String?
    /// CSS angle, as the web stores it: "90deg", "135deg", "180deg"…
    var direction: String?

    init(font: NameFont = .standard, color: String? = nil, color2: String? = nil, direction: String? = nil) {
        self.font = font
        self.color = color
        self.color2 = color2
        self.direction = direction
    }

    init(_ profile: Profile) {
        self.init(font: NameFont(id: profile.nameFont), color: profile.nameColor,
                  color2: profile.nameColor2, direction: profile.nameGradientDir)
    }

    /// The web treats a second colour without a first as white-to-colour.
    var startColor: Color? {
        if let c = Color(hexString: color) { return c }
        return color2 != nil ? .white : nil
    }

    var gradient: LinearGradient? {
        guard let start = startColor, let end = Color(hexString: color2) else { return nil }
        let (from, to) = NameStyle.points(for: direction)
        return LinearGradient(colors: [start, end], startPoint: from, endPoint: to)
    }

    /// CSS `linear-gradient` angles: 0deg points up, 90deg right.
    static func points(for direction: String?) -> (UnitPoint, UnitPoint) {
        let degrees = Double((direction ?? "135deg").replacingOccurrences(of: "deg", with: "")) ?? 135
        let radians = degrees * .pi / 180
        let dx = sin(radians) / 2, dy = -cos(radians) / 2
        return (UnitPoint(x: 0.5 - dx, y: 0.5 - dy), UnitPoint(x: 0.5 + dx, y: 0.5 + dy))
    }
}

/// Someone's name in their chosen font and colour. Use it wherever a person's
/// name is the main label (chat authors, profiles, member and DM lists), so a
/// style set on any platform shows up here too.
struct StyledName: View {
    let text: String
    let style: NameStyle
    var size: CGFloat = 15
    var weight: Font.Weight = .semibold
    /// The colour when they haven't picked one (the primary text colour if nil).
    var fallbackColor: Color? = nil

    init(_ profile: Profile, size: CGFloat = 15, weight: Font.Weight = .semibold,
         fallbackColor: Color? = nil) {
        self.text = profile.name
        self.style = NameStyle(profile)
        self.size = size
        self.weight = weight
        self.fallbackColor = fallbackColor
    }

    init(text: String, style: NameStyle, size: CGFloat = 15, weight: Font.Weight = .semibold,
         fallbackColor: Color? = nil) {
        self.text = text
        self.style = style
        self.size = size
        self.weight = weight
        self.fallbackColor = fallbackColor
    }

    var body: some View {
        let label = Text(text).font(style.font.font(size: size) ?? .system(size: size, weight: weight))
        if let gradient = style.gradient {
            label.foregroundStyle(gradient)
        } else if let color = style.startColor {
            label.foregroundStyle(color)
        } else {
            label.foregroundStyle(fallbackColor ?? Brand.textPrimary)
        }
    }
}
