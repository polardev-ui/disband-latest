import AppKit
import CoreGraphics
import CoreText
import ImageIO
import Foundation

// Generates the Google Play feature graphic: exactly 1024x500, opaque PNG.
//
//   swift android/tools/make_feature_graphic.swift \
//     android/tools/logo.png android/play/feature-graphic-1024x500.png
//
// Play crops this asset for some placements and overlays a play button over
// the middle when a promo video is attached, so the whole composition is kept
// inside a centred safe box and nothing load-bearing sits at the exact centre.

let logoPath = CommandLine.arguments[1]
let outPath = CommandLine.arguments.count > 2
    ? CommandLine.arguments[2]
    : "android/play/feature-graphic-1024x500.png"

let W = 1024, H = 500
let SAFE_W: CGFloat = 764   // keep art well inside the cropped edges
let cs = CGColorSpaceCreateDeviceRGB()

func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: cs, components: [
        CGFloat((hex >> 16) & 0xFF) / 255.0,
        CGFloat((hex >> 8) & 0xFF) / 255.0,
        CGFloat(hex & 0xFF) / 255.0,
        a,
    ])!
}

// Brand tokens, kept in sync with src/app/globals.css
let bg = 0x1E1F22 as UInt32          // --background / ic_launcher_background
let brand = 0x5865F2 as UInt32       // --brand
let textPrimary = 0xFFFFFF as UInt32
let textMuted = 0xB5BAC1 as UInt32

let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                    space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.interpolationQuality = .high
ctx.setAllowsAntialiasing(true)

// ── Background ────────────────────────────────────────────────────────────────
ctx.setFillColor(rgb(bg))
ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

// Centre-weighted vignette. A linear lift banded diagonally once cropped, so
// the background is lifted from the middle outward instead.
if let vignette = CGGradient(colorsSpace: cs,
                             colors: [rgb(0x2A2C34, 1), rgb(bg, 1), rgb(0x15161A, 1)] as CFArray,
                             locations: [0, 0.62, 1]) {
    ctx.saveGState()
    let c = CGPoint(x: CGFloat(W) / 2, y: CGFloat(H) / 2)
    ctx.drawRadialGradient(vignette, startCenter: c, startRadius: 0,
                           endCenter: c, endRadius: CGFloat(W) * 0.66,
                           options: [.drawsAfterEndLocation])
    ctx.restoreGState()
}

/// Soft radial brand glow, used behind the mark and as a far-corner accent.
func glow(center: CGPoint, radius: CGFloat, color: UInt32, alpha: CGFloat) {
    guard let g = CGGradient(colorsSpace: cs,
                             colors: [rgb(color, alpha), rgb(color, 0)] as CFArray,
                             locations: [0, 1]) else { return }
    ctx.saveGState()
    ctx.drawRadialGradient(g, startCenter: center, startRadius: 0,
                           endCenter: center, endRadius: radius,
                           options: [.drawsAfterEndLocation])
    ctx.restoreGState()
}

// ── Logo ──────────────────────────────────────────────────────────────────────
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: logoPath) as CFURL, nil)!
let logo = CGImageSourceCreateImageAtIndex(src, 0, nil)!

/// Tight alpha bounds, so the mark is positioned by its artwork rather than by
/// the transparent margin baked into the source PNG.
func alphaBounds(_ image: CGImage) -> CGRect {
    let w = image.width, h = image.height
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    let c = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    var minX = w, minY = h, maxX = -1, maxY = -1
    for y in 0..<h {
        for x in 0..<w where buf[(y * w + x) * 4 + 3] > 8 {
            if x < minX { minX = x }
            if x > maxX { maxX = x }
            if y < minY { minY = y }
            if y > maxY { maxY = y }
        }
    }
    precondition(maxX >= minX, "logo has no visible pixels")
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

let marks = alphaBounds(logo)
let logoW = CGFloat(logo.width), logoH = CGFloat(logo.height)

// ── Text ──────────────────────────────────────────────────────────────────────
let wordmarkFont = NSFont.systemFont(ofSize: 106, weight: .bold) as CTFont
let taglineFont = NSFont.systemFont(ofSize: 31, weight: .regular) as CTFont

func line(_ text: String, _ font: CTFont, _ color: UInt32, tracking: CGFloat = 0) -> CTLine {
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: rgb(color),
        .kern: tracking,
    ]
    return CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
}

func width(_ l: CTLine) -> CGFloat { CGFloat(CTLineGetTypographicBounds(l, nil, nil, nil)) }
func metrics(_ l: CTLine) -> (ascent: CGFloat, descent: CGFloat) {
    var a: CGFloat = 0, d: CGFloat = 0
    _ = CTLineGetTypographicBounds(l, &a, &d, nil)
    return (a, d)
}

let wordmark = line("Disband", wordmarkFont, textPrimary, tracking: -2)
let tagline = line("Free voice & text chat for your people", taglineFont, textMuted)

// ── Layout ────────────────────────────────────────────────────────────────────
// One horizontal cluster — mark, gutter, stacked text — centred as a whole and
// uniformly scaled down if it would ever exceed the safe width.
let markHeight: CGFloat = 232
let markWidth = markHeight * (marks.width / marks.height)
let gutter: CGFloat = 60
let textWidth = max(width(wordmark), width(tagline))

let clusterWidth = markWidth + gutter + textWidth
let scale = min(1, SAFE_W / clusterWidth)

let originX = (CGFloat(W) - clusterWidth * scale) / 2
let centerY = CGFloat(H) / 2

// Brand glow behind the mark, plus a dimmer one bleeding off the right edge.
let markCenter = CGPoint(x: originX + markWidth * scale / 2, y: centerY)
glow(center: markCenter, radius: 288 * scale, color: brand, alpha: 0.38)
glow(center: CGPoint(x: CGFloat(W) + 40, y: -40), radius: 460, color: brand, alpha: 0.10)

// Mark: scale the whole source image so its tight bounds hit markHeight, then
// offset so those bounds land where the layout wants them.
do {
    let s = (markHeight * scale) / marks.height
    let drawW = logoW * s, drawH = logoH * s
    // alphaBounds counted rows top-down; CoreGraphics draws bottom-up.
    let markMidX = marks.midX * s
    let markMidY = (logoH - marks.midY) * s
    ctx.draw(logo, in: CGRect(x: originX + markWidth * scale / 2 - markMidX,
                              y: centerY - markMidY,
                              width: drawW, height: drawH))
}

// Text block: wordmark over tagline, optically centred on the mark.
do {
    let textX = originX + (markWidth + gutter) * scale
    let wm = metrics(wordmark)
    let tg = metrics(tagline)
    let leading: CGFloat = 26 * scale
    let blockHeight = (wm.ascent + wm.descent) * scale + leading + (tg.ascent + tg.descent) * scale
    let top = centerY + blockHeight / 2

    ctx.saveGState()
    ctx.textMatrix = CGAffineTransform(scaleX: scale, y: scale)

    let wordmarkBaseline = top - wm.ascent * scale
    ctx.textPosition = CGPoint(x: textX, y: wordmarkBaseline)
    CTLineDraw(wordmark, ctx)

    let taglineBaseline = wordmarkBaseline - wm.descent * scale - leading - tg.ascent * scale
    ctx.textPosition = CGPoint(x: textX, y: taglineBaseline)
    CTLineDraw(tagline, ctx)

    // Short brand rule under the tagline to tie the text back to the glow.
    ctx.setFillColor(rgb(brand))
    ctx.fill(CGRect(x: textX, y: taglineBaseline - tg.descent * scale - 22 * scale,
                    width: 108 * scale, height: 5 * scale))
    ctx.restoreGState()
}

// ── Write ─────────────────────────────────────────────────────────────────────
let img = ctx.makeImage()!
try? FileManager.default.createDirectory(atPath: (outPath as NSString).deletingLastPathComponent,
                                         withIntermediateDirectories: true)
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL,
                                           "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
guard CGImageDestinationFinalize(dest) else { fatalError("write failed") }
print("wrote \(outPath) (\(img.width)x\(img.height))")
