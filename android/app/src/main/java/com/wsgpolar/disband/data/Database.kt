package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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
            .distinct()
        if (ids.isEmpty()) return emptyList()
        // Named columns, not `*`: the row also holds the space's webhook key,
        // which the app has no use for and shouldn't be carrying around.
        return client.from("servers")
            .select(columns("id, name, icon_url, banner_url, description, owner_id, invite_code, vanity_code, created_at, verified, partner")) {
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
        // Embedded profiles via the get_server_members RPC: one tiny URL per
        // server no matter its size. The old "fetch ids then profiles(ids)"
        // path built a `profiles?select=*&id=in.(...)` URL past the proxy
        // limit on big servers and 400'd, so this never fetches by id.
        return postgrest.rpc("get_server_members", buildJsonObject { put("p_server_id", serverId) })
            .decodeList<ServerMember>()
    }

    /** The new space's id. `.data` was the raw body, a uuid still wrapped in JSON quotes. */
    suspend fun createServer(name: String): String {
        return postgrest.rpc("create_server", buildJsonObject { put("p_name", name) }).decodeAs<String>()
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

    /** Joins through an invite code and returns the space's id. */
    suspend fun joinServer(invite: String): String {
        return postgrest.rpc("join_server_by_invite", buildJsonObject { put("p_code", invite) })
            .decodeAs<String>()
    }

    // MARK: - Discovery

    /** A public space from `list_discoverable_servers`, the shape the web and iOS read. */
    @Serializable
    data class DiscoverableServer(
        val id: String,
        val name: String,
        @SerialName("icon_url") val iconUrl: String? = null,
        @SerialName("banner_url") val bannerUrl: String? = null,
        val description: String? = null,
        @SerialName("owner_id") val ownerId: String,
        @SerialName("owner_name") val ownerName: String? = null,
        @SerialName("member_count") val memberCount: Int = 0,
        @SerialName("created_at") val createdAt: String? = null,
        val verified: Boolean? = null,
        val partner: Boolean? = null,
    )

    suspend fun discoverableServers(): List<DiscoverableServer> {
        return postgrest.rpc("list_discoverable_servers").decodeList()
    }

    /** Join a discoverable space directly; the RPC refuses any other kind. */
    suspend fun joinServerById(serverId: String) {
        postgrest.rpc("join_server_by_id", buildJsonObject { put("p_server_id", serverId) })
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

    suspend fun messages(channelId: String, limit: Int = 50, before: String? = null): List<Message> {
        val rows = client.from("messages")
            .select(columns(authorEmbed)) {
                filter {
                    eq("channel_id", channelId)
                    before?.let { lt("created_at", it) }
                }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }
            .decodeList<Message>()
        return rows.reversed()
    }

    suspend fun sendMessage(channelId: String, authorId: String, content: String,
                            attachment: OutgoingAttachment? = null, replyToId: String? = null): String? {
        val payload = NewMessage(
            channelId = channelId,
            authorId = authorId,
            content = content,
            attachmentUrl = attachment?.url,
            attachmentType = attachment?.type,
            attachmentKey = attachment?.key,
            replyToId = replyToId,
        )
        // The row id comes back so callers can fire follow-ups — a Tether
        // ask has to name the exact message that was saved.
        return client.from("messages").insert(payload) { select() }
            .decodeSingleOrNull<InsertedId>()?.id
    }

    /**
     * Send one message carrying several attachments.
     *
     * The array goes in `attachments` AND the first one is mirrored into the
     * legacy `attachment_*` columns. The mirror is not redundant: older
     * clients read only those, so without it a five-image message arrives as
     * an empty bubble on anything not yet updated. The web writes the same
     * pair for the same reason (`legacyColumns` in message-attachments.ts).
     */
    suspend fun sendWithAttachments(
        context: String,
        parentId: String,
        authorId: String,
        content: String,
        attachments: List<StoredAttachment>,
        replyToId: String? = null,
    ): String? {
        val first = attachments.firstOrNull()
        val response = when (context) {
            "channel" -> client.from("messages").insert(
                NewMessage(
                    channelId = parentId, authorId = authorId, content = content,
                    attachmentUrl = first?.url, attachmentType = first?.type,
                    attachmentKey = first?.key, attachmentName = first?.name,
                    attachmentSize = first?.size, attachments = attachments,
                    replyToId = replyToId,
                )
            ) { select() }
            "dm" -> client.from("dm_messages").insert(
                NewDmMessage(
                    threadId = parentId, authorId = authorId, content = content,
                    attachmentUrl = first?.url, attachmentType = first?.type,
                    attachmentKey = first?.key, attachmentName = first?.name,
                    attachmentSize = first?.size, attachments = attachments,
                    replyToId = replyToId,
                )
            ) { select() }
            else -> client.from("group_messages").insert(
                NewGroupMessage(
                    groupId = parentId, authorId = authorId, content = content,
                    attachmentUrl = first?.url, attachmentType = first?.type,
                    attachmentKey = first?.key, attachmentName = first?.name,
                    attachmentSize = first?.size, attachments = attachments,
                    replyToId = replyToId,
                )
            ) { select() }
        }
        return response.decodeSingleOrNull<InsertedId>()?.id
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

    suspend fun editChannelMessage(id: String, content: String) {
        client.from("messages").update({
            set("content", content)
            set("edited_at", java.time.OffsetDateTime.now().toString())
        }) { filter { eq("id", id) } }
    }

    suspend fun deleteDmMessage(id: String) {
        client.from("dm_messages").delete { filter { eq("id", id) } }
    }

    suspend fun editDmMessage(id: String, content: String) {
        client.from("dm_messages").update({
            set("content", content)
            set("edited_at", java.time.OffsetDateTime.now().toString())
        }) { filter { eq("id", id) } }
    }

    suspend fun deleteGroupMessage(id: String) {
        client.from("group_messages").delete { filter { eq("id", id) } }
    }

    suspend fun editGroupMessage(id: String, content: String) {
        client.from("group_messages").update({
            set("content", content)
            set("edited_at", java.time.OffsetDateTime.now().toString())
        }) { filter { eq("id", id) } }
    }

    // MARK: - Direct messages

    suspend fun myDmThreads(currentUserId: String): List<DmThread> {
        val a = client.from("dm_threads")
            .select(columns("user_a,user_b,id,created_at,last_message_at,last_message_preview")) {
                filter { eq("user_a", currentUserId) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList<DmThread>()
        val b = client.from("dm_threads")
            .select(columns("user_a,user_b,id,created_at,last_message_at,last_message_preview")) {
                filter { eq("user_b", currentUserId) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList<DmThread>()
        val threads = (a + b).distinctBy { it.id }

        val friendIds = threads.map {
            if (it.userA == currentUserId) it.userB else it.userA
        }
        val profiles: Map<String, Profile> = profiles(ids = friendIds)

        // The newest message per thread is kept on dm_threads by a trigger.
        // Fetching it by listing every thread id in one URL passed the 8,000
        // character limit for accounts with ~200 DMs, and the whole inbox
        // failed to load with "Couldn't refresh conversations".
        return threads.map { thread ->
            val friendId = if (thread.userA == currentUserId) thread.userB else thread.userA
            thread.copy(friend = profiles[friendId])
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

    suspend fun getOrCreateDmThread(friendId: String): String {
        // `.data` is the raw JSON body, so a scalar UUID arrives wrapped in
        // quotes. decodeAs<String>() unwraps it; the quoted value never
        // matched a dmThreads id and Friends → Message showed "This
        // conversation couldn't be opened."
        return postgrest.rpc("get_or_create_dm_thread", buildJsonObject { put("p_friend_id", friendId) })
            .decodeAs<String>()
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

    suspend fun dmMessages(threadId: String, limit: Int = 50, before: String? = null): List<DmMessage> {
        val rows = client.from("dm_messages")
            .select(columns(authorEmbed)) {
                filter {
                    eq("thread_id", threadId)
                    before?.let { lt("created_at", it) }
                }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }
            .decodeList<DmMessage>()
        return rows.reversed()
    }

    suspend fun sendDmMessage(threadId: String, authorId: String, content: String,
                              attachment: OutgoingAttachment? = null, replyToId: String? = null): String? {
        val payload = NewDmMessage(
            threadId = threadId,
            authorId = authorId,
            content = content,
            attachmentUrl = attachment?.url,
            attachmentType = attachment?.type,
            attachmentKey = attachment?.key,
            replyToId = replyToId,
        )
        // The row id comes back so callers can fire follow-ups — a Tether
        // ask has to name the exact message that was saved.
        return client.from("dm_messages").insert(payload) { select() }
            .decodeSingleOrNull<InsertedId>()?.id
    }

    // MARK: - Group chats

    suspend fun myGroups(currentUserId: String): List<GroupChat> {
        val ids = client.from("group_chat_members")
            .select(columns("group_id")) { filter { eq("user_id", currentUserId) } }
            .decodeList<GroupIdRow>()
            .map { it.groupId }
        if (ids.isEmpty()) return emptyList()
        val groups: List<GroupChat> = client.from("group_chats")
            .select(Columns.ALL) {
                filter { isIn("id", ids) }
                order("created_at", Order.ASCENDING)
            }
            .decodeList()

        // `group_chats` has no members column, so `members` was always nil:
        // every group read "0 members" (and the group-call roster was empty).
        // One embedded-profile query for every group, same as iOS.
        val members = runCatching {
            client.from("group_chat_members")
                .select(columns("group_id, profile:profiles(*)")) {
                    filter { isIn("group_id", ids) }
                }
                .decodeList<GroupMemberRow>()
        }.getOrDefault(emptyList())
        val byGroup = members
            .mapNotNull { row -> row.profile?.let { row.groupId to it } }
            .groupBy({ it.first }, { it.second })
        return groups.map { group ->
            group.copy(members = byGroup[group.id] ?: emptyList())
        }
    }

    suspend fun groupMessages(groupId: String, limit: Int = 50, before: String? = null): List<GroupMessage> {
        val rows = client.from("group_messages")
            .select(columns(authorEmbed)) {
                filter {
                    eq("group_id", groupId)
                    before?.let { lt("created_at", it) }
                }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }
            .decodeList<GroupMessage>()
        return rows.reversed()
    }

    suspend fun sendGroupMessage(groupId: String, authorId: String, content: String,
                                 attachment: OutgoingAttachment? = null, replyToId: String? = null): String? {
        val payload = NewGroupMessage(
            groupId = groupId,
            authorId = authorId,
            content = content,
            attachmentUrl = attachment?.url,
            attachmentType = attachment?.type,
            attachmentKey = attachment?.key,
            replyToId = replyToId,
        )
        // The row id comes back so callers can fire follow-ups — a Tether
        // ask has to name the exact message that was saved.
        return client.from("group_messages").insert(payload) { select() }
            .decodeSingleOrNull<InsertedId>()?.id
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

    // Profiles are fetched in batches: every id lands in one `in(...)` filter,
    // so servers with a few hundred members build a URL past what the proxies
    // in front of PostgREST accept and the whole list 400s — emptying the
    // member list exactly where it is needed most. 100 ids stays near 4 KB.
    suspend fun profiles(ids: List<String>): Map<String, Profile> {
        val unique = ids.distinct()
        if (unique.isEmpty()) return emptyMap()
        val out = mutableMapOf<String, Profile>()
        coroutineScope {
            unique.chunked(100).map { chunk ->
                async {
                    val rows: List<Profile> = client.from("profiles")
                        .select(Columns.ALL) { filter { isIn("id", chunk) } }
                        .decodeList()
                    for (row in rows) out[row.id] = row
                }
            }.forEach { it.await() }
        }
        return out
    }

    /**
     * Finds the one account with exactly this username.
     *
     * Substring matching turned the add-friend box into a directory: typing
     * "a" listed twenty real people with their display names and avatars, so
     * anyone could enumerate the platform and add strangers by accident. A
     * username is something you are told, not something you browse for, so the
     * match is exact — case-insensitively, since it is typed by hand — and a
     * wildcard typed into the box is escaped rather than honoured.
     */
    suspend fun searchProfiles(query: String): List<Profile> {
        val trimmed = query.trim().trimStart('@')
        if (trimmed.isBlank()) return emptyList()

        // `%` and `_` are wildcards to ilike; a username containing one must
        // match itself, not everything.
        val escaped = trimmed
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")

        return client.from("profiles")
            .select(Columns.ALL) {
                filter { ilike("username", escaped) }
                limit(1)
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
            patch.pronouns?.let { set("pronouns", it) }
            patch.statusNote?.let { set("status_note", it) }
            patch.statusExpiresAt?.let { set("status_expires_at", it) }
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

    suspend fun clearStatus(userId: String) {
        client.from("profiles").update({
            set("status_note", null as String?)
            set("status_expires_at", null as String?)
        }) {
            filter { eq("id", userId) }
        }
    }

    @Serializable
    data class ReferralCodeRow(val code: String)

    suspend fun referralCode(userId: String): String? {
        return runCatching {
            client.from("referral_codes")
                .select(Columns.list("code")) {
                    filter { eq("user_id", userId) }
                    limit(1)
                }
                .decodeList<ReferralCodeRow>()
                .firstOrNull()?.code
        }.getOrNull()
    }

    suspend fun referralCount(userId: String): Int {
        return runCatching {
            client.from("referrals")
                .select(Columns.list("id")) {
                    filter {
                        eq("referrer_id", userId)
                        eq("status", "verified")
                    }
                }
                .decodeList<InsertedId>()
                .size
        }.getOrDefault(0)
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

    /** Remove this device's push token from the signed-in account. RLS scopes the delete to that user. */
    suspend fun unregisterDeviceToken(token: String, platform: String = "android") {
        client.from("device_tokens").delete {
            filter {
                eq("token", token)
                eq("platform", platform)
            }
        }
    }

    /** Register this FCM/APNs token with the backend (one row per user+token). */
    suspend fun registerDeviceToken(token: String, platform: String = "android") {
        postgrest.rpc(
            "register_device_token",
            buildJsonObject {
                put("p_token", token)
                put("p_platform", platform)
                // Two overloads exist (with and without p_app_version); sending
                // only the shared two arguments made PostgREST refuse with 300
                // and no Android device registered for push.
                put("p_app_version", com.wsgpolar.disband.BuildConfig.VERSION_NAME)
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

    /**
     * What kind of thing a push's `source` id refers to, and what is needed to
     * open it.
     *
     * The server works it out (`resolve_notification_source`, migration 0108)
     * rather than the client guessing, and it runs as the caller, so a source
     * this user cannot see comes back as "unknown" instead of confirming that
     * the row exists.
     */
    @Serializable
    data class ResolvedSource(
        val kind: String,
        val id: String? = null,
        val name: String? = null,
        @SerialName("server_id") val serverId: String? = null,
    )

    suspend fun resolveNotificationSource(id: String): ResolvedSource? = runCatching {
        postgrest.rpc("resolve_notification_source", buildJsonObject { put("p_id", id) })
            .decodeAs<ResolvedSource>()
    }.getOrNull()

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

    suspend fun markNotificationRead(id: String, currentUserId: String) {
        client.from("notifications").update({ set("read", true) }) {
            filter {
                eq("id", id)
                eq("user_id", currentUserId)
            }
        }
    }

    suspend fun markAllNotificationsRead(currentUserId: String) {
        client.from("notifications").update({ set("read", true) }) {
            filter { eq("user_id", currentUserId) }
        }
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
    // MARK: - Guild tags

    suspend fun guildTags(userIds: List<String>): List<ProfileGuildTagRow> {
        if (userIds.isEmpty()) return emptyList()
        val unique = userIds.distinct()
        val rows = mutableListOf<ProfileGuildTagRow>()
        unique.chunked(100).forEach { chunk ->
            rows += client.from("profile_guild_tags")
                .select(columns("user_id, server_id, tag, icon, color")) {
                    filter { isIn("user_id", chunk) }
                }
                .decodeList<ProfileGuildTagRow>()
        }
        return rows
    }

    suspend fun myGuildTagOptions(): List<GuildTagOption> {
        return postgrest.rpc("get_my_guild_tags").decodeList()
    }

    suspend fun equipGuildTag(serverId: String): GuildTag {
        return postgrest.rpc("equip_guild_tag", buildJsonObject { put("p_server_id", serverId) })
            .decodeAs<GuildTag>()
    }

    suspend fun clearGuildTag() {
        postgrest.rpc("clear_guild_tag")
    }

    suspend fun serverGuildTag(serverId: String): GuildTag? {
        return client.from("server_guild_tags")
            .select(columns("server_id, tag, icon, color, is_private")) {
                filter { eq("server_id", serverId) }
                limit(1)
            }
            .decodeList<GuildTag>()
            .firstOrNull()
    }

    suspend fun setServerGuildTag(serverId: String, tag: String, icon: GuildTagIcon,
                                 color: String, isPrivate: Boolean): GuildTag {
        return postgrest.rpc("set_server_guild_tag", buildJsonObject {
            put("p_server_id", serverId)
            put("p_tag", tag)
            put("p_icon", icon.raw)
            put("p_color", color)
            put("p_private", isPrivate)
        }).decodeAs<GuildTag>()
    }

    suspend fun removeServerGuildTag(serverId: String) {
        postgrest.rpc("remove_server_guild_tag", buildJsonObject { put("p_server_id", serverId) })
    }

    suspend fun guildTagSpace(serverId: String): GuildTagSpace {
        return postgrest.rpc("get_guild_tag_space", buildJsonObject { put("p_server_id", serverId) })
            .decodeAs<GuildTagSpace>()
    }

    suspend fun catalystCount(serverId: String): Int {
        // Head count not supported easily; select ids.
        return client.from("server_catalysts")
            .select(columns("id")) { filter { eq("server_id", serverId) } }
            .decodeList<InsertedId>()
            .size
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

@Serializable
private data class GroupMemberRow(
    @SerialName("group_id") val groupId: String,
    val profile: Profile? = null,
)
