import Foundation
import UIKit

/// Renders Discord-style markdown to an `AttributedString`: `#`..`###`
/// headers, fenced code blocks, inline code, **bold**, *italic* / _italic_,
/// __underline__, ~~strikethrough~~, ||spoilers||, links and @mentions. Mirrors the web
/// renderer (`src/lib/markdown.tsx`).
///
/// This is a small parser rather than a set of regexes. The regex version
/// styled the text *between* markers but never removed the markers, and each
/// pass replaced the font the previous pass set — so `**name**` came out as
/// italic text with the asterisks still showing, and every header was styled
/// one character short.
enum ChatMarkdown {

    // MARK: Role colours
    //
    // Role pings take their role's colour, as on the web and Discord. The open
    // space's roles are registered here (slug -> name + colour); grey, the
    // default for a new role, keeps the usual blue chip.
    private static let roleLock = NSLock()
    nonisolated(unsafe) private static var roleInfo: [String: (name: String, color: UIColor?)] = [:]
    nonisolated(unsafe) private static var roleVersion = 0

    static func setRoles(_ roles: [(name: String, color: String)]) {
        var next: [String: (name: String, color: UIColor?)] = [:]
        for role in roles {
            let slug = roleSlug(role.name).lowercased()
            guard !slug.isEmpty else { continue }
            next[slug] = (role.name, roleColour(role.color))
        }
        roleLock.lock(); roleInfo = next; roleVersion += 1; roleLock.unlock()
    }

    /// `roleMentionSlug` in `src/lib/utils.ts` (and `MentionSearch.roleSlug`).
    private static func roleSlug(_ name: String) -> String {
        var s = name.trimmingCharacters(in: .whitespacesAndNewlines)
        s = s.replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
        s = s.replacingOccurrences(of: "[^a-zA-Z0-9_-]", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
        return s.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private static func roleLookup(_ slug: String) -> (name: String, color: UIColor?)? {
        roleLock.lock(); defer { roleLock.unlock() }
        return roleInfo[slug.lowercased()]
    }

    private static func roleColour(_ hex: String) -> UIColor? {
        let c = hex.trimmingCharacters(in: .whitespaces).lowercased()
        guard c.count == 7, c.hasPrefix("#"), !["#949ba4", "#99aab5", "#000000"].contains(c),
              let v = UInt32(c.dropFirst(), radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
                       blue: CGFloat(v & 0xff) / 255, alpha: 1)
    }

    /// `mentionColor` is passed in rather than read from `Brand`, whose
    /// properties are main-actor isolated while this renderer is not.
    /// Rendered messages, so a row re-drawn while scrolling or typing does
    /// not re-parse its markdown (and recompile the fence regex) every time.
    private final class Rendered { let value: AttributedString; init(_ v: AttributedString) { value = v } }
    private static let cache: NSCache<NSString, Rendered> = {
        let c = NSCache<NSString, Rendered>()
        c.countLimit = 1500
        return c
    }()

    /// `revealSpoilers` shows the message's ||spoilers|| (tapping the
    /// message toggles it).
    static func render(
        _ raw: String,
        baseFont: UIFont,
        baseColor: UIColor,
        mentionColor: UIColor,
        revealSpoilers: Bool = false
    ) -> AttributedString {
        roleLock.lock(); let rv = roleVersion; roleLock.unlock()
        let key = "\(rv)|\(baseFont.pointSize)|\(baseColor.hashValue)|\(mentionColor.hashValue)|\(revealSpoilers)|\(raw)" as NSString
        if let hit = cache.object(forKey: key) { return hit.value }
        let result = renderUncached(raw, baseFont: baseFont, baseColor: baseColor, mentionColor: mentionColor,
                                    revealSpoilers: revealSpoilers)
        cache.setObject(Rendered(result), forKey: key)
        return result
    }

    private static func renderUncached(
        _ raw: String,
        baseFont: UIFont,
        baseColor: UIColor,
        mentionColor: UIColor,
        revealSpoilers: Bool
    ) -> AttributedString {
        let out = NSMutableAttributedString()
        let context = Context(baseFont: baseFont, color: baseColor)

        // Fenced blocks first: nothing inside them is markdown.
        let source = raw as NSString
        let fence = try! NSRegularExpression(pattern: "```(\\w*)\\n?([\\s\\S]*?)```")
        var cursor = 0
        for match in fence.matches(in: raw, range: NSRange(location: 0, length: source.length)) {
            appendText(source.substring(with: NSRange(location: cursor, length: match.range.location - cursor)),
                       to: out, context: context)
            var code = source.substring(with: match.range(at: 2))
            if code.hasSuffix("\n") { code.removeLast() }
            out.append(NSAttributedString(string: code, attributes: context.codeAttributes(blockSize: true)))
            cursor = match.range.location + match.range.length
        }
        appendText(source.substring(from: cursor), to: out, context: context)

        applyLinks(to: out, tint: mentionColor)
        // Mentions after emphasis, so a name inside it still reads as a mention.
        applyMentions(to: out, baseFont: baseFont, tint: mentionColor, body: baseColor)
        // Spoilers last: a hidden one must hide its mentions and links too.
        applySpoilers(to: out, revealed: revealSpoilers, text: baseColor)

        if let result = try? AttributedString(out, including: \.uiKit) {
            return result
        }
        return AttributedString(raw, attributes: AttributeContainer([
            .font: baseFont,
            .foregroundColor: baseColor,
        ]))
    }

    // MARK: - Mentions

    /// Scheme used to make a mention tappable.
    ///
    /// `Text` renders an `AttributedString` but gives no per-run tap callback,
    /// so a mention carries a `.link` and the chat view intercepts this scheme
    /// through `openURL` rather than letting the system open anything.
    static let mentionScheme = "disband-user"

    /// Extracts the username from a tapped mention link, or nil for any other
    /// URL — which must be left alone and opened normally.
    static func mentionedUsername(from url: URL) -> String? {
        guard url.scheme == mentionScheme else { return nil }
        let name = url.host ?? url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return name.isEmpty ? nil : name
    }

    // MARK: - Spoilers

    /// Whether the text has a ||spoiler|| for the reader to tap open.
    static func hasSpoiler(_ raw: String) -> Bool {
        guard let open = raw.range(of: "||") else { return false }
        return raw[open.upperBound...].range(of: "||") != nil
    }

    fileprivate static let spoilerKey = NSAttributedString.Key("disbandSpoiler")

    /// A hidden spoiler is a dark bar the width of its text: the text is
    /// there but clear, so opening it never reflows the message. It carries
    /// no link, because SwiftUI draws links in the tint colour whatever the
    /// run says, which would show the text. An open one keeps a faint
    /// background so it is clear what was hidden.
    private static func applySpoilers(to ns: NSMutableAttributedString, revealed: Bool, text: UIColor) {
        var runs: [NSRange] = []
        ns.enumerateAttribute(spoilerKey, in: NSRange(location: 0, length: ns.length)) { value, range, _ in
            if value != nil { runs.append(range) }
        }
        for range in runs {
            if revealed {
                ns.addAttribute(.backgroundColor, value: text.withAlphaComponent(0.1), range: range)
            } else {
                ns.removeAttribute(.link, range: range)
                ns.removeAttribute(.underlineStyle, range: range)
                ns.removeAttribute(.strikethroughStyle, range: range)
                ns.addAttributes([
                    .foregroundColor: UIColor.clear,
                    .backgroundColor: UIColor(red: 0.125, green: 0.133, blue: 0.145, alpha: 1),
                ], range: range)
            }
            ns.removeAttribute(spoilerKey, range: range)
        }
    }

    private static let roleKey = NSAttributedString.Key("disbandRole")

    private static func applyMentions(to ns: NSMutableAttributedString, baseFont: UIFont, tint: UIColor,
                                      body: UIColor) {
        // Role pings (`@&Staff`, as the web writes them) read as "@Staff",
        // in a chip but with nobody to open. Replaced back to front so the
        // earlier ranges stay valid.
        if let roleRegex = try? NSRegularExpression(pattern: "(?<![\\w.])@&([A-Za-z0-9_-]{1,64})") {
            let current = ns.string
            for match in roleRegex.matches(in: current, range: NSRange(location: 0, length: (current as NSString).length)).reversed() {
                if ns.attribute(.link, at: match.range.location, effectiveRange: nil) != nil { continue }
                let slug = (current as NSString).substring(with: match.range(at: 1))
                let known = roleLookup(slug)
                let label = "@" + (known?.name ?? slug.replacingOccurrences(of: "-", with: " "))
                let roleColour = known?.color
                ns.replaceCharacters(in: match.range, with: NSAttributedString(string: label, attributes: [
                    .foregroundColor: roleColour ?? mentionText(tint: tint, text: body),
                    .backgroundColor: (roleColour ?? tint).withAlphaComponent(roleColour == nil ? 0.3 : 0.18),
                    .font: UIFont.systemFont(ofSize: baseFont.pointSize, weight: .medium),
                    roleKey: true,
                ]))
            }
        }
        let text = ns.string
        guard let regex = try? NSRegularExpression(pattern: "(?<![\\w.])@[a-zA-Z0-9_]{1,32}") else { return }
        for match in regex.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length)) {
            if ns.attribute(.link, at: match.range.location, effectiveRange: nil) != nil { continue }
            if ns.attribute(roleKey, at: match.range.location, effectiveRange: nil) != nil { continue }
            let username = String((text as NSString).substring(with: match.range).dropFirst())
            guard let url = URL(string: "\(mentionScheme)://\(username)") else { continue }
            // Brand-coloured text on a brand-tinted chip barely showed,
            // worst on a highlighted "pinged you" row. The text is mixed
            // toward the body colour instead (a pale blue on dark themes,
            // a deep one on light), as Discord does.
            ns.addAttributes([
                .foregroundColor: mentionText(tint: tint, text: body),
                .backgroundColor: tint.withAlphaComponent(0.3),
                .font: UIFont.systemFont(ofSize: baseFont.pointSize, weight: .medium),
                .link: url,
            ], range: match.range)
        }
        ns.removeAttribute(roleKey, range: NSRange(location: 0, length: ns.length))
    }

    /// The colour of mention (and link) text. SwiftUI paints links in the
    /// tint, so the message sets this as its tint too.
    static func mentionText(tint: UIColor, text: UIColor) -> UIColor { mix(tint, text, 0.55) }

    private static func mix(_ a: UIColor, _ b: UIColor, _ t: CGFloat) -> UIColor {
        var (r1, g1, b1, a1): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        var (r2, g2, b2, a2): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        guard a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1),
              b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2) else { return a }
        return UIColor(red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t, alpha: 1)
    }

    // MARK: - Links

    private static let linkDetector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    private static func applyLinks(to ns: NSMutableAttributedString, tint: UIColor) {
        guard let detector = linkDetector else { return }
        let text = ns.string
        for match in detector.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length)) {
            guard let url = match.url, url.scheme == "http" || url.scheme == "https" else { continue }
            if let font = ns.attribute(.font, at: match.range.location, effectiveRange: nil) as? UIFont,
               font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace) { continue }
            ns.addAttributes([.link: url, .foregroundColor: tint], range: match.range)
        }
    }

    // MARK: - Blocks

    private struct Context {
        let baseFont: UIFont
        let color: UIColor

        func headerFont(level: Int) -> UIFont {
            // The web's 24 / 20 / 16px against a 15–16px body.
            let scale: CGFloat = [1: 1.5, 2: 1.25, 3: 1.05][level] ?? 1
            return UIFont.systemFont(ofSize: baseFont.pointSize * scale, weight: .bold)
        }

        func codeAttributes(blockSize: Bool) -> [NSAttributedString.Key: Any] {
            [
                .font: UIFont.monospacedSystemFont(ofSize: baseFont.pointSize * (blockSize ? 0.88 : 0.9),
                                                   weight: .regular),
                .foregroundColor: color,
                .backgroundColor: color.withAlphaComponent(0.1),
            ]
        }
    }

    private static let headerPattern = try! NSRegularExpression(pattern: "^(#{1,3})\\s+(.*)$")

    private static func appendText(_ text: String, to out: NSMutableAttributedString, context: Context) {
        guard !text.isEmpty else { return }
        let lines = text.components(separatedBy: "\n")
        for (index, line) in lines.enumerated() {
            if index > 0 {
                out.append(NSAttributedString(string: "\n", attributes: [.font: context.baseFont]))
            }
            let ns = line as NSString
            if let match = headerPattern.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) {
                let level = match.range(at: 1).length
                appendInline(ns.substring(with: match.range(at: 2)), to: out,
                             base: context.headerFont(level: level), style: [], context: context)
            } else {
                appendInline(line, to: out, base: context.baseFont, style: [], context: context)
            }
        }
    }

    // MARK: - Inline

    private struct Style: OptionSet {
        let rawValue: Int
        static let bold = Style(rawValue: 1)
        static let italic = Style(rawValue: 2)
        static let underline = Style(rawValue: 4)
        static let strike = Style(rawValue: 8)
    }

    /// Longest first, so `***` isn't read as `**` then `*`.
    private static let delimiters: [(String, Style)] = [
        ("***", [.bold, .italic]),
        ("**", .bold),
        ("__", .underline),
        ("~~", .strike),
        ("*", .italic),
        ("_", .italic),
    ]

    private static let escapable: Set<Character> = ["*", "_", "~", "`", "#", "\\", "|", ">"]

    private static func appendInline(_ text: String, to out: NSMutableAttributedString,
                                     base: UIFont, style: Style, context: Context) {
        let chars = Array(text)
        var buffer = ""
        var i = 0

        func flush() {
            guard !buffer.isEmpty else { return }
            out.append(NSAttributedString(string: buffer, attributes: attributes(base: base, style: style, context: context)))
            buffer = ""
        }

        outer: while i < chars.count {
            let c = chars[i]

            if c == "\\", i + 1 < chars.count, escapable.contains(chars[i + 1]) {
                buffer.append(chars[i + 1])
                i += 2
                continue
            }

            if c == "`", let close = firstIndex(of: "`", in: chars, from: i + 1), close > i + 1 {
                flush()
                out.append(NSAttributedString(string: String(chars[(i + 1)..<close]),
                                              attributes: context.codeAttributes(blockSize: false)))
                i = close + 1
                continue
            }

            // ||spoiler||: marked here, styled in `applySpoilers`.
            if c == "|", matches("||", in: chars, at: i),
               let close = spoilerClose(in: chars, from: i + 2), close > i + 2 {
                flush()
                let start = out.length
                appendInline(String(chars[(i + 2)..<close]), to: out, base: base, style: style, context: context)
                out.addAttribute(spoilerKey, value: true, range: NSRange(location: start, length: out.length - start))
                i = close + 2
                continue
            }

            for (delimiter, added) in delimiters where matches(delimiter, in: chars, at: i) {
                let length = delimiter.count
                guard canOpen(delimiter, in: chars, at: i),
                      let close = findClose(delimiter, in: chars, from: i + length),
                      close > i + length else { continue }
                flush()
                appendInline(String(chars[(i + length)..<close]), to: out,
                             base: base, style: style.union(added), context: context)
                i = close + length
                continue outer
            }

            buffer.append(c)
            i += 1
        }
        flush()
    }

    private static func attributes(base: UIFont, style: Style, context: Context) -> [NSAttributedString.Key: Any] {
        var traits = base.fontDescriptor.symbolicTraits
        if style.contains(.bold) { traits.insert(.traitBold) }
        if style.contains(.italic) { traits.insert(.traitItalic) }
        let font = base.fontDescriptor.withSymbolicTraits(traits).map { UIFont(descriptor: $0, size: base.pointSize) } ?? base
        var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: context.color]
        if style.contains(.underline) { attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue }
        if style.contains(.strike) { attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
        return attrs
    }

    // MARK: - Delimiter rules

    private static func matches(_ delimiter: String, in chars: [Character], at index: Int) -> Bool {
        let d = Array(delimiter)
        guard index + d.count <= chars.count else { return false }
        return Array(chars[index..<(index + d.count)]) == d
    }

    private static func isWordCharacter(_ c: Character) -> Bool { c.isLetter || c.isNumber }

    /// An opener must be followed by non-space. Underscores must also start a
    /// word, so `snake_case_name` stays plain text.
    private static func canOpen(_ delimiter: String, in chars: [Character], at index: Int) -> Bool {
        let after = index + delimiter.count
        guard after < chars.count, !chars[after].isWhitespace else { return false }
        if delimiter.hasPrefix("_"), index > 0, isWordCharacter(chars[index - 1]) { return false }
        return true
    }

    private static func canClose(_ delimiter: String, in chars: [Character], at index: Int) -> Bool {
        guard index > 0, !chars[index - 1].isWhitespace else { return false }
        let after = index + delimiter.count
        if delimiter.hasPrefix("_"), after < chars.count, isWordCharacter(chars[after]) { return false }
        return true
    }

    /// The matching closer. A single `*` or `_` steps over any doubled run
    /// (`*a **b** c*`), so the inner `**` isn't taken as its closer.
    private static func findClose(_ delimiter: String, in chars: [Character], from start: Int) -> Int? {
        var k = start
        let single = delimiter.count == 1
        let mark = delimiter.first!
        while k < chars.count {
            if chars[k] == "\\" { k += 2; continue }
            if chars[k] == "`", let end = firstIndex(of: "`", in: chars, from: k + 1) { k = end + 1; continue }
            if single, chars[k] == mark, k + 1 < chars.count, chars[k + 1] == mark {
                let double = String(repeating: mark, count: 2)
                if let end = findClose(double, in: chars, from: k + 2) { k = end + 2 } else { k += 2 }
                continue
            }
            if matches(delimiter, in: chars, at: k), canClose(delimiter, in: chars, at: k) {
                // A lone `*` right before another `*` belongs to a longer run.
                if single, k + 1 < chars.count, chars[k + 1] == mark { k += 1; continue }
                return k
            }
            k += 1
        }
        return nil
    }

    private static func spoilerClose(in chars: [Character], from start: Int) -> Int? {
        var k = start
        while k + 1 < chars.count {
            if chars[k] == "\\" { k += 2; continue }
            if chars[k] == "`", let end = firstIndex(of: "`", in: chars, from: k + 1) { k = end + 1; continue }
            if chars[k] == "|", chars[k + 1] == "|" { return k }
            k += 1
        }
        return nil
    }

    private static func firstIndex(of target: Character, in chars: [Character], from start: Int) -> Int? {
        guard start < chars.count else { return nil }
        return chars[start...].firstIndex(of: target)
    }
}

extension UIFont {
    func bold() -> UIFont {
        guard let descriptor = fontDescriptor.withSymbolicTraits(.traitBold) else { return self }
        return UIFont(descriptor: descriptor, size: 0)
    }
    func italic() -> UIFont {
        guard let descriptor = fontDescriptor.withSymbolicTraits(.traitItalic) else { return self }
        return UIFont(descriptor: descriptor, size: 0)
    }
}
