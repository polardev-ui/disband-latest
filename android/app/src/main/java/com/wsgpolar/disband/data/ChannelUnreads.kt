package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.leave
import io.github.jan.supabase.auth.auth

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Which server channels have messages you haven't read, shared with every
 * other device through `channel_reads` (migration 0229), as on iOS and web.
 * The server decides; a new message anywhere, or a read on another device,
 * asks it again.
 */
object ChannelUnreads {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _channels = MutableStateFlow<Set<String>>(emptySet())
    private val _servers = MutableStateFlow<Set<String>>(emptySet())
    val channels: StateFlow<Set<String>> get() = _channels
    val servers: StateFlow<Set<String>> get() = _servers

    private val _mentions = MutableStateFlow<Map<String, Int>>(emptyMap())
    private val _serverMentions = MutableStateFlow<Map<String, Int>>(emptyMap())
    /**
     * Red mention counts per channel and per space (the sum of its channels),
     * from `get_channel_mention_unread()`: unread `mention` notifications
     * linked `channel:<id>`. The same numbers the web shows.
     */
    val mentions: StateFlow<Map<String, Int>> get() = _mentions
    val serverMentions: StateFlow<Map<String, Int>> get() = _serverMentions
    private var mentionJob: Job? = null

    @Volatile private var activeChannelId: String? = null
    private var listenJob: Job? = null
    private var refreshJob: Job? = null

    @Serializable
    private data class Row(
        @SerialName("channel_id") val channelId: String,
        @SerialName("server_id") val serverId: String,
    )

    @Serializable
    private data class MentionRow(
        @SerialName("channel_id") val channelId: String,
        @SerialName("server_id") val serverId: String? = null,
        @SerialName("mention_count") val mentionCount: Int = 0,
    )

    /** Begin listening (safe to call repeatedly), and re-read now. */
    fun start() {
        refreshSoon(0)
        if (listenJob?.isActive == true) return
        listenJob = scope.launch {
            // Rejoins after the socket drops (backgrounding, network change).
            while (isActive) {
                val messages = runCatching { RealtimeService.observeChanges("messages") }.getOrNull()
                val reads = runCatching { RealtimeService.observeChanges("channel_reads") }.getOrNull()
                // A new mention (or one read on another device) changes the red counts.
                val uid = DisbandSupabase.client.auth.currentUserOrNull()?.id
                val notes = uid?.let { runCatching { RealtimeService.observeChanges("notifications", "user_id=eq.$it") }.getOrNull() }
                try {
                    if (messages != null && reads != null) {
                        launch { reads.flow.collect { refreshSoon(300) } }
                        notes?.let { n -> launch { n.flow.collect { refreshMentionsSoon(400) } } }
                        messages.flow.collect { refreshSoon(1_000) }
                    }
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (_: Exception) {
                } finally {
                    withContext(NonCancellable) {
                        runCatching { messages?.channel?.leave() }
                        runCatching { reads?.channel?.leave() }
                        runCatching { notes?.channel?.leave() }
                    }
                }
                delay(3_000)
                refreshSoon(0)
            }
        }
    }

    /** Signing out: forget the previous account's dots. */
    fun reset() {
        listenJob?.cancel(); listenJob = null
        refreshJob?.cancel()
        activeChannelId = null
        _channels.value = emptySet()
        _servers.value = emptySet()
        mentionJob?.cancel()
        _mentions.value = emptyMap()
        _serverMentions.value = emptyMap()
    }

    fun open(channelId: String) {
        activeChannelId = channelId
        if (channelId in _channels.value) {
            _channels.value = _channels.value - channelId
            refreshSoon(400)
        }
        markRead(channelId)
        markMentionsRead(channelId)
    }

    fun close(channelId: String) {
        if (activeChannelId != channelId) return
        markRead(channelId)
        activeChannelId = null
    }

    /** A message arrived in the open channel: keep the shared cursor level. */
    fun sawMessage(channelId: String, pingsYou: Boolean = false) {
        if (activeChannelId != channelId) return
        markRead(channelId)
        // A ping you are looking at is read, not a badge (web behaviour).
        if (pingsYou) scope.launch { delay(800); markMentionsRead(channelId) }
    }

    /** `mark_channel_mentions_read`: clears the red count here and on the web. */
    private fun markMentionsRead(channelId: String) {
        val had = _mentions.value[channelId] ?: 0
        if (had > 0) dropMentions(channelId)
        scope.launch {
            runCatching {
                DisbandSupabase.postgrest.rpc(
                    "mark_channel_mentions_read",
                    buildJsonObject { put("p_channel_id", channelId) },
                )
            }
        }
    }

    private fun dropMentions(channelId: String) {
        _mentions.value = _mentions.value - channelId
        recountServers()
    }

    private var mentionServers: Map<String, String> = emptyMap()

    private fun recountServers() {
        val totals = mutableMapOf<String, Int>()
        for ((channel, count) in _mentions.value) {
            val server = mentionServers[channel] ?: continue
            totals[server] = (totals[server] ?: 0) + count
        }
        _serverMentions.value = totals
    }

    /**
     * Mark a whole space read (`mark_server_read`): every channel's cursor and
     * every mention in it, as the web's "Mark as read".
     */
    fun markServerRead(serverId: String) {
        val channelsInServer = mentionServers.filterValues { it == serverId }.keys
        _mentions.value = _mentions.value - channelsInServer
        recountServers()
        _servers.value = _servers.value - serverId
        scope.launch {
            runCatching {
                DisbandSupabase.postgrest.rpc("mark_server_read", buildJsonObject { put("p_server_id", serverId) })
            }
            refreshSoon(300)
        }
    }

    fun refreshMentionsSoon(delayMs: Long) {
        mentionJob?.cancel()
        mentionJob = scope.launch {
            if (delayMs > 0) delay(delayMs)
            val rows = runCatching {
                DisbandSupabase.postgrest.rpc("get_channel_mention_unread").decodeList<MentionRow>()
            }.getOrNull() ?: return@launch
            val active = activeChannelId
            mentionServers = rows.mapNotNull { r -> r.serverId?.let { r.channelId to it } }.toMap()
            _mentions.value = rows.filter { it.mentionCount > 0 && it.channelId != active }
                .associate { it.channelId to it.mentionCount }
            recountServers()
            // A mention in the channel on screen is read straight away.
            if (active != null && rows.any { it.channelId == active && it.mentionCount > 0 }) markMentionsRead(active)
        }
    }

    private fun markRead(channelId: String) {
        scope.launch {
            runCatching {
                DisbandSupabase.postgrest.rpc(
                    "mark_channel_read",
                    buildJsonObject { put("p_channel_id", channelId) },
                )
            }
        }
    }

    fun refreshSoon(delayMs: Long) {
        if (delayMs == 0L) refreshMentionsSoon(0)
        refreshJob?.cancel()
        refreshJob = scope.launch {
            if (delayMs > 0) delay(delayMs)
            val rows = runCatching {
                DisbandSupabase.postgrest.rpc("my_channel_unreads").decodeList<Row>()
            }.getOrNull() ?: return@launch
            val visible = rows.filter { it.channelId != activeChannelId }
            _channels.value = visible.mapTo(hashSetOf()) { it.channelId }
            _servers.value = visible.mapTo(hashSetOf()) { it.serverId }
        }
    }
}
