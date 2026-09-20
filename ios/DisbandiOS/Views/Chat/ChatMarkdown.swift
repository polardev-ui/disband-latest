import Foundation
import UIKit

/// Renders Discord-style markdown to an `AttributedString`: `#`..`###`
/// headers, fenced code blocks, inline code, **bold**, *italic* / _italic_,
/// __underline__, ~~strikethrough~~, links and @mentions. Mirrors the web
/// renderer (`src/lib/markdown.tsx`).
///
/// This is a small parser rather than a set of regexes. The regex version
/// styled the text *between* markers but never removed the markers, and each
/// pass replaced the font the previous pass set — so `**name**` came out as
/// italic text with the asterisks still showing, and every header was styled
/// one character short.
enum ChatMarkdown {

    /// `mentionColor` is passed in rather than read from `Brand`, whose
    /// properties are main-actor isolated while this renderer is not.
    static func render(
        _ raw: String,
        baseFont: UIFont,
        baseColor: UIColor,
        mentionColor: UIColor
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
        // Mentions last, so a name inside emphasis still reads as a mention.
        applyMentions(to: out, baseFont: baseFont, tint: mentionColor)

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

    private static func applyMentions(to ns: NSMutableAttributedString, baseFont: UIFont, tint: UIColor) {
        let text = ns.string
        guard let regex = try? NSRegularExpression(pattern: "(?<![\\w.])@[a-zA-Z0-9_]{2,32}") else { return }
        for match in regex.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length)) {
            if ns.attribute(.link, at: match.range.location, effectiveRange: nil) != nil { continue }
            let username = String((text as NSString).substring(with: match.range).dropFirst())
            guard let url = URL(string: "\(mentionScheme)://\(username)") else { continue }
            ns.addAttributes([
                .foregroundColor: tint,
                .backgroundColor: tint.withAlphaComponent(0.18),
                .font: UIFont.systemFont(ofSize: baseFont.pointSize, weight: .medium),
                .link: url,
            ], range: match.range)
        }
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
