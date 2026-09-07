import SwiftUI

/// Human-readable byte counts, matching the web app's formatting.
enum FileSizeFormat {
    static func string(_ bytes: Int?) -> String? {
        guard let bytes, bytes > 0 else { return nil }
        let units = ["B", "KB", "MB", "GB"]
        var value = Double(bytes)
        var unit = 0
        while value >= 1024 && unit < units.count - 1 {
            value /= 1024
            unit += 1
        }
        return value >= 10 || unit == 0
            ? "\(Int(value.rounded())) \(units[unit])"
            : String(format: "%.1f %@", value, units[unit])
    }

    static func extensionLabel(_ name: String) -> String {
        let ext = (name as NSString).pathExtension.uppercased()
        return ext.isEmpty ? "FILE" : String(ext.prefix(4))
    }
}

/**
 A non-media attachment in a message.

 This used to be the word "Attachment" and a paperclip, which said nothing
 about what had been sent — a save file, a document and a zip were all the same
 row. A file is identified by its name and its size, so those are what the card
 shows.
 */
struct AttachmentFileCard: View {
    let url: URL
    let name: String
    let size: Int?

    @State private var showShare = false

    var body: some View {
        HStack(spacing: 12) {
            Text(FileSizeFormat.extensionLabel(name))
                .font(.caption2.weight(.bold))
                .foregroundStyle(Brand.accent)
                .frame(width: 40, height: 40)
                .background(Brand.elevated, in: .rect(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Brand.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if let size = FileSizeFormat.string(size) {
                    Text(size).font(.caption).foregroundStyle(Brand.textMuted)
                }
            }

            Spacer(minLength: 8)

            Button { showShare = true } label: {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(Brand.accent)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Save \(name)")
        }
        .padding(10)
        .background(Brand.surface, in: .rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Brand.elevated, lineWidth: 1))
        .frame(maxWidth: 300, alignment: .leading)
        .padding(.top, 4)
        .sheet(isPresented: $showShare) { ShareSheet(items: [url]) }
    }
}

/**
 What a message looks like while its file is still going up.

 The message appeared immediately with the attachment rendered as though it had
 arrived, so a 40 MB video looked exactly like a finished one until it suddenly
 changed. This says what the file is, how big it is, and how far along it is.
 */
struct AttachmentUploadCard: View {
    let name: String
    let size: Int?
    let type: AttachmentType?
    /// 0...1.
    let progress: Double

    private var percent: Int { Int((min(max(progress, 0), 1) * 100).rounded()) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Group {
                    switch type {
                    case .image, .gif: Image(systemName: "photo")
                    case .video: Image(systemName: "film")
                    default: Text(FileSizeFormat.extensionLabel(name))
                        .font(.caption2.weight(.bold))
                    }
                }
                .foregroundStyle(Brand.accent)
                .frame(width: 40, height: 40)
                .background(Brand.elevated, in: .rect(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text(uploadDetail)
                        .font(.caption)
                        .foregroundStyle(Brand.textMuted)
                }

                Spacer(minLength: 8)
            }

            ProgressView(value: min(max(progress, 0), 1))
                .tint(Brand.accent)
        }
        .padding(10)
        .background(Brand.surface, in: .rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Brand.elevated, lineWidth: 1))
        .frame(maxWidth: 300, alignment: .leading)
        .padding(.top, 4)
        .accessibilityLabel("Uploading \(name), \(percent) percent")
    }

    private var uploadDetail: String {
        let sizeLabel = FileSizeFormat.string(size).map { "\($0) · " } ?? ""
        return percent < 100 ? "\(sizeLabel)Uploading… \(percent)%" : "\(sizeLabel)Finishing up…"
    }
}
