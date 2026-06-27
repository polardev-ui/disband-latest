import CoreGraphics
import ImageIO
import Foundation

// args: <output.png> <logo.png>
let outPath = CommandLine.arguments[1]
let logoPath = CommandLine.arguments[2]

let s = 1024
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: s, height: s, bitsPerComponent: 8,
                    bytesPerRow: 0, space: cs,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!

// Solid black background
ctx.setFillColor(CGColor(colorSpace: cs, components: [0, 0, 0, 1])!)
ctx.fill(CGRect(x: 0, y: 0, width: s, height: s))

// Load logo
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: logoPath) as CFURL, nil)!
let logo = CGImageSourceCreateImageAtIndex(src, 0, nil)!

// Fit the (square-ish) mark into a centered region with padding
let target: CGFloat = 760
let lw = CGFloat(logo.width), lh = CGFloat(logo.height)
let scale = target / max(lw, lh)
let w = lw * scale, h = lh * scale
let rect = CGRect(x: (CGFloat(s) - w) / 2, y: (CGFloat(s) - h) / 2, width: w, height: h)
ctx.interpolationQuality = .high
ctx.draw(logo, in: rect)

let img = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL,
                                           "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
guard CGImageDestinationFinalize(dest) else { fatalError("write failed") }
print("wrote \(outPath) (\(img.width)x\(img.height))")
