import CoreGraphics
import ImageIO
import Foundation

// Layered source art for AppIcon.icon (Icon Composer, Liquid Glass).
//
// The REAL Disband mark (ios/tools/logo.png, white triangle) — NOT the chat
// bubbles from make_icon.swift. Two full-canvas layers so the system can
// refract glass between them:
//   background.png — solid black, opaque, full-bleed.
//   glyph.png      — the mark on transparency, drawn at ~860pt vs the legacy
//                    flat icon's 760pt ("make the icon a bit larger").
//
// Usage: swift tools/make_icon_layers.swift <logo.png> <output-dir>

let logoPath = CommandLine.arguments[1]
let outDir = URL(fileURLWithPath: CommandLine.arguments[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let s = 1024
let cs = CGColorSpaceCreateDeviceRGB()

func write(_ ctx: CGContext, to url: URL) {
    guard let img = ctx.makeImage() else { fatalError("render failed") }
    let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, img, nil)
    guard CGImageDestinationFinalize(dest) else { fatalError("write failed: \(url.path)") }
    print("wrote \(url.path) (\(img.width)x\(img.height))")
}

let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: logoPath) as CFURL, nil)!
let logo = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let lw = CGFloat(logo.width), lh = CGFloat(logo.height)

// Background: solid black, opaque.
do {
    let ctx = CGContext(data: nil, width: s, height: s, bitsPerComponent: 8,
                        bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(colorSpace: cs, components: [0, 0, 0, 1])!)
    ctx.fill(CGRect(x: 0, y: 0, width: s, height: s))
    write(ctx, to: outDir.appendingPathComponent("background.png"))
}

// Glyph: the mark on transparency, larger than the legacy icon.
do {
    let ctx = CGContext(data: nil, width: s, height: s, bitsPerComponent: 8,
                        bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.clear(CGRect(x: 0, y: 0, width: s, height: s))
    let target: CGFloat = 960
    let scale = target / max(lw, lh)
    let w = lw * scale, h = lh * scale
    ctx.interpolationQuality = .high
    ctx.draw(logo, in: CGRect(x: (CGFloat(s) - w) / 2, y: (CGFloat(s) - h) / 2, width: w, height: h))
    write(ctx, to: outDir.appendingPathComponent("glyph.png"))
}
