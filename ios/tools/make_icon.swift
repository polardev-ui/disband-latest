import CoreGraphics
import ImageIO
import Foundation

let s = 1024
let cs = CGColorSpaceCreateDeviceRGB()
// noneSkipLast => opaque, NO alpha channel in the exported PNG (App Store requirement)
let ctx = CGContext(data: nil, width: s, height: s, bitsPerComponent: 8,
                    bytesPerRow: 0, space: cs,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!

func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: cs, components: [r, g, b, a])!
}

// Background blurple gradient (top -> bottom)
let grad = CGGradient(colorsSpace: cs,
                      colors: [color(0.36, 0.40, 0.96), color(0.28, 0.32, 0.77)] as CFArray,
                      locations: [0, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: s), end: CGPoint(x: 0, y: 0), options: [])

func roundedRect(_ r: CGRect, _ radius: CGFloat, _ c: CGColor) {
    let path = CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil)
    ctx.addPath(path); ctx.setFillColor(c); ctx.fillPath()
}

// Back bubble (faint white) for depth
roundedRect(CGRect(x: 360, y: 380, width: 470, height: 380), 110, color(1, 1, 1, 0.32))

// Front bubble (solid white) + tail
let front = CGRect(x: 200, y: 320, width: 470, height: 380)
roundedRect(front, 110, color(1, 1, 1))
ctx.beginPath()
ctx.move(to: CGPoint(x: 300, y: 340))
ctx.addLine(to: CGPoint(x: 250, y: 230))
ctx.addLine(to: CGPoint(x: 405, y: 340))
ctx.closePath()
ctx.setFillColor(color(1, 1, 1)); ctx.fillPath()

// Three blurple dots inside the front bubble
ctx.setFillColor(color(0.34, 0.39, 0.95))
let cy = front.midY + 10, d: CGFloat = 60
for cx in [front.midX - 132, front.midX, front.midX + 132] {
    ctx.fillEllipse(in: CGRect(x: cx - d/2, y: cy - d/2, width: d, height: d))
}

let img = ctx.makeImage()!
let out = URL(fileURLWithPath: CommandLine.arguments[1])
let dest = CGImageDestinationCreateWithURL(out as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
guard CGImageDestinationFinalize(dest) else { fatalError("write failed") }
print("wrote \(out.path) (\(img.width)x\(img.height))")
