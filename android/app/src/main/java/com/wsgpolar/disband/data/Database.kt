package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Thin suspend wrapper around the Supabase REST (PostgREST) API, mirroring the
 * iOS `DatabaseService`. RLS on the backend enforces access.
 */
object Database {
    val client get() = DisbandSupabase.client
    private val postgrest get() = DisbandSupabase.postgrest
    private fun columns(spec: String) = Columns.raw(spec)

    private val authorEmbed = "*, author:profiles(*)"

    // MARK: - Servers

    suspend fun myServers(currentUserId: String): List<Server> {
        val ids = client.from("server_members")
            .select(columns("server_id")) { filter { eq("user_id", currentUserId) } }
            .decodeList<ServerIdRow>()
            .map { it.serverId }
        if (ids.isEmpty()) return emptyList()
        return client.from("servers")
            .select(Columns.ALL) {
                filter { isIn("id", ids) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList()
    }

    suspend fun channels(serverId: String): List<Channel> {
        return client.from("channels")
            .select(Columns.ALL) {
                filter { eq("server_id", serverId) }
                order("position", Order.ASCENDING)
            }
            .decodeList()
    }

    suspend fun categories(serverId: String): List<ChannelCategory> {
        return client.from("channel_categories")
            .select(Columns.ALL) {
                filter { eq("server_id", serverId) }
                order("position", Order.ASCENDING)
            }
            .decodeList()
    }

    suspend fun members(serverId: String): List<ServerMember> {
        return client.from("server_members")
            .select(columns("*, profile:profiles(*)")) {
                filter { eq("server_id", serverId) }
            }
            .decodeList()
    }

    suspend fun createServer(name: String): String {
        return postgrest.rpc("create_server", buildJsonObject { put("p_name", name) }).data
    }

    @Serializable
    data class InvitePreview(
        val id: String,
        val name: String,
        val description: String? = null,
        @SerialName("icon_url") val iconUrl: String? = null,
        @SerialName("banner_url") val bannerUrl: String? = null,
        @SerialName("invite_code") val inviteCode: String? = null,
        @SerialName("member_count") val memberCount: Int = 0,
    )

    suspend fun serverByInvite(code: String): InvitePreview? {
        return postgrest.rpc("get_server_by_invite", buildJsonObject { put("p_code", code) })
            .decodeList<InvitePreview>()
            .firstOrNull()
    }

    suspend fun joinServer(invite: String) {
        postgrest.rpc("join_server_by_invite", buildJsonObject { put("p_code", invite) })
    }

    suspend fun leaveServer(serverId: String, userId: String) {
        client.from("server_members").delete {
            filter {
                eq("server_id", serverId)
                eq("user_id", userId)
            }
        }
    }

    suspend fun updateServer(serverId: String, name: String? = null, description: String? = null,
                             iconUrl: String? = null, bannerUrl: String? = null) {
        client.from("servers").update({
            name?.let { set("name", it) }
            description?.let { set("description", it) }
            iconUrl?.let { set("icon_url", it) }
            bannerUrl?.let { set("banner_url", it) }
        }) {
            filter { eq("id", serverId) }
        }
    }

    suspend fun kickMember(serverId: String, userId: String) {
        postgrest.rpc(
            "kick_server_member",
            buildJsonObject {
                put("p_server_id", serverId)
                put("p_user_id", userId)
            },
        )
    }

    // MARK: - Channel messages

    suspend fun messages(channelId: String, limit: Int = 50): List<Message> {
        val rows = client.from("messages")
            .select(columns(authorEmbed)) {
                filter { eq("channel_id", channelId) }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }
            .decodeList<Message>()
        return rows.reversed()
    }

    suspend fun sendMessage(channelId: String, authorId: String, content: String,
                            attachment: OutgoingAttachment? = null, replyToId: String? = null) {
        val payload = NewMessage(
            channelId = channelId,
            authorId = authorId,
            content = content,
            attachmentUrl = attachment?.url,
            attachmentType = attachment?.type,
            attachmentKey = attachment?.key,
            replyToId = replyToId,
        )
        client.from("messages").insert(payload)
    }

    suspend fun messageById(id: String): Message {
        return client.from("messages")
            .select(columns(authorEmbed)) {
                filter { eq("id", id) }
                single()
            }
            .decodeAs<Message>()
    }

    suspend fun deleteChannelMessage(id: String) {
        client.from("messages").delete { filter { eq("id", id) } }
    }

    suspend fun deleteDmMessage(id: String) {
        client.from("dm_messages").delete { filter { eq("id", id) } }
    }

    suspend fun deleteGroupMessage(id: String) {
        client.from("group_messages").delete { filter { eq("id", id) } }
    }

    // MARK: - Direct messages

    suspend fun myDmThreads(currentUserId: String): List<DmThread> {
        val a = client.from("dm_threads")
            .select(columns("user_a,user_b,id,created_at")) {
                filter { eq("user_a", currentUserId) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList<DmThread>()
        val b = client.from("dm_threads")
            .select(columns("user_a,user_b,id,created_at")) {
                filter { eq("user_b", currentUserId) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList<DmThread>()
        val threads = (a + b).distinctBy { it.id }

        val friendIds = threads.map {
            if (it.userA == currentUserId) it.userB else it.userA
        }
        val profiles: Map<String, Profile> = profiles(ids = friendIds)
        val latest: Map<String, DmMessage> = latestDmMessages(threadIds = threads.map { it.id })

        return threads.map { thread ->
            val friendId = if (thread.userA == currentUserId) thread.userB else thread.userA
            thread.copy(
                friend = profiles[friendId],
                lastMessageAt = latest[thread.id]?.createdAt,
                lastMessagePreview = latest[thread.id]?.let { previewText(it) },
            )
        }
            // Most recent conversation first. The queries above order by when
            // the *thread* was created, which put the oldest friendship at the
            // top and left a reply from a minute ago somewhere down the list.
            // Timestamps are ISO-8601 UTC from Postgres, so they sort lexically.
            .sortedByDescending { it.lastMessageAt ?: it.createdAt ?: "" }
    }

    fun previewText(msg: DmMessage): String {
        if (msg.content.isNotEmpty()) return msg.content
        return when (msg.attachmentType) {
            AttachmentType.Image, AttachmentType.Gif -> "Photo"
            AttachmentType.Video -> "Video"
            else -> "Attachment"
        }
    }

    suspend fun latestDmMessages(threadIds: List<String>): Map<String, DmMessage> {
        if (threadIds.isEmpty()) return emptyMap()
        val rows = client.from("dm_messages")
            .select(columns("id,thread_id,author_id,content,attachment_url,attachment_type,created_at")) {
                filter { isIn("thread_id", threadIds) }
                order("created_at", Order.DESCENDING)
                limit(400L)
            }
            .decodeList<DmMessage>()
        val newest = linkedMapOf<String, DmMessage>()
        for (row in rows) {
            if (newest[row.threadId] == null) newest[row.threadId] = row
        }
        return newest
    }

    suspend fun getOrCreateDmThread(friendId: String): String {
        return postgrest.rpc("get_or_create_dm_thread", buildJsonObject { put("p_friend_id", friendId) }).data
    }

    // MARK: - Unread / read state

    @Serializable
    data class DmUnreadRow(
        @SerialName("thread_id") val threadId: String,
        @SerialName("unread_count") val unreadCount: Int,
        @SerialName("last_read_at") val lastReadAt: String? = null,
    )

    @Serializable
    data class GroupUnreadRow(
        @SerialName("group_id") val groupId: String,
        @SerialName("unread_count") val unreadCount: Int,
        @SerialName("last_read_at") val lastReadAt: String? = null,
    )

    suspend fun unreadDmCounts(): List<DmUnreadRow> {
        return postgrest.rpc("get_dm_unread").decodeList()
    }

    suspend fun unreadGroupCounts(): List<GroupUnreadRow> {
        return postgrest.rpc("get_group_unread").decodeList()
    }

    suspend fun markDmRead(threadId: String) {
        postgrest.rpc("mark_dm_read", buildJsonObject { put("p_thread_id", threadId) })
    }

    suspend fun markGroupRead(groupId: String) {
        postgrest.rpc("mark_group_read", buildJsonObject { put("p_group_id", groupId) })
    }

    suspend fun dmMessages(threadId: String, limit: Int = 50): List<DmMessage> {
        val rows = client.from("dm_messages")
            .select(columns(authorEmbed)) {
                filter { eq("thread_id", threadId) }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }
            .decodeList<DmMessage>()
        return rows.reversed()
    }

    suspend fun sendDmMessage(threadId: String, authorId: String, content: String,
                              attachment: OutgoingAttachment? = null, replyToId: String? = null) {
        val payload = NewDmMessage(
            threadId = threadId,
            authorId = authorId,
            content = content,
            attachmentUrl = attachment?.url,
            attachmentType = attachment?.type,
            attachmentKey = attachment?.key,
            replyToId = replyToId,
        )
        client.from("dm_messages").insert(payload)
    }

    // MARK: - Group chats

    suspend fun myGroups(currentUserId: String): List<GroupChat> {
        val ids = client.from("group_chat_members")
            .select(columns("group_id")) { filter { eq("user_id", currentUserId) } }
            .decodeList<GroupIdRow>()
            .map { it.groupId }
        if (ids.isEmpty()) return emptyList()
        return client.from("group_chats")
            .select(Columns.ALL) {
                filter { isIn("id", ids) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList()
    }

    suspend fun groupMessages(groupId: String, limit: Int = 50): List<GroupMessage> {
        val rows = client.from("group_messages")
            .select(columns(authorEmbed)) {
                filter { eq("group_id", groupId) }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }
            .decodeList<GroupMessage>()
        return rows.reversed()
    }

    suspend fun sendGroupMessage(groupId: String, authorId: String, content: String,
                                 attachment: OutgoingAttachment? = null, replyToId: String? = null) {
        val payload = NewGroupMessage(
            groupId = groupId,
            authorId = authorId,
            content = content,
            attachmentUrl = attachment?.url,
            attachmentType = attachment?.type,
            attachmentKey = attachment?.key,
            replyToId = replyToId,
        )
        client.from("group_messages").insert(payload)
    }

    suspend fun leaveGroup(groupId: String) {
        postgrest.rpc("leave_group_chat", buildJsonObject { put("p_group_id", groupId) })
    }

    // MARK: - Profiles & friends

    suspend fun profile(id: String): Profile {
        return client.from("profiles")
            .select(Columns.ALL) {
                filter { eq("id", id) }
                single()
            }
            // decodeAs, not decodeSingle: `single()` asks PostgREST for one
            // object, so the body is `{...}` — decodeSingle expects an array
            // and takes its first element, which threw on every read. Loading
            // your own profile has never worked.
            .decodeAs<Profile>()
    }

    suspend fun profiles(ids: List<String>): Map<String, Profile> {
        val unique = ids.distinct()
        if (unique.isEmpty()) return emptyMap()
        val rows: List<Profile> = client.from("profiles")
            .select(Columns.ALL) { filter { isIn("id", unique) } }
            .decodeList()
        return rows.associateBy { it.id }
    }

    suspend fun searchProfiles(query: String): List<Profile> {
        if (query.isBlank()) return emptyList()
        return client.from("profiles")
            .select(Columns.ALL) {
                filter { ilike("username", "%$query%") }
                limit(20)
            }
            .decodeList()
    }

    suspend fun friendships(currentUserId: String): List<Friendship> {
        val embed =
            "*, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)"
        val asRequester = client.from("friendships")
            .select(columns(embed)) { filter { eq("requester_id", currentUserId) } }
            .decodeList<Friendship>()
        val asAddressee = client.from("friendships")
            .select(columns(embed)) { filter { eq("addressee_id", currentUserId) } }
            .decodeList<Friendship>()
        return (asRequester + asAddressee).distinctBy { it.id }
    }

    suspend fun sendFriendRequest(requesterId: String, addresseeId: String) {
        client.from("friendships").insert(NewFriendship(requesterId, addresseeId))
    }

    suspend fun respondToFriendRequest(id: String, accept: Boolean) {
        if (accept) {
            client.from("friendships").update({ set("status", "accepted") }) { filter { eq("id", id) } }
        } else {
            client.from("friendships").delete { filter { eq("id", id) } }
        }
    }

    suspend fun removeFriend(currentUserId: String, otherUserId: String) {
        client.from("friendships").delete {
            filter {
                eq("requester_id", currentUserId)
                eq("addressee_id", otherUserId)
            }
        }
        client.from("friendships").delete {
            filter {
                eq("requester_id", otherUserId)
                eq("addressee_id", currentUserId)
            }
        }
    }

    suspend fun blockUser(userId: String) {
        postgrest.rpc("block_user", buildJsonObject { put("p_user_id", userId) })
    }

    suspend fun unblockUser(userId: String) {
        postgrest.rpc("unblock_user", buildJsonObject { put("p_user_id", userId) })
    }

    // MARK: - Profile & settings updates

    suspend fun updateProfile(userId: String, patch: ProfilePatch) {
        client.from("profiles").update({
            patch.displayName?.let { set("display_name", it) }
            patch.bio?.let { set("bio", it) }
            patch.avatarUrl?.let { set("avatar_url", it) }
            patch.bannerUrl?.let { set("banner_url", it) }
            patch.accentColor?.let { set("accent_color", it) }
            patch.accentColor2?.let { set("accent_color_2", it) }
            patch.soundEnabled?.let { set("sound_enabled", it) }
            patch.desktopNotificationsEnabled?.let { set("desktop_notifications_enabled", it) }
            patch.linkPreviewsEnabled?.let { set("link_previews_enabled", it) }
        }) {
            filter { eq("id", userId) }
        }
    }

    suspend fun updateTheme(theme: String, userId: String) {
        client.from("profiles").update({ set("theme", theme) }) { filter { eq("id", userId) } }
    }

    suspend fun updateUsername(username: String) {
        postgrest.rpc(
            "complete_signup_profile",
            buildJsonObject {
                put("p_username", username)
                put("p_display_name", null as String?)
            },
        )
    }

    /** Register this FCM/APNs token with the backend (one row per user+token). */
    suspend fun registerDeviceToken(token: String, platform: String = "android") {
        postgrest.rpc(
            "register_device_token",
            buildJsonObject {
                put("p_token", token)
                put("p_platform", platform)
            },
        )
    }

    @Serializable
    data class UsernameCheckResult(val available: Boolean, val reason: String? = null)

    suspend fun usernameUnavailableReason(username: String): String? {
        if (username.isBlank()) return null
        return try {
            val result = postgrest.rpc(
                "check_username_available",
                buildJsonObject { put("p_username", username) },
            ).decodeSingle<UsernameCheckResult>()
            if (result.available) null else result.reason ?: "That username is taken."
        } catch (e: Exception) {
            null
        }
    }

    // MARK: - Voice presence

    suspend fun voiceParticipants(channelId: String): List<VoiceParticipant> {
        return client.from("voice_presence")
            .select(columns("*, profile:profiles(*)")) { filter { eq("channel_id", channelId) } }
            .decodeList()
    }

    suspend fun joinVoice(channelId: String, userId: String) {
        client.from("voice_presence").upsert(VoiceJoin(channelId, userId))
    }

    suspend fun leaveVoice(channelId: String, userId: String) {
        client.from("voice_presence").delete {
            filter {
                eq("channel_id", channelId)
                eq("user_id", userId)
            }
        }
    }

    // MARK: - Reactions

    suspend fun reactions(context: String, messageIds: List<String>): List<MessageReaction> {
        if (messageIds.isEmpty()) return emptyList()
        return client.from("message_reactions")
            .select(Columns.ALL) {
                filter {
                    eq("context_type", context)
                    isIn("message_id", messageIds)
                }
            }
            .decodeList()
    }

    suspend fun toggleReaction(context: String, messageId: String, userId: String,
                               emoji: String, currentlyReacted: Boolean) {
        if (currentlyReacted) {
            client.from("message_reactions").delete {
                filter {
                    eq("context_type", context)
                    eq("message_id", messageId)
                    eq("user_id", userId)
                    eq("emoji", emoji)
                }
            }
        } else {
            client.from("message_reactions")
                .insert(NewReaction(contextType = context, messageId = messageId, userId = userId, emoji = emoji))
        }
    }

    // MARK: - Notifications

    suspend fun notifications(currentUserId: String): List<AppNotification> {
        return client.from("notifications")
            .select(Columns.ALL) {
                filter { eq("user_id", currentUserId) }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }

    // MARK: - Notes

    suspend fun fetchNotes(userId: String, limit: Int = 50, before: String? = null): List<Note> {
        return client.from("notes")
            .select(Columns.ALL) {
                filter {
                    eq("user_id", userId)
                    if (before != null) lt("created_at", before)
                }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }
            .decodeList()
    }

    suspend fun insertNote(userId: String, content: String, attachment: OutgoingAttachment? = null): Note? {
        val payload = NewNote(
            userId = userId,
            content = content,
            attachmentUrl = attachment?.url,
            attachmentType = attachment?.type,
            attachmentName = null,
        )
        return client.from("notes").insert(payload) { select() }
            .decodeSingleOrNull<Note>()
    }

    suspend fun updateNoteContent(noteId: String, content: String, editedAt: String) {
        client.from("notes").update({ set("content", content); set("edited_at", editedAt) }) {
            filter { eq("id", noteId) }
        }
    }

    suspend fun setNotePinned(noteId: String, pinned: Boolean) {
        client.from("notes").update({ set("pinned", pinned) }) { filter { eq("id", noteId) } }
    }

    suspend fun deleteNote(noteId: String) {
        client.from("notes").delete { filter { eq("id", noteId) } }
    }
}

// MARK: - Private row helpers

@Serializable
private data class ServerIdRow(
    @SerialName("server_id") val serverId: String,
)

@Serializable
private data class GroupIdRow(
    @SerialName("group_id") val groupId: String,
)