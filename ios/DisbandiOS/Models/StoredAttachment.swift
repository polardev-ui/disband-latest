import Foundation

/**
 One attachment as it is stored in the `attachments` jsonb column.

 The shape is not ours to choose — it has to match what the web writes, field
 for field, or a message composed on a laptop shows up empty on a phone. The
 authority is `StoredAttachment` in `src/lib/message-attachments.ts`; keep the
 two in step.
 */
struct StoredAttachment: Codable, Hashable, Identifiable, Sendable {
    let url: String
    var key: String?
    var type: AttachmentType
    var name: String?
    var size: Int?

    /// Stable within a message: the same file is never attached twice, and
    /// the url is what the renderer keys its cells on.
    var id: String { url }

    enum CodingKeys: String, CodingKey {
        case url, key, type, name, size
    }
}

/// The ceiling the composer enforces, matching the database constraint and
/// the web's `MAX_ATTACHMENTS`.
let maxAttachments = 10

/**
 Everything a message carries, whichever column it came from.

 The port of the web's `readAttachments`. Messages predating the multi-
 attachment column — and every message an older client still writes — only
 have the single `attachment_url` set, so those are presented as a set of one
 rather than handled separately everywhere downstream. The array wins when it
 has anything in it, because the web mirrors the *first* attachment into the
 legacy columns for exactly this reason: a client reading only those keeps
 showing something instead of an empty bubble.
 */
func resolveAttachments(
    array: [StoredAttachment]?,
    url: String?,
    type: AttachmentType?,
    name: String?,
    size: Int?
) -> [StoredAttachment] {
    if let array, !array.isEmpty { return array }
    guard let url else { return [] }
    return [StoredAttachment(url: url, key: nil, type: type ?? .file, name: name, size: size)]
}
