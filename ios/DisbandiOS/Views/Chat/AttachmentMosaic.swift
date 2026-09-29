import SwiftUI

/**
 Several images on one message, laid out the way the web lays them out.

 The row shape is copied deliberately from `AttachmentGrid.tsx` rather than
 reinvented: the same message has to read the same on a phone and on a
 laptop, and a flat grid does not — a lone leading row of one or two gives the
 set a hero, and rows of three stop later images shrinking to thumbnails.
 Change one side and change the other.

 Only images and GIFs are tiled. Videos and files keep their own cards, which
 carry a filename, a size and a play control that a cropped thumbnail cannot.
 */
struct AttachmentMosaic: View {
    let attachments: [StoredAttachment]
    var onOpen: (StoredAttachment) -> Void = { _ in }

    private static let gap: CGFloat = 3

    /// How many images go on each row, by total count. Mirrors `rowsFor`.
    private static func rows(for count: Int) -> [Int] {
        switch count {
        case 1: return [1]
        case 2: return [2]
        case 3: return [3]   // handled specially — hero beside a stacked pair
        case 4: return [2, 2]
        case 5: return [2, 3]
        case 6: return [3, 3]
        case 7: return [1, 3, 3]
        case 8: return [2, 3, 3]
        case 9: return [3, 3, 3]
        case 10: return [1, 3, 3, 3]
        default:
            // Past ten cannot be sent, but is laid out rather than dropped.
            var out: [Int] = []
            var left = count
            while left > 0 {
                out.append(min(3, left))
                left -= 3
            }
            return out
        }
    }

    /// A row of one is the hero and gets more height than a row of three.
    private static func rowHeight(_ perRow: Int) -> CGFloat {
        switch perRow {
        case 1: return 230
        case 2: return 150
        default: return 110
        }
    }

    var body: some View {
        let tiles = attachments.filter { $0.type == .image || $0.type == .gif }

        if tiles.count <= 1 {
            // One image is not a mosaic; the ordinary card already handles it
            // (and handles the file and video cases this view does not).
            EmptyView()
        } else if tiles.count == 3 {
            heroLayout(tiles)
        } else {
            rowLayout(tiles)
        }
    }

    /// Three is the one count that is not row-based: a tall image on the left
    /// with two stacked beside it.
    private func heroLayout(_ tiles: [StoredAttachment]) -> some View {
        HStack(spacing: Self.gap) {
            tile(tiles[0])
            VStack(spacing: Self.gap) {
                tile(tiles[1])
                tile(tiles[2])
            }
        }
        .frame(height: 220)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func rowLayout(_ tiles: [StoredAttachment]) -> some View {
        var remaining = tiles[...]
        var built: [[StoredAttachment]] = []
        for perRow in Self.rows(for: tiles.count) {
            let take = min(perRow, remaining.count)
            guard take > 0 else { break }
            built.append(Array(remaining.prefix(take)))
            remaining = remaining.dropFirst(take)
        }

        return VStack(spacing: Self.gap) {
            ForEach(Array(built.enumerated()), id: \.offset) { _, row in
                HStack(spacing: Self.gap) {
                    ForEach(row) { tile($0) }
                }
                .frame(height: Self.rowHeight(row.count))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func tile(_ attachment: StoredAttachment) -> some View {
        Button { onOpen(attachment) } label: {
            // `fill` plus a clip: every cell in a row is the same height, so a
            // portrait photo next to a landscape one has to be cropped rather
            // than letterboxed, or the row grows gaps.
            RemoteImage(url: attachment.url, contentMode: .fill) {
                Rectangle().fill(Brand.elevated)
                    .overlay(ProgressView().tint(Brand.textMuted).controlSize(.small))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
