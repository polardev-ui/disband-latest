package com.wsgpolar.disband.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// MARK: - Enums

@Serializable
enum class UserStatus {
    @SerialName("online") Online,
    @SerialName("idle") Idle,
    @SerialName("dnd") Dnd,
    @SerialName("offline") Offline,
    ;

    val raw: String
        get() = when (this) {
            Online -> "online"
            Idle -> "idle"
            Dnd -> "dnd"
            Offline -> "offline"
        }

    val label: String
        get() = when (this) {
            Online -> "Online"
            Idle -> "Idle"
            Dnd -> "Do Not Disturb"
            Offline -> "Offline / Invisible"
        }

    val shortLabel: String
        get() = when (this) {
            Online -> "Online"
            Idle -> "Away"
            Dnd -> "Busy"
            Offline -> "Invisible"
        }
}

@Serializable
enum class FriendshipStatus {
    @SerialName("pending") Pending,
    @SerialName("accepted") Accepted,
    @SerialName("blocked") Blocked,
}

@Serializable
enum class MemberRole {
    @SerialName("owner") Owner,
    @SerialName("admin") Admin,
    @SerialName("moderator") Moderator,
    @SerialName("member") Member,
}

@Serializable
enum class ChannelType {
    @SerialName("text") Text,
    @SerialName("voice") Voice,
}

/**
 * What an attachment is.
 *
 * The server's vocabulary has grown past image/video/gif/file — the web
 * writes `poll` and `audio` too — and kotlinx.serialization THROWS on an enum
 * value it does not know. One audio attachment anywhere in a response failed
 * the whole decode, and because the callers wrap their loads in `runCatching`
 * it surfaced as an empty list rather than an error: a DM inbox with 160
 * conversations in it showed nothing at all, silently, because someone had
 * once sent a voice message.
 *
 * [Unknown] is the landing place for anything a future server adds, so an
 * older build degrades to "some kind of attachment" instead of losing the
 * conversation. iOS has had this guard since its own version of this bug;
 * Android never got it.
 */
@Serializable(with = AttachmentTypeSerializer::class)
enum class AttachmentType {
    Image, Video, Gif, File, Poll, Audio, Unknown;

    val raw: String
        get() = when (this) {
            Image -> "image"
            Video -> "video"
            Gif -> "gif"
            File -> "file"
            Poll -> "poll"
            Audio -> "audio"
            Unknown -> "file"
        }

    companion object {
        fun from(raw: String?): AttachmentType = when (raw?.lowercase()) {
            "image" -> Image
            "video" -> Video
            "gif" -> Gif
            "file" -> File
            "poll" -> Poll
            "audio" -> Audio
            else -> Unknown
        }
    }
}

/** Decodes any string, so a new server value can never fail a whole response. */
object AttachmentTypeSerializer : kotlinx.serialization.KSerializer<AttachmentType> {
    override val descriptor: kotlinx.serialization.descriptors.SerialDescriptor =
        kotlinx.serialization.descriptors.PrimitiveSerialDescriptor(
            "AttachmentType",
            kotlinx.serialization.descriptors.PrimitiveKind.STRING,
        )

    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): AttachmentType =
        AttachmentType.from(decoder.decodeString())

    override fun serialize(
        encoder: kotlinx.serialization.encoding.Encoder,
        value: AttachmentType,
    ) = encoder.encodeString(value.raw)
}

// MARK: - Profile

@Serializable
data class Profile(
    val id: String,
    var username: String? = null,
    @SerialName("display_name") var displayName: String? = null,
    @SerialName("avatar_url") var avatarUrl: String? = null,
    var bio: String? = null,
    var pronouns: String? = null,
    @SerialName("status_note") var statusNote: String? = null,
    @SerialName("status_expires_at") var statusExpiresAt: String? = null,
    var status: UserStatus = UserStatus.Offline,
    @SerialName("preferred_status") var preferredStatus: UserStatus? = null,
    @SerialName("banner_url") var bannerUrl: String? = null,
    @SerialName("accent_color") var accentColor: String? = null,
    @SerialName("accent_color_2") var accentColor2: String? = null,
    var theme: String? = null,
    @SerialName("show_owner_badge") var showOwnerBadge: Boolean? = null,
    @SerialName("show_staff_badge") var showStaffBadge: Boolean? = null,
    @SerialName("show_og_badge") var showOgBadge: Boolean? = null,
    @SerialName("show_bounty_badge") var showBountyBadge: Boolean? = null,
    @SerialName("sound_enabled") var soundEnabled: Boolean? = null,
    @SerialName("desktop_notifications_enabled") var desktopNotificationsEnabled: Boolean? = null,
    @SerialName("link_previews_enabled") var linkPreviewsEnabled: Boolean? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val name: String get() = displayName ?: username ?: "Unknown"
    val handle: String get() = username ?: "user"
    val initials: String get() = name.trim().takeIf { it.isNotEmpty() }?.first()?.uppercase() ?: "?"
    /** Custom status line, or null once expired — mirrors iOS activeStatusNote / web activeStatusNote. */
    val activeStatusNote: String?
        get() {
            val note = statusNote?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            // Expired notes linger server-side so every reader must check the expiry.
            val raw = statusExpiresAt ?: return note
            val expired = runCatching {
                java.time.OffsetDateTime.parse(raw).toInstant().isBefore(java.time.Instant.now())
            }.getOrElse {
                runCatching {
                    java.time.Instant.parse(raw).isBefore(java.time.Instant.now())
                }.getOrDefault(false)
            }
            return if (expired) null else note
        }
}

// MARK: - Friendship

@Serializable
data class Friendship(
    val id: String,
    @SerialName("requester_id") val requesterId: String,
    @SerialName("addressee_id") val addresseeId: String,
    var status: FriendshipStatus,
    @SerialName("created_at") val createdAt: String? = null,
    var requester: Profile? = null,
    var addressee: Profile? = null,
)

// MARK: - Servers & channels

@Serializable
data class Server(
    val id: String,
    var name: String,
    @SerialName("icon_url") var iconUrl: String? = null,
    @SerialName("banner_url") var bannerUrl: String? = null,
    var description: String? = null,
    @SerialName("owner_id") val ownerId: String,
    @SerialName("invite_code") var inviteCode: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    /// Official "verified by Disband" mark. Nullable so a row without the
    /// column still decodes, matching iOS.
    var verified: Boolean? = null,
)

@Serializable
data class ChannelCategory(
    val id: String,
    @SerialName("server_id") val serverId: String,
    var name: String,
    var position: Int,
)

@Serializable
data class Channel(
    val id: String,
    @SerialName("server_id") val serverId: String,
    @SerialName("category_id") var categoryId: String? = null,
    var name: String,
    var type: ChannelType,
    var position: Int,
    @SerialName("created_at") val createdAt: String? = null,
    /// Announcement channel: only people who can manage channels may post.
    @SerialName("read_only") var readOnly: Boolean? = null,
)

@Serializable
data class ServerMember(
    @SerialName("server_id") val serverId: String,
    @SerialName("user_id") val userId: String,
    var role: MemberRole = MemberRole.Member,
    var profile: Profile? = null,
) {
    val id: String get() = "$serverId:$userId"
}

// MARK: - Attachments

/**
 * One attachment as it is stored in the `attachments` jsonb column.
 *
 * The shape is not ours to choose: it has to match what the web writes, field
 * for field, or a message composed on a laptop arrives empty on a phone. The
 * authority is `StoredAttachment` in `src/lib/message-attachments.ts`.
 *
 * `type` is a plain string rather than the [AttachmentType] enum because the
 * web is free to add kinds we have never heard of, and an unknown value must
 * not fail the whole message's decode.
 */
@Serializable
data class StoredAttachment(
    val url: String,
    val key: String? = null,
    val type: String = "file",
    val name: String? = null,
    val size: Int? = null,
)

/** The ceiling the composer enforces, matching the database constraint. */
const val MAX_ATTACHMENTS = 10

/**
 * Everything a message carries, whichever column it came from.
 *
 * Messages written before the array column — and by any client that still
 * only knows the old one — set `attachment_url` alone, so those are presented
 * as a set of one rather than handled separately everywhere downstream. The
 * array wins when it has anything in it, because the web mirrors the *first*
 * attachment into the legacy columns for exactly this reason.
 */
fun resolveAttachments(
    array: List<StoredAttachment>?,
    url: String?,
    type: AttachmentType?,
    name: String?,
    size: Int?,
): List<StoredAttachment> {
    if (!array.isNullOrEmpty()) return array
    if (url == null) return emptyList()
    return listOf(
        StoredAttachment(
            url = url,
            type = type?.name?.lowercase() ?: "file",
            name = name,
            size = size,
        )
    )
}

// MARK: - Messages

@Serializable
data class Message(
    val id: String,
    @SerialName("channel_id") val channelId: String,
    @SerialName("author_id") val authorId: String,
    var content: String,
    @SerialName("attachment_url") var attachmentUrl: String? = null,
    @SerialName("attachment_type") var attachmentType: AttachmentType? = null,
    @SerialName("attachment_name") var attachmentName: String? = null,
    @SerialName("attachment_size") var attachmentSize: Int? = null,
    /** Every attachment. The legacy fields above mirror the first one. */
    var attachments: List<StoredAttachment>? = null,
    @SerialName("reply_to_id") var replyToId: String? = null,
    var mentions: List<String>? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("edited_at") var editedAt: String? = null,
    var author: Profile? = null,
)

// MARK: - Direct messages

@Serializable
data class DmThread(
    val id: String,
    @SerialName("user_a") val userA: String,
    @SerialName("user_b") val userB: String,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("last_message_at") var lastMessageAt: String? = null,
    @SerialName("last_message_preview") var lastMessagePreview: String? = null,
    var friend: Profile? = null,
)

@Serializable
data class DmMessage(
    val id: String,
    @SerialName("thread_id") val threadId: String,
    @SerialName("author_id") val authorId: String,
    var content: String,
    @SerialName("attachment_url") var attachmentUrl: String? = null,
    @SerialName("attachment_type") var attachmentType: AttachmentType? = null,
    @SerialName("attachment_name") var attachmentName: String? = null,
    @SerialName("attachment_size") var attachmentSize: Int? = null,
    /** Every attachment. The legacy fields above mirror the first one. */
    var attachments: List<StoredAttachment>? = null,
    @SerialName("reply_to_id") var replyToId: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("edited_at") var editedAt: String? = null,
    var author: Profile? = null,
)

// MARK: - Group chats

@Serializable
data class GroupChat(
    val id: String,
    var name: String,
    @SerialName("owner_id") val ownerId: String,
    @SerialName("icon_url") var iconUrl: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    var members: List<Profile>? = null,
)

@Serializable
data class GroupMessage(
    val id: String,
    @SerialName("group_id") val groupId: String,
    @SerialName("author_id") val authorId: String,
    var content: String,
    @SerialName("attachment_url") var attachmentUrl: String? = null,
    @SerialName("attachment_type") var attachmentType: AttachmentType? = null,
    @SerialName("attachment_name") var attachmentName: String? = null,
    @SerialName("attachment_size") var attachmentSize: Int? = null,
    /** Every attachment. The legacy fields above mirror the first one. */
    var attachments: List<StoredAttachment>? = null,
    @SerialName("reply_to_id") var replyToId: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("edited_at") var editedAt: String? = null,
    var author: Profile? = null,
)

// MARK: - Reactions

@Serializable
data class MessageReaction(
    val id: String,
    @SerialName("context_type") val contextType: String,
    @SerialName("message_id") val messageId: String,
    @SerialName("user_id") val userId: String,
    val emoji: String,
)

data class ReactionSummary(
    val emoji: String,
    var count: Int,
    var reacted: Boolean,
)

// MARK: - Voice presence

@Serializable
data class VoiceParticipant(
    @SerialName("channel_id") val channelId: String,
    @SerialName("user_id") val userId: String,
    var profile: Profile? = null,
) {
    val id: String get() = "$channelId:$userId"
}

// MARK: - Notifications

@Serializable
data class AppNotification(
    val id: String,
    @SerialName("user_id") val userId: String,
    val type: String,
    val title: String,
    var body: String? = null,
    var link: String? = null,
    var read: Boolean,
    @SerialName("created_at") val createdAt: String? = null,
)

// MARK: - Notes

@Serializable
data class Note(
    val id: String,
    @SerialName("user_id") val userId: String,
    var content: String,
    @SerialName("attachment_url") var attachmentUrl: String? = null,
    @SerialName("attachment_type") var attachmentType: AttachmentType? = null,
    @SerialName("attachment_name") var attachmentName: String? = null,
    var pinned: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("edited_at") var editedAt: String? = null,
)

// MARK: - Insert payloads

@Serializable
data class NewMessage(
    @SerialName("channel_id") val channelId: String,
    @SerialName("author_id") val authorId: String,
    val content: String,
    @SerialName("attachment_url") val attachmentUrl: String? = null,
    @SerialName("attachment_type") val attachmentType: String? = null,
    @SerialName("attachment_key") val attachmentKey: String? = null,
    /** Name and size of the first attachment, so a client that reads only
     *  the legacy columns still shows a proper file card. */
    @SerialName("attachment_name") val attachmentName: String? = null,
    @SerialName("attachment_size") val attachmentSize: Int? = null,
    /** Every attachment. Null for a single-attachment send, so the column
     *  is left alone and behaves exactly as it did before. */
    val attachments: List<StoredAttachment>? = null,
    @SerialName("reply_to_id") val replyToId: String? = null,
)

@Serializable
data class NewDmMessage(
    @SerialName("thread_id") val threadId: String,
    @SerialName("author_id") val authorId: String,
    val content: String,
    @SerialName("attachment_url") val attachmentUrl: String? = null,
    @SerialName("attachment_type") val attachmentType: String? = null,
    @SerialName("attachment_key") val attachmentKey: String? = null,
    /** Name and size of the first attachment, so a client that reads only
     *  the legacy columns still shows a proper file card. */
    @SerialName("attachment_name") val attachmentName: String? = null,
    @SerialName("attachment_size") val attachmentSize: Int? = null,
    /** Every attachment. Null for a single-attachment send, so the column
     *  is left alone and behaves exactly as it did before. */
    val attachments: List<StoredAttachment>? = null,
    @SerialName("reply_to_id") val replyToId: String? = null,
)

@Serializable
data class NewGroupMessage(
    @SerialName("group_id") val groupId: String,
    @SerialName("author_id") val authorId: String,
    val content: String,
    @SerialName("attachment_url") val attachmentUrl: String? = null,
    @SerialName("attachment_type") val attachmentType: String? = null,
    @SerialName("attachment_key") val attachmentKey: String? = null,
    /** Name and size of the first attachment, so a client that reads only
     *  the legacy columns still shows a proper file card. */
    @SerialName("attachment_name") val attachmentName: String? = null,
    @SerialName("attachment_size") val attachmentSize: Int? = null,
    /** Every attachment. Null for a single-attachment send, so the column
     *  is left alone and behaves exactly as it did before. */
    val attachments: List<StoredAttachment>? = null,
    @SerialName("reply_to_id") val replyToId: String? = null,
)

@Serializable
data class NewFriendship(
    @SerialName("requester_id") val requesterId: String,
    @SerialName("addressee_id") val addresseeId: String,
)

@Serializable
data class NewReaction(
    @SerialName("context_type") val contextType: String,
    @SerialName("message_id") val messageId: String,
    @SerialName("user_id") val userId: String,
    val emoji: String,
)

@Serializable
data class VoiceJoin(
    @SerialName("channel_id") val channelId: String,
    @SerialName("user_id") val userId: String,
)

@Serializable
data class ProfilePatch(
    @SerialName("display_name") var displayName: String? = null,
    var bio: String? = null,
    var pronouns: String? = null,
    @SerialName("status_note") var statusNote: String? = null,
    @SerialName("status_expires_at") var statusExpiresAt: String? = null,
    @SerialName("avatar_url") var avatarUrl: String? = null,
    @SerialName("banner_url") var bannerUrl: String? = null,
    @SerialName("accent_color") var accentColor: String? = null,
    @SerialName("accent_color_2") var accentColor2: String? = null,
    @SerialName("sound_enabled") var soundEnabled: Boolean? = null,
    @SerialName("desktop_notifications_enabled") var desktopNotificationsEnabled: Boolean? = null,
    @SerialName("link_previews_enabled") var linkPreviewsEnabled: Boolean? = null,
)

@Serializable
data class NewNote(
    @SerialName("user_id") val userId: String,
    val content: String,
    @SerialName("attachment_url") val attachmentUrl: String? = null,
    @SerialName("attachment_type") val attachmentType: String? = null,
    @SerialName("attachment_name") val attachmentName: String? = null,
)

/** A media attachment to send with a message. */
/** Just the id, for an insert that returns the row it wrote. */
@Serializable
data class InsertedId(val id: String)

data class OutgoingAttachment(
    val url: String,
    val type: String,
    val key: String?,
)

/** Result of uploading media. */
data class MediaUploadResult(
    val url: String,
    val key: String?,
)