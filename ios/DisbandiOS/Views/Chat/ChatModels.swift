import Foundation

/// A backend-agnostic message used by the shared chat UI. Channel, DM, and group
/// messages are all projected into this shape.
struct DisplayMessage: Identifiable, Hashable {
    let id: String
    let authorId: String
    var author: Profile?
    var content: String
    var attachmentUrl: String?
    var attachmentType: AttachmentType?
    var replyToId: String?
    var createdAt: String
    var editedAt: String?
    /// True while an optimistic message is still being confirmed by the server.
    var pending: Bool = false

    init(id: String, authorId: String, author: Profile?, content: String,
         attachmentUrl: String?, attachmentType: AttachmentType?, replyToId: String?,
         createdAt: String, editedAt: String?, pending: Bool = false) {
        self.id = id
        self.authorId = authorId
        self.author = author
        self.content = content
        self.attachmentUrl = attachmentUrl
        self.attachmentType = attachmentType
        self.replyToId = replyToId
        self.createdAt = createdAt
        self.editedAt = editedAt
        self.pending = pending
    }

    init(_ m: Message) {
        self.init(id: m.id, authorId: m.authorId, author: m.author, content: m.content,
                  attachmentUrl: m.attachmentUrl, attachmentType: m.attachmentType,
                  replyToId: m.replyToId, createdAt: m.createdAt, editedAt: m.editedAt)
    }
    init(_ m: DmMessage) {
        self.init(id: m.id, authorId: m.authorId, author: m.author, content: m.content,
                  attachmentUrl: m.attachmentUrl, attachmentType: m.attachmentType,
                  replyToId: m.replyToId, createdAt: m.createdAt, editedAt: m.editedAt)
    }
    init(_ m: GroupMessage) {
        self.init(id: m.id, authorId: m.authorId, author: m.author, content: m.content,
                  attachmentUrl: m.attachmentUrl, attachmentType: m.attachmentType,
                  replyToId: m.replyToId, createdAt: m.createdAt, editedAt: m.editedAt)
    }
}

/// Minimal row used to decode realtime INSERT payloads across all message tables.
struct RawMessageRow: Decodable, Sendable {
    let id: String
    let authorId: String
    let content: String?
    let attachmentUrl: String?
    let attachmentType: AttachmentType?
    let replyToId: String?
    let createdAt: String
    let editedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, content
        case authorId = "author_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case replyToId = "reply_to_id"
        case createdAt = "created_at"
        case editedAt = "edited_at"
    }
}

/// Identifies which conversation a chat screen is bound to.
enum ChatSource: Hashable {
    case channel(id: String, name: String)
    case dm(threadId: String, title: String)
    case group(id: String, name: String)

    var title: String {
        switch self {
        case .channel(_, let name): return "#\(name)"
        case .dm(_, let title): return title
        case .group(_, let name): return name
        }
    }

    var realtimeTable: String {
        switch self {
        case .channel: return "messages"
        case .dm: return "dm_messages"
        case .group: return "group_messages"
        }
    }

    var realtimeFilter: String {
        switch self {
        case .channel(let id, _): return "channel_id=eq.\(id)"
        case .dm(let threadId, _): return "thread_id=eq.\(threadId)"
        case .group(let id, _): return "group_id=eq.\(id)"
        }
    }

    var contextType: String {
        switch self {
        case .channel: return "channel"
        case .dm: return "dm"
        case .group: return "group"
        }
    }

    var cacheKey: String { "\(realtimeTable):\(realtimeFilter)" }
}

/// Process-wide cache so re-opening a conversation shows messages instantly
/// while a fresh copy loads in the background.
@MainActor
final class ChatCache {
    static let shared = ChatCache()
    private var messageStore: [String: [DisplayMessage]] = [:]
    private var reactionStore: [String: [String: [ReactionSummary]]] = [:]

    func messages(_ key: String) -> [DisplayMessage]? { messageStore[key] }
    func reactions(_ key: String) -> [String: [ReactionSummary]]? { reactionStore[key] }

    func store(_ key: String, messages: [DisplayMessage], reactions: [String: [ReactionSummary]]) {
        // Don't cache optimistic (pending) rows.
        messageStore[key] = messages.filter { !$0.pending }
        reactionStore[key] = reactions
    }
}
