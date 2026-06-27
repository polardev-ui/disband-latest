import Foundation

// MARK: - Enums

enum UserStatus: String, Codable, CaseIterable {
    case online, idle, dnd, offline

    var label: String {
        switch self {
        case .online: return "Online"
        case .idle: return "Idle"
        case .dnd: return "Do Not Disturb"
        case .offline: return "Offline / Invisible"
        }
    }
}

enum FriendshipStatus: String, Codable {
    case pending, accepted, blocked
}

enum MemberRole: String, Codable {
    case owner, admin, moderator, member
}

enum ChannelType: String, Codable {
    case text, voice
}

enum AttachmentType: String, Codable {
    case image, video, gif, file
}

// MARK: - Profile

struct Profile: Codable, Identifiable, Hashable {
    let id: String
    var username: String?
    var displayName: String?
    var avatarUrl: String?
    var bio: String?
    var status: UserStatus
    var preferredStatus: UserStatus?
    var bannerUrl: String?
    var accentColor: String?
    var accentColor2: String?
    var showOwnerBadge: Bool?
    var showStaffBadge: Bool?
    var soundEnabled: Bool?
    var desktopNotificationsEnabled: Bool?
    var linkPreviewsEnabled: Bool?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, username, bio, status
        case displayName = "display_name"
        case avatarUrl = "avatar_url"
        case preferredStatus = "preferred_status"
        case bannerUrl = "banner_url"
        case accentColor = "accent_color"
        case accentColor2 = "accent_color_2"
        case showOwnerBadge = "show_owner_badge"
        case showStaffBadge = "show_staff_badge"
        case soundEnabled = "sound_enabled"
        case desktopNotificationsEnabled = "desktop_notifications_enabled"
        case linkPreviewsEnabled = "link_previews_enabled"
        case createdAt = "created_at"
    }

    var name: String { displayName ?? username ?? "Unknown" }
    var handle: String { username ?? "user" }
    var initials: String {
        let base = name.trimmingCharacters(in: .whitespaces)
        guard let first = base.first else { return "?" }
        return String(first).uppercased()
    }
}

// MARK: - Friendship

struct Friendship: Codable, Identifiable, Hashable {
    let id: String
    let requesterId: String
    let addresseeId: String
    var status: FriendshipStatus
    let createdAt: String?
    var requester: Profile?
    var addressee: Profile?

    enum CodingKeys: String, CodingKey {
        case id, status, requester, addressee
        case requesterId = "requester_id"
        case addresseeId = "addressee_id"
        case createdAt = "created_at"
    }
}

// MARK: - Servers & Channels

struct Server: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var iconUrl: String?
    var bannerUrl: String?
    var description: String?
    let ownerId: String
    var inviteCode: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case iconUrl = "icon_url"
        case bannerUrl = "banner_url"
        case ownerId = "owner_id"
        case inviteCode = "invite_code"
        case createdAt = "created_at"
    }
}

struct ChannelCategory: Codable, Identifiable, Hashable {
    let id: String
    let serverId: String
    var name: String
    var position: Int

    enum CodingKeys: String, CodingKey {
        case id, name, position
        case serverId = "server_id"
    }
}

struct Channel: Codable, Identifiable, Hashable {
    let id: String
    let serverId: String
    var categoryId: String?
    var name: String
    var type: ChannelType
    var position: Int
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, type, position
        case serverId = "server_id"
        case categoryId = "category_id"
        case createdAt = "created_at"
    }
}

struct ServerMember: Codable, Identifiable, Hashable {
    let serverId: String
    let userId: String
    var role: MemberRole
    var profile: Profile?

    var id: String { "\(serverId):\(userId)" }

    enum CodingKeys: String, CodingKey {
        case role, profile
        case serverId = "server_id"
        case userId = "user_id"
    }
}

// MARK: - Messages

struct Message: Codable, Identifiable, Hashable {
    let id: String
    let channelId: String
    let authorId: String
    var content: String
    var attachmentUrl: String?
    var attachmentType: AttachmentType?
    var attachmentName: String?
    var attachmentSize: Int?
    var replyToId: String?
    var mentions: [String]?
    let createdAt: String
    var editedAt: String?
    var author: Profile?

    enum CodingKeys: String, CodingKey {
        case id, content, mentions, author
        case channelId = "channel_id"
        case authorId = "author_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case attachmentName = "attachment_name"
        case attachmentSize = "attachment_size"
        case replyToId = "reply_to_id"
        case createdAt = "created_at"
        case editedAt = "edited_at"
    }
}

// MARK: - Direct messages

struct DmThread: Codable, Identifiable, Hashable {
    let id: String
    let userA: String
    let userB: String
    let createdAt: String?
    var friend: Profile?

    enum CodingKeys: String, CodingKey {
        case id
        case userA = "user_a"
        case userB = "user_b"
        case createdAt = "created_at"
    }
}

struct DmMessage: Codable, Identifiable, Hashable {
    let id: String
    let threadId: String
    let authorId: String
    var content: String
    var attachmentUrl: String?
    var attachmentType: AttachmentType?
    var replyToId: String?
    let createdAt: String
    var editedAt: String?
    var author: Profile?

    enum CodingKeys: String, CodingKey {
        case id, content, author
        case threadId = "thread_id"
        case authorId = "author_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case replyToId = "reply_to_id"
        case createdAt = "created_at"
        case editedAt = "edited_at"
    }
}

// MARK: - Group chats

struct GroupChat: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    let ownerId: String
    var iconUrl: String?
    let createdAt: String?
    var members: [Profile]?

    enum CodingKeys: String, CodingKey {
        case id, name, members
        case ownerId = "owner_id"
        case iconUrl = "icon_url"
        case createdAt = "created_at"
    }
}

struct GroupMessage: Codable, Identifiable, Hashable {
    let id: String
    let groupId: String
    let authorId: String
    var content: String
    var attachmentUrl: String?
    var attachmentType: AttachmentType?
    var replyToId: String?
    let createdAt: String
    var editedAt: String?
    var author: Profile?

    enum CodingKeys: String, CodingKey {
        case id, content, author
        case groupId = "group_id"
        case authorId = "author_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case replyToId = "reply_to_id"
        case createdAt = "created_at"
        case editedAt = "edited_at"
    }
}

// MARK: - Reactions

struct MessageReaction: Codable, Identifiable, Hashable {
    let id: String
    let contextType: String
    let messageId: String
    let userId: String
    let emoji: String

    enum CodingKeys: String, CodingKey {
        case id, emoji
        case contextType = "context_type"
        case messageId = "message_id"
        case userId = "user_id"
    }
}

struct ReactionSummary: Identifiable, Hashable {
    var id: String { emoji }
    let emoji: String
    var count: Int
    var reacted: Bool
}

// MARK: - Voice presence

struct VoiceParticipant: Codable, Identifiable, Hashable {
    let channelId: String
    let userId: String
    var profile: Profile?

    var id: String { "\(channelId):\(userId)" }

    enum CodingKeys: String, CodingKey {
        case profile
        case channelId = "channel_id"
        case userId = "user_id"
    }
}

// MARK: - Notifications

struct AppNotification: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let type: String
    let title: String
    var body: String?
    var link: String?
    var read: Bool
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, type, title, body, link, read
        case userId = "user_id"
        case createdAt = "created_at"
    }
}
