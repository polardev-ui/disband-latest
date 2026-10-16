import CoreGraphics
import ImageIO
import Foundation

// Tray icons for the Disband desktop app.
//
// The tray wants the bare mark — no background tile — so it reads as a glyph
// in the menu bar / system tray:
//   tray-macos.png  black + alpha. macOS template rendering uses only the
//                   alpha channel and recolours the glyph for light/dark
//                   menu bars automatically.
//   tray.png        the mark in Disband purple (#5865F2) for Windows/Linux,
//                   which do not do template tinting.
//
// Usage: swift make_tray_icons.swift <logo.png> <output-dir>

guard CommandLine.arguments.count >= 3 else {
    fatalError("usage: make_tray_icons.swift <logo.png> <output-dir>")
}
let logoPath = CommandLine.arguments[1]
let outDir = URL(fileURLWithPath: CommandLine.arguments[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: logoPath) as CFURL, nil),
      let logo = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fatalError("cannot read \(logoPath)")
}

let size = 64

func render(r: CGFloat, g: CGFloat, b: CGFloat) -> CGImage {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { fatalError("cannot create context") }

    // The mark across ~92% of the canvas, centred: menu-bar glyphs sit a hair
    // inside their box so they don't touch neighbouring status items.
    let inset = CGFloat(size) * 0.04
    ctx.draw(logo, in: CGRect(
        x: inset, y: inset,
        width: CGFloat(size) - inset * 2,
        height: CGFloat(size) - inset * 2
    ))
    // Keep only the mark's alpha channel; recolour the RGB beneath it.
    ctx.setBlendMode(.sourceIn)
    ctx.setFillColor(CGColor(red: r, green: g, blue: b, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
    guard let image = ctx.makeImage() else { fatalError("render failed") }
    return image
}

func write(_ image: CGImage, to url: URL) {
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
        fatalError("cannot create \(url.path)")
    }
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else { fatalError("write failed: \(url.path)") }
}

write(render(r: 0, g: 0, b: 0), to: outDir.appendingPathComponent("tray-macos.png"))
write(render(r: 0x58 / 255.0, g: 0x65 / 255.0, b: 0xF2 / 255.0), to: outDir.appendingPathComponent("tray.png"))
print("wrote tray-macos.png + tray.png to \(outDir.path)")
