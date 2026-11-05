package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.leave

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

    @Volatile private var activeChannelId: String? = null
    private var listenJob: Job? = null
    private var refreshJob: Job? = null

    @Serializable
    private data class Row(
        @SerialName("channel_id") val channelId: String,
        @SerialName("server_id") val serverId: String,
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
                try {
                    if (messages != null && reads != null) {
                        launch { reads.flow.collect { refreshSoon(300) } }
                        messages.flow.collect { refreshSoon(1_000) }
                    }
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (_: Exception) {
                } finally {
                    withContext(NonCancellable) {
                        runCatching { messages?.channel?.leave() }
                        runCatching { reads?.channel?.leave() }
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
    }

    fun open(channelId: String) {
        activeChannelId = channelId
        if (channelId in _channels.value) {
            _channels.value = _channels.value - channelId
            refreshSoon(400)
        }
        markRead(channelId)
    }

    fun close(channelId: String) {
        if (activeChannelId != channelId) return
        markRead(channelId)
        activeChannelId = null
    }

    /** A message arrived in the open channel: keep the shared cursor level. */
    fun sawMessage(channelId: String) {
        if (activeChannelId == channelId) markRead(channelId)
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
