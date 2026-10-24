package com.wsgpolar.disband.ui.chat

import com.wsgpolar.disband.data.Profile
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class ChatTimelineTest {
    private fun row(id: String, second: Int = 1, text: String = id) = ChatRow(
        id = id, author = Profile(id = "me", username = "Alex"), authorId = "me",
        content = text, attachmentType = null, createdAt = "2026-10-21T12:00:${second.toString().padStart(2, '0')}Z",
    )

    @Test fun echoDeduplicatesAndKeepsAuthor() {
        val result = mergeChatRows(listOf(row("a")), listOf(row("a", text = "edited").copy(author = null)))
        assertEquals(1, result.size)
        assertEquals("edited", result.single().content)
        assertEquals("Alex", result.single().author?.name)
    }

    @Test fun updatesDoNotMoveMessagesToTheEnd() {
        val result = mergeChatRows(listOf(row("b", 2), row("a", 1)), listOf(row("a", 1, "edited")))
        assertEquals(listOf("a", "b"), result.map { it.id })
    }

    @Test fun timestampsWithDifferentOffsetsSortChronologically() {
        val result = mergeChatRows(emptyList(), listOf(
            row("later").copy(createdAt = "2026-10-21T09:00:00-04:00"),
            row("earlier").copy(createdAt = "2026-10-21T12:00:00+00:00"),
        ))
        assertEquals(listOf("earlier", "later"), result.map { it.id })
    }

    @Test fun realtimeWritesWinOverInflightHistory() = runBlocking {
        val response = CompletableDeferred<List<ChatRow>>()
        val state = ChatTimeline { response.await() }
        val loading = launch(start = CoroutineStart.UNDISPATCHED) { state.refresh() }
        state.upsert(row("a", text = "new edit"))
        state.upsert(row("b", 2))
        state.remove("c")
        response.complete(listOf(row("a", text = "old edit"), row("c", 3)))
        loading.join()
        assertEquals(listOf("a", "b"), state.rows.map { it.id })
        assertEquals("new edit", state.rows.first().content)
    }

    @Test fun refreshReconcilesMissedDeletes() = runBlocking {
        var page = listOf(row("a"), row("b", 2))
        val state = ChatTimeline { page }
        state.refresh()
        page = listOf(row("b", 2))
        state.refresh()
        assertEquals(listOf("b"), state.rows.map { it.id })
    }

    @Test fun loadFailureKeepsVisibleMessagesAndRetryRecovers() = runBlocking {
        var fail = false
        val state = ChatTimeline { if (fail) error("offline") else listOf(row("a")) }
        state.refresh()
        fail = true
        state.refresh()
        assertEquals(1, state.rows.size)
        assertNotNull(state.error)
        fail = false
        state.refresh()
        assertNull(state.error)
    }

    @Test fun olderPagesAreRetainedOnRefreshAndDeduplicated() = runBlocking {
        val latest = (10..59).map { row("$it", it) }
        val state = ChatTimeline { before -> if (before == null) latest else (0..10).map { row("$it", it) } }
        state.refresh()
        assertTrue(state.hasOlder)
        state.older()
        assertEquals(60, state.rows.size)
        assertFalse(state.hasOlder)
        state.refresh()
        assertEquals(60, state.rows.size)
    }

    @Test fun cancellationIsNeverReportedAsNetworkError() = runBlocking {
        val state = ChatTimeline { throw CancellationException() }
        try { state.refresh(); fail("Expected cancellation") } catch (_: CancellationException) { }
        assertNull(state.error)
    }
}
