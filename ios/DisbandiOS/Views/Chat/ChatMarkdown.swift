import Foundation
import UIKit

/// Renders Discord-style markdown to an `AttributedString` so chat messages can
/// show bold, italics, underline, strikethrough, inline code, fenced code
/// blocks, and `#`..`###` headers. It deliberately mirrors the web renderer
/// (`src/lib/markdown.tsx`).
enum ChatMarkdown {

    /// Returns a best-effort attributed string. Falls back to plain text if
    /// the markdown cannot be parsed (never crashes a message render).
    /// `mentionColor` is passed in rather than read from `Brand`, whose
    /// properties are main-actor isolated while this renderer is not.
    static func render(
        _ raw: String,
        baseFont: UIFont,
        baseColor: UIColor,
        mentionColor: UIColor
    ) -> AttributedString {
        let ns = NSMutableAttributedString(string: raw, attributes: [
            .font: baseFont,
            .foregroundColor: baseColor,
        ])
        let fullRange = NSRange(location: 0, length: (raw as NSString).length)

        // Style whole-line headers (#, ##, ###).
        applyHeaders(to: ns, raw: raw, baseFont: baseFont, baseColor: baseColor)

        // Fenced code blocks: monospaced font. Applied across the whole run.
        applyFencedCode(to: ns, raw: raw, baseFont: baseFont, baseColor: baseColor)

        applyInline(to: ns, baseFont: baseFont, baseColor: baseColor)

        // Mentions last, so a name inside emphasis still reads as a mention.
        applyMentions(to: ns, baseFont: baseFont, tint: mentionColor)

        if let result = try? AttributedString(ns, including: \.uiKit) {
            return result
        }
        // Fallback: plain text with base styling.
        return AttributedString(raw, attributes: AttributeContainer([
            .font: baseFont,
            .foregroundColor: baseColor,
        ]))
    }

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

    /// Styles `@username` as a mention chip and makes it tappable.
    ///
    /// Anything shaped like a mention is styled; whether it names a real person
    /// is settled when it is tapped, which avoids holding the whole member list
    /// just to draw a message.
    private static func applyMentions(to ns: NSMutableAttributedString, baseFont: UIFont, tint: UIColor) {
        let text = ns.string
        guard let regex = try? NSRegularExpression(pattern: "@[a-zA-Z0-9_]{2,32}") else { return }
        let range = NSRange(location: 0, length: (text as NSString).length)

        for match in regex.matches(in: text, range: range) {
            let token = (text as NSString).substring(with: match.range)
            let username = String(token.dropFirst())
            guard let url = URL(string: "\(mentionScheme)://\(username)") else { continue }

            ns.addAttributes([
                .foregroundColor: tint,
                .backgroundColor: tint.withAlphaComponent(0.18),
                .font: UIFont.systemFont(ofSize: baseFont.pointSize, weight: .medium),
                .link: url,
            ], range: match.range)
        }
    }

    /// Applies `#`..`###` heading styles (bolder, larger) on lines where the
    /// markdown marker is present.
    private static func applyHeaders(
        to ns: NSMutableAttributedString, raw: String, baseFont: UIFont, baseColor: UIColor
    ) {
        let lines = raw.components(separatedBy: "\n")
        var index = 0
        for line in lines {
            let marker = hasHeaderMarker(line)
            if marker > 0 {
                let full = line as NSString
                let contentStart = marker // skip the hashes + one space
                let length = max(full.length - contentStart, 0)
                let sub = full.substring(from: min(contentStart, full.length))
                let trimmed = sub.trimmingCharacters(in: .whitespaces)
                let leading = (full.substring(from: 0) as NSString).substring(
                    to: contentStart
                )
                let leadingTrimmed = leading
                let offset = index + (leadingTrimmed as NSString).length
                let range = NSRange(location: offset, length: (trimmed as NSString).length)
                if range.location + range.length <= ns.length {
                    let size = baseFont.pointSize * CGFloat(1.0 + Double(4 - marker) * 0.12)
                    ns.addAttributes([
                        .font: baseFont.bold().withSize(size),
                        .foregroundColor: baseColor,
                    ], range: range)
                }
            }
            index += line.count + 1
        }
    }

    private static func hasHeaderMarker(_ line: String) -> Int {
        var i = 0
        for ch in line {
            if ch == "#" { i += 1 } else { break }
        }
        if i >= 1, i <= 3, line.dropFirst(i).first == " " { return i }
        return 0
    }

    /// Monospace fenced code blocks (``` ... ```).
    private static func applyFencedCode(
        to ns: NSMutableAttributedString, raw: String, baseFont: UIFont, baseColor: UIColor
    ) {
        let regex = try? NSRegularExpression(pattern: "```(?:\\.*?)?\\n?([\\s\\S]*?)```", options: [])
        guard let regex else { return }
        let full = raw as NSString
        let matches = regex.matches(in: raw, range: NSRange(location: 0, length: full.length))
        for m in matches.reversed() {
            let codeRange = m.range(at: 1)
            if codeRange.location == NSNotFound { continue }
            // apply the language-less code styling over the enclosed text
            ns.addAttributes([
                .font: UIFont.monospacedSystemFont(ofSize: baseFont.pointSize * 0.9, weight: .regular),
            ], range: codeRange)
            _ = m
        }
    }

    /// Inline pieces: `code`, **bold**, *italic*, _italic_, __underline__, ~~strike~~.
    private static func applyInline(to ns: NSMutableAttributedString, baseFont: UIFont, baseColor: UIColor) {
        let patterns: [(NSRegularExpression, [NSAttributedString.Key: Any])] = [
            (try! NSRegularExpression(pattern: "`([^`]+)`"), [
                .font: UIFont.monospacedSystemFont(ofSize: baseFont.pointSize * 0.9, weight: .regular),
            ]),
            (try! NSRegularExpression(pattern: "\\*\\*([^*]+?)\\*\\*"), [
                .font: baseFont.bold(),
            ]),
            (try! NSRegularExpression(pattern: "\\*([^*\\n]+?)\\*"), [
                .font: baseFont.italic(),
            ]),
            (try! NSRegularExpression(pattern: "__([^_\\n]+?)__"), [
                .underlineStyle: NSUnderlineStyle.single.rawValue,
            ]),
            (try! NSRegularExpression(pattern: "_([^_\\n]+?)_"), [
                .font: baseFont.italic(),
            ]),
            (try! NSRegularExpression(pattern: "~~([^~\\n]+?)~~"), [
                .strikethroughStyle: NSUnderlineStyle.single.rawValue,
            ]),
        ]
        for (regex, attrs) in patterns {
            let full = ns.string as NSString
            let matches = regex.matches(in: ns.string, range: NSRange(location: 0, length: full.length))
            for m in matches.reversed() {
                let inner = m.range(at: 1)
                if inner.location == NSNotFound { continue }
                ns.addAttributes(attrs, range: inner)
            }
        }
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
