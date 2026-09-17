import CoreGraphics
import ImageIO
import Foundation

// Generates every Android launcher icon raster from the Disband mark.
//
//   swift android/tools/make_icons.swift android/tools/logo.png android/app/src/main/res
//
// Outputs:
//   mipmap-<density>/ic_launcher_foreground.png  108dp adaptive foreground (transparent)
//   mipmap-<density>/ic_launcher.png             48dp legacy squircle
//   mipmap-<density>/ic_launcher_round.png       48dp legacy circle
//   ../../../../play/ic_launcher-512.png         512x512 Play Console icon (opaque, no alpha)

let logoPath = CommandLine.arguments[1]
let resDir = CommandLine.arguments[2]
let playPath = CommandLine.arguments.count > 3
    ? CommandLine.arguments[3]
    : "android/play/ic_launcher-512.png"

// Keep in sync with values/colors.xml -> ic_launcher_background
let bg: (CGFloat, CGFloat, CGFloat) = (0x1E / 255.0, 0x1F / 255.0, 0x22 / 255.0)

let cs = CGColorSpaceCreateDeviceRGB()
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: logoPath) as CFURL, nil)!
let logo = CGImageSourceCreateImageAtIndex(src, 0, nil)!

/// Tight alpha bounds of the mark, so padding is measured from the artwork and
/// not from whatever transparent margin the source PNG happens to carry.
func alphaBounds(_ image: CGImage) -> CGRect {
    let w = image.width, h = image.height
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8,
                        bytesPerRow: w * 4, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    var minX = w, minY = h, maxX = -1, maxY = -1
    for y in 0..<h {
        for x in 0..<w where buf[(y * w + x) * 4 + 3] > 8 {
            if x < minX { minX = x }
            if x > maxX { maxX = x }
            if y < minY { minY = y }
            if y > maxY { maxY = y }
        }
    }
    precondition(maxX >= minX && maxY >= minY, "logo has no visible pixels")
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

let marks = alphaBounds(logo)
let logoW = CGFloat(logo.width), logoH = CGFloat(logo.height)

enum Background {
    case transparent
    case squircle
    case circle
    case square
}

/// Draws the mark centered on `size`, scaled so its tight bounds occupy
/// `coverage` of the canvas along its longest edge.
func render(size: Int, coverage: CGFloat, background: Background, to path: String) {
    let s = CGFloat(size)
    let opaque = background == .square
    let info = opaque ? CGImageAlphaInfo.noneSkipLast : CGImageAlphaInfo.premultipliedLast
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                        bytesPerRow: 0, space: cs, bitmapInfo: info.rawValue)!
    ctx.interpolationQuality = .high

    let fill = CGColor(colorSpace: cs, components: [bg.0, bg.1, bg.2, 1])!
    switch background {
    case .transparent:
        break
    case .square:
        ctx.setFillColor(fill)
        ctx.fill(CGRect(x: 0, y: 0, width: s, height: s))
    case .circle:
        ctx.setFillColor(fill)
        ctx.fillEllipse(in: CGRect(x: 0, y: 0, width: s, height: s))
    case .squircle:
        ctx.setFillColor(fill)
        ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: s, height: s),
                           cornerWidth: s * 0.22, cornerHeight: s * 0.22, transform: nil))
        ctx.fillPath()
    }

    // Scale the whole source image so that its *mark bounds* hit the coverage
    // target, then offset so those bounds land dead center.
    let scale = (s * coverage) / max(marks.width, marks.height)
    let drawW = logoW * scale, drawH = logoH * scale
    let markCenterX = (marks.midX) * scale
    // alphaBounds worked in top-down rows; CoreGraphics draws bottom-up.
    let markCenterY = (logoH - marks.midY) * scale
    let rect = CGRect(x: s / 2 - markCenterX, y: s / 2 - markCenterY, width: drawW, height: drawH)
    ctx.draw(logo, in: rect)

    let img = ctx.makeImage()!
    try? FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent,
                                             withIntermediateDirectories: true)
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL,
                                               "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, img, nil)
    guard CGImageDestinationFinalize(dest) else { fatalError("write failed: \(path)") }
    print("wrote \(path) (\(size)x\(size))")
}

// dp -> px multiplier per density bucket
let densities: [(String, CGFloat)] = [
    ("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4),
]

// The adaptive foreground is a 108dp canvas whose centre 72dp is visible and
// whose centre 66dp is guaranteed safe under every mask. 0.57 of 108dp is
// ~62dp, which keeps the tall mark clear of every corner the mask can cut.
for (name, m) in densities {
    render(size: Int((108 * m).rounded()), coverage: 0.57, background: .transparent,
           to: "\(resDir)/mipmap-\(name)/ic_launcher_foreground.png")
}

// Legacy (API < 26) launcher bitmaps: mark on its own shaped background.
for (name, m) in densities {
    let px = Int((48 * m).rounded())
    render(size: px, coverage: 0.62, background: .squircle,
           to: "\(resDir)/mipmap-\(name)/ic_launcher.png")
    render(size: px, coverage: 0.62, background: .circle,
           to: "\(resDir)/mipmap-\(name)/ic_launcher_round.png")
}

// Play Console listing icon: exactly 512x512, 32-bit PNG, no transparency.
render(size: 512, coverage: 0.62, background: .square, to: playPath)
