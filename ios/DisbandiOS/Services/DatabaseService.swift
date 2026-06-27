import Foundation
import Supabase

/// Thin async wrapper around the Supabase REST (PostgREST) API. Mirrors the
/// queries used by the web app's AppContext. RLS on the backend enforces access.
enum DatabaseService {
    private static var client: SupabaseClient { SupabaseManager.client }

    private static let authorEmbed = "*, author:profiles(*)"

    // MARK: - Servers

    static func myServers() async throws -> [Server] {
        let memberships: [ServerIdRow] = try await client
            .from("server_members")
            .select("server_id")
            .execute().value
        let ids = memberships.map(\.serverId)
        guard !ids.isEmpty else { return [] }
        return try await client
            .from("servers")
            .select("*")
            .in("id", values: ids)
            .order("created_at")
            .execute().value
    }

    static func channels(serverId: String) async throws -> [Channel] {
        try await client
            .from("channels")
            .select("*")
            .eq("server_id", value: serverId)
            .order("position")
            .execute().value
    }

    static func categories(serverId: String) async throws -> [ChannelCategory] {
        try await client
            .from("channel_categories")
            .select("*")
            .eq("server_id", value: serverId)
            .order("position")
            .execute().value
    }

    static func members(serverId: String) async throws -> [ServerMember] {
        let rows: [ServerMember] = try await client
            .from("server_members")
            .select("*, profile:profiles(*)")
            .eq("server_id", value: serverId)
            .execute().value
        return rows
    }

    @discardableResult
    static func createServer(name: String) async throws -> String {
        try await client.rpc("create_server", params: ["p_name": name])
            .execute().value
    }

    @discardableResult
    static func joinServer(invite: String) async throws -> String {
        try await client.rpc("join_server_by_invite", params: ["p_code": invite])
            .execute().value
    }

    static func leaveServer(serverId: String, userId: String) async throws {
        try await client.from("server_members").delete()
            .eq("server_id", value: serverId)
            .eq("user_id", value: userId)
            .execute()
    }

    static func updateServer(serverId: String, name: String?, description: String?,
                             iconUrl: String?) async throws {
        var patch: [String: String] = [:]
        if let name { patch["name"] = name }
        if let description { patch["description"] = description }
        if let iconUrl { patch["icon_url"] = iconUrl }
        guard !patch.isEmpty else { return }
        try await client.from("servers").update(patch).eq("id", value: serverId).execute()
    }

    static func kickMember(serverId: String, userId: String) async throws {
        try await client.rpc("kick_server_member",
                             params: ["p_server_id": serverId, "p_user_id": userId]).execute()
    }

    // MARK: - Channel messages

    static func messages(channelId: String, limit: Int = 50) async throws -> [Message] {
        let rows: [Message] = try await client
            .from("messages")
            .select(authorEmbed)
            .eq("channel_id", value: channelId)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute().value
        return rows.reversed()
    }

    static func sendMessage(channelId: String, authorId: String, content: String,
                            attachment: OutgoingAttachment? = nil,
                            replyToId: String? = nil) async throws {
        let payload = NewMessage(channelId: channelId, authorId: authorId, content: content,
                                 attachmentUrl: attachment?.url, attachmentType: attachment?.type,
                                 attachmentKey: attachment?.key, replyToId: replyToId)
        try await client.from("messages").insert(payload).execute()
    }

    static func message(byId id: String) async throws -> Message {
        try await client.from("messages").select(authorEmbed)
            .eq("id", value: id).single().execute().value
    }

    static func deleteChannelMessage(id: String) async throws {
        try await client.from("messages").delete().eq("id", value: id).execute()
    }
    static func deleteDmMessage(id: String) async throws {
        try await client.from("dm_messages").delete().eq("id", value: id).execute()
    }
    static func deleteGroupMessage(id: String) async throws {
        try await client.from("group_messages").delete().eq("id", value: id).execute()
    }

    // MARK: - Direct messages

    static func myDmThreads(currentUserId: String) async throws -> [DmThread] {
        let threads: [DmThread] = try await client
            .from("dm_threads")
            .select("*")
            .or("user_a.eq.\(currentUserId),user_b.eq.\(currentUserId)")
            .execute().value

        // Hydrate the "other" participant for each thread.
        var hydrated: [DmThread] = []
        for var thread in threads {
            let friendId = thread.userA == currentUserId ? thread.userB : thread.userA
            thread.friend = try? await profile(id: friendId)
            hydrated.append(thread)
        }
        return hydrated
    }

    @discardableResult
    static func getOrCreateDmThread(friendId: String) async throws -> String {
        try await client.rpc("get_or_create_dm_thread", params: ["p_friend_id": friendId])
            .execute().value
    }

    static func dmMessages(threadId: String, limit: Int = 50) async throws -> [DmMessage] {
        let rows: [DmMessage] = try await client
            .from("dm_messages")
            .select(authorEmbed)
            .eq("thread_id", value: threadId)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute().value
        return rows.reversed()
    }

    static func sendDmMessage(threadId: String, authorId: String, content: String,
                              attachment: OutgoingAttachment? = nil,
                              replyToId: String? = nil) async throws {
        let payload = NewDmMessage(threadId: threadId, authorId: authorId, content: content,
                                   attachmentUrl: attachment?.url, attachmentType: attachment?.type,
                                   attachmentKey: attachment?.key, replyToId: replyToId)
        try await client.from("dm_messages").insert(payload).execute()
    }

    // MARK: - Group chats

    static func myGroups(currentUserId: String) async throws -> [GroupChat] {
        let rows: [GroupIdRow] = try await client
            .from("group_chat_members")
            .select("group_id")
            .eq("user_id", value: currentUserId)
            .execute().value
        let ids = rows.map(\.groupId)
        guard !ids.isEmpty else { return [] }
        return try await client
            .from("group_chats")
            .select("*")
            .in("id", values: ids)
            .order("created_at")
            .execute().value
    }

    static func groupMessages(groupId: String, limit: Int = 50) async throws -> [GroupMessage] {
        let rows: [GroupMessage] = try await client
            .from("group_messages")
            .select(authorEmbed)
            .eq("group_id", value: groupId)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute().value
        return rows.reversed()
    }

    static func sendGroupMessage(groupId: String, authorId: String, content: String,
                                 attachment: OutgoingAttachment? = nil,
                                 replyToId: String? = nil) async throws {
        let payload = NewGroupMessage(groupId: groupId, authorId: authorId, content: content,
                                      attachmentUrl: attachment?.url, attachmentType: attachment?.type,
                                      attachmentKey: attachment?.key, replyToId: replyToId)
        try await client.from("group_messages").insert(payload).execute()
    }

    // MARK: - Profiles & friends

    static func profile(id: String) async throws -> Profile {
        try await client.from("profiles").select("*").eq("id", value: id).single().execute().value
    }

    static func searchProfiles(query: String) async throws -> [Profile] {
        guard !query.isEmpty else { return [] }
        return try await client
            .from("profiles")
            .select("*")
            .ilike("username", pattern: "%\(query)%")
            .limit(20)
            .execute().value
    }

    static func friendships(currentUserId: String) async throws -> [Friendship] {
        try await client
            .from("friendships")
            .select("*, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)")
            .or("requester_id.eq.\(currentUserId),addressee_id.eq.\(currentUserId)")
            .execute().value
    }

    static func sendFriendRequest(from requesterId: String, to addresseeId: String) async throws {
        let payload = NewFriendship(requesterId: requesterId, addresseeId: addresseeId)
        try await client.from("friendships").insert(payload).execute()
    }

    static func respondToFriendRequest(id: String, accept: Bool) async throws {
        if accept {
            try await client.from("friendships")
                .update(["status": "accepted"]).eq("id", value: id).execute()
        } else {
            try await client.from("friendships").delete().eq("id", value: id).execute()
        }
    }

    /// Remove an existing friendship (unfriend), either direction.
    static func removeFriend(currentUserId: String, otherUserId: String) async throws {
        try await client.from("friendships").delete()
            .or("and(requester_id.eq.\(currentUserId),addressee_id.eq.\(otherUserId)),and(requester_id.eq.\(otherUserId),addressee_id.eq.\(currentUserId))")
            .execute()
    }

    static func blockUser(_ userId: String) async throws {
        try await client.rpc("block_user", params: ["p_user_id": userId]).execute()
    }

    static func unblockUser(_ userId: String) async throws {
        try await client.rpc("unblock_user", params: ["p_user_id": userId]).execute()
    }

    static func leaveGroup(groupId: String) async throws {
        try await client.rpc("leave_group_chat", params: ["p_group_id": groupId]).execute()
    }

    // MARK: - Profile & settings updates

    struct ProfilePatch: Encodable {
        var displayName: String? = nil
        var bio: String? = nil
        var avatarUrl: String? = nil
        var bannerUrl: String? = nil
        var accentColor: String? = nil
        var accentColor2: String? = nil
        var soundEnabled: Bool? = nil
        var desktopNotificationsEnabled: Bool? = nil
        var linkPreviewsEnabled: Bool? = nil

        enum CodingKeys: String, CodingKey {
            case bio
            case displayName = "display_name"
            case avatarUrl = "avatar_url"
            case bannerUrl = "banner_url"
            case accentColor = "accent_color"
            case accentColor2 = "accent_color_2"
            case soundEnabled = "sound_enabled"
            case desktopNotificationsEnabled = "desktop_notifications_enabled"
            case linkPreviewsEnabled = "link_previews_enabled"
        }
    }

    static func updateProfile(userId: String, patch: ProfilePatch) async throws {
        try await client.from("profiles").update(patch).eq("id", value: userId).execute()
    }

    // MARK: - Voice presence

    static func voiceParticipants(channelId: String) async throws -> [VoiceParticipant] {
        try await client.from("voice_presence")
            .select("*, profile:profiles(*)")
            .eq("channel_id", value: channelId)
            .execute().value
    }

    static func joinVoice(channelId: String, userId: String) async throws {
        let payload = VoiceJoin(channelId: channelId, userId: userId)
        try await client.from("voice_presence").upsert(payload).execute()
    }

    static func leaveVoice(channelId: String, userId: String) async throws {
        try await client.from("voice_presence").delete()
            .eq("channel_id", value: channelId)
            .eq("user_id", value: userId)
            .execute()
    }

    // MARK: - Reactions

    static func reactions(context: String, messageIds: [String]) async throws -> [MessageReaction] {
        guard !messageIds.isEmpty else { return [] }
        return try await client
            .from("message_reactions")
            .select("*")
            .eq("context_type", value: context)
            .in("message_id", values: messageIds)
            .execute().value
    }

    static func toggleReaction(context: String, messageId: String, userId: String,
                               emoji: String, currentlyReacted: Bool) async throws {
        if currentlyReacted {
            try await client.from("message_reactions").delete()
                .eq("context_type", value: context)
                .eq("message_id", value: messageId)
                .eq("user_id", value: userId)
                .eq("emoji", value: emoji)
                .execute()
        } else {
            let payload = NewReaction(contextType: context, messageId: messageId,
                                      userId: userId, emoji: emoji)
            try await client.from("message_reactions").insert(payload).execute()
        }
    }

    // MARK: - Notifications

    static func notifications(currentUserId: String) async throws -> [AppNotification] {
        try await client
            .from("notifications")
            .select("*")
            .eq("user_id", value: currentUserId)
            .order("created_at", ascending: false)
            .limit(50)
            .execute().value
    }
}

// MARK: - Insert / helper payloads

private struct ServerIdRow: Decodable { let serverId: String
    enum CodingKeys: String, CodingKey { case serverId = "server_id" } }

private struct GroupIdRow: Decodable { let groupId: String
    enum CodingKeys: String, CodingKey { case groupId = "group_id" } }

/// A media attachment to send with a message.
struct OutgoingAttachment {
    let url: String
    let type: String   // "image" | "video" | "gif" | "file"
    let key: String?
}

struct NewMessage: Encodable {
    let channelId: String
    let authorId: String
    let content: String
    let attachmentUrl: String?
    let attachmentType: String?
    let attachmentKey: String?
    let replyToId: String?
    enum CodingKeys: String, CodingKey {
        case content
        case channelId = "channel_id"
        case authorId = "author_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case attachmentKey = "attachment_key"
        case replyToId = "reply_to_id"
    }
}

struct NewDmMessage: Encodable {
    let threadId: String
    let authorId: String
    let content: String
    let attachmentUrl: String?
    let attachmentType: String?
    let attachmentKey: String?
    let replyToId: String?
    enum CodingKeys: String, CodingKey {
        case content
        case threadId = "thread_id"
        case authorId = "author_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case attachmentKey = "attachment_key"
        case replyToId = "reply_to_id"
    }
}

struct NewGroupMessage: Encodable {
    let groupId: String
    let authorId: String
    let content: String
    let attachmentUrl: String?
    let attachmentType: String?
    let attachmentKey: String?
    let replyToId: String?
    enum CodingKeys: String, CodingKey {
        case content
        case groupId = "group_id"
        case authorId = "author_id"
        case attachmentUrl = "attachment_url"
        case attachmentType = "attachment_type"
        case attachmentKey = "attachment_key"
        case replyToId = "reply_to_id"
    }
}

struct VoiceJoin: Encodable {
    let channelId: String
    let userId: String
    enum CodingKeys: String, CodingKey {
        case channelId = "channel_id"
        case userId = "user_id"
    }
}

struct NewFriendship: Encodable {
    let requesterId: String
    let addresseeId: String
    enum CodingKeys: String, CodingKey {
        case requesterId = "requester_id"
        case addresseeId = "addressee_id"
    }
}

struct NewReaction: Encodable {
    let contextType: String
    let messageId: String
    let userId: String
    let emoji: String
    enum CodingKeys: String, CodingKey {
        case emoji
        case contextType = "context_type"
        case messageId = "message_id"
        case userId = "user_id"
    }
}
