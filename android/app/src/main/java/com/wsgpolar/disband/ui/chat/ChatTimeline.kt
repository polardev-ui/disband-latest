package com.wsgpolar.disband.ui.chat

import androidx.compose.runtime.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.MessageChange
import com.wsgpolar.disband.data.RealtimeService
import kotlinx.coroutines.*
import kotlinx.serialization.KSerializer
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import com.wsgpolar.disband.core.TimeFormat
import java.time.Instant

/** Stable ordering and identity across HTTP responses, acknowledgements and realtime echoes. */
internal fun mergeChatRows(current: List<ChatRow>, incoming: List<ChatRow>): List<ChatRow> {
    val authors = current.mapNotNull { row -> row.author?.let { row.authorId to it } }.toMap()
    val indexed = current.associateByTo(linkedMapOf()) { it.id }
    incoming.forEach { row ->
        indexed[row.id] = row.copy(author = row.author ?: indexed[row.id]?.author ?: authors[row.authorId])
    }
    return indexed.values.map { it to (TimeFormat.parse(it.createdAt) ?: Instant.EPOCH) }
        .sortedWith(compareBy<Pair<ChatRow, Instant>> { it.second }.thenBy { it.first.id })
        .map { it.first }
}

/** A screen-scoped timeline. No user data survives signing out. */
class ChatTimeline(private val fetch: suspend (String?) -> List<ChatRow>) {
    var rows by mutableStateOf<List<ChatRow>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var loadingOlder by mutableStateOf(false)
        private set
    var hasOlder by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    private val refreshMutex = Mutex()
    private var loadedInitialPage = false
    private var revision = 0L
    private val changed = mutableMapOf<String, Long>()

    fun upsert(row: ChatRow) {
        changed[row.id] = ++revision
        rows = mergeChatRows(rows, listOf(row))
    }

    fun resolveAuthor(profile: Profile) {
        rows = rows.map { if (it.authorId == profile.id && it.author == null) it.copy(author = profile) else it }
    }

    fun remove(id: String) {
        changed[id] = ++revision
        rows = rows.filterNot { it.id == id }
    }

    suspend fun refresh() = refreshMutex.withLock {
        val started = revision
        try {
            val page = fetch(null)
            val initial = !loadedInitialPage
            val oldest = page.firstOrNull()?.createdAt
            // Reconcile missed deletes after a reconnect, keeping older pages and
            // writes that completed while this HTTP request was in flight.
            val ids = page.mapTo(hashSetOf()) { it.id }
            val retained = rows.filter {
                (changed[it.id] ?: 0) > started || it.id in ids ||
                    (page.size >= 50 && oldest != null &&
                        (TimeFormat.parse(it.createdAt) ?: Instant.EPOCH) < (TimeFormat.parse(oldest) ?: Instant.EPOCH))
            }
            rows = mergeChatRows(retained, page.filter { (changed[it.id] ?: 0) <= started })
            if (initial) hasOlder = page.size >= 50
            loadedInitialPage = true
            changed.entries.removeAll { it.value <= started }
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = "Couldn't load messages. Check your connection and retry."
        } finally {
            loading = false
        }
    }

    suspend fun older() = refreshMutex.withLock {
        if (loadingOlder || !hasOlder) return@withLock
        val before = rows.firstOrNull()?.createdAt ?: return@withLock
        loadingOlder = true
        val started = revision
        try {
            val page = fetch(before)
            rows = mergeChatRows(page.filter { (changed[it.id] ?: 0) <= started }, rows)
            hasOlder = page.size >= 50
            changed.entries.removeAll { it.value <= started }
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = "Couldn't load older messages. Try again."
        } finally {
            loadingOlder = false
        }
    }
}

@Composable
fun <T> rememberChatTimeline(
    key: String,
    table: String,
    filter: String,
    serializer: KSerializer<T>,
    toRow: (T) -> ChatRow,
    fetch: suspend (String?) -> List<ChatRow>,
    onIncoming: suspend (ChatRow) -> Unit = {},
): ChatTimeline {
    val state = remember(key) { ChatTimeline(fetch) }
    val incoming by rememberUpdatedState(onIncoming)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(key, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            coroutineScope {
                val resolvingAuthors = mutableSetOf<String>()
                // First paint never waits for the socket handshake.
                launch { state.refresh() }
                launch {
                    while (isActive) {
                        try {
                            val live = RealtimeService.observeMessages(table, filter, serializer)
                            try { coroutineScope {
                                // Start consuming before reconciling the subscription gap.
                                launch(start = CoroutineStart.UNDISPATCHED) {
                                    live.flow.collect { change ->
                                        when (change) {
                                            is MessageChange.Upsert -> {
                                                val row = toRow(change.message)
                                                state.upsert(row)
                                                val authorId = row.authorId
                                                if (authorId != null && state.rows.any { it.authorId == authorId && it.author == null }
                                                    && resolvingAuthors.add(authorId)) {
                                                    launch {
                                                        try { state.resolveAuthor(Database.profile(authorId)) }
                                                        catch (e: CancellationException) { throw e }
                                                        catch (_: Exception) { /* History refresh can also restore the author. */ }
                                                        finally { resolvingAuthors.remove(authorId) }
                                                    }
                                                }
                                                launch { incoming(row) }
                                            }
                                            is MessageChange.Removed -> state.remove(change.id)
                                        }
                                    }
                                }.let { collector ->
                                    try {
                                        state.refresh()
                                        collector.join()
                                    } finally { collector.cancel() }
                                }
                            } } finally {
                                withContext(NonCancellable) { runCatching { live.channel.unsubscribe() } }
                            }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (_: Exception) {
                            delay(3_000)
                            state.refresh()
                        }
                    }
                }
                // Also repairs reconnect gaps when the underlying socket reconnects silently.
                launch { while (isActive) { delay(30_000); state.refresh() } }
            }
        }
    }
    return state
}
