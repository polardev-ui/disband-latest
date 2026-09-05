package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.TimeFormat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Backs the Notes tab: paged history, pin/edit/delete, and realtime so a note
 * written on the desktop shows up here without a refresh. Mirrors the iOS
 * `NotesService`.
 */
class NotesService(private val scope: CoroutineScope) {
    private val _notes = MutableStateFlow<List<Note>>(emptyList())
    val notes: StateFlow<List<Note>> = _notes.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _hasMore = MutableStateFlow(false)
    val hasMore: StateFlow<Boolean> = _hasMore.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var hasLoadedOnce = false
    private var watchJob: Job? = null
    private var changeJob: Job? = null
    private var userId: String? = null

    suspend fun start(userId: String?) {
        if (this.userId == userId) return
        stop()
        this.userId = userId
        hasLoadedOnce = false
        _notes.value = emptyList()
        if (userId == null) {
            _loading.value = false
            return
        }
        load()
        subscribe(userId)
    }

    fun stop() {
        watchJob?.cancel()
        watchJob = null
        changeJob?.cancel()
        changeJob = null
    }

    suspend fun load() {
        val uid = userId ?: return
        if (!hasLoadedOnce) _loading.value = true
        _loading.value = false
        try {
            val rows = Database.fetchNotes(uid, limit = 50)
            _notes.value = rows
            _hasMore.value = rows.size == 50
            hasLoadedOnce = true
        } catch (e: Exception) {
            _error.value = friendlyMessage(e)
        }
    }

    suspend fun loadMore() {
        val uid = userId ?: return
        if (!_hasMore.value) return
        val oldest = _notes.value.lastOrNull()?.createdAt ?: return
        try {
            val rows = Database.fetchNotes(uid, limit = 50, before = oldest)
            val known = _notes.value.map { it.id }.toSet()
            _notes.value = _notes.value + rows.filter { it.id !in known }
            _hasMore.value = rows.size == 50
        } catch (e: Exception) {
            _error.value = friendlyMessage(e)
        }
    }

    suspend fun send(content: String, attachment: OutgoingAttachment? = null) {
        val uid = userId ?: return
        val trimmed = content.trim()
        if (trimmed.isEmpty() && attachment == null) return
        try {
            val note = Database.insertNote(uid, trimmed, attachment) ?: return
            if (_notes.value.none { it.id == note.id }) {
                _notes.value = listOf(note) + _notes.value
            }
        } catch (e: Exception) {
            _error.value = friendlyMessage(e)
        }
    }

    suspend fun edit(note: Note, content: String) {
        val trimmed = content.trim()
        if (trimmed.isEmpty() && note.attachmentUrl == null) return
        val stamp = TimeFormat.nowStamp()
        try {
            Database.updateNoteContent(note.id, trimmed, stamp)
            _notes.value = _notes.value.map {
                if (it.id == note.id) it.copy(content = trimmed, editedAt = stamp) else it
            }
        } catch (e: Exception) {
            _error.value = friendlyMessage(e)
        }
    }

    suspend fun togglePin(note: Note) {
        val next = !note.pinned
        _notes.value = _notes.value.map { if (it.id == note.id) it.copy(pinned = next) else it }
        try {
            Database.setNotePinned(note.id, next)
        } catch (e: Exception) {
            _notes.value = _notes.value.map { if (it.id == note.id) it.copy(pinned = !next) else it }
            _error.value = friendlyMessage(e)
        }
    }

    suspend fun delete(note: Note) {
        val previous = _notes.value
        _notes.value = previous.filterNot { it.id == note.id }
        try {
            Database.deleteNote(note.id)
        } catch (e: Exception) {
            _notes.value = previous
            _error.value = friendlyMessage(e)
        }
    }

    fun pinned(): List<Note> = _notes.value.filter { it.pinned }

    private fun subscribe(userId: String) {
        scope.launch {
            try {
                val live = RealtimeService.observeInserts("notes", "user_id=eq.$userId", Note.serializer())
                watchJob = launch {
                    live.flow.collect { note ->
                        if (_notes.value.none { it.id == note.id }) {
                            _notes.value = listOf(note) + _notes.value
                        }
                    }
                }
            } catch (_: Exception) {
            }
        }

        scope.launch {
            try {
                val changes = RealtimeService.observeChanges("notes", "user_id=eq.$userId")
                changeJob = launch {
                    changes.flow.collect { reconcile() }
                }
            } catch (_: Exception) {
            }
        }
    }

    /** Re-read the newest page and bring local state in line with it. */
    private suspend fun reconcile() {
        val uid = userId ?: return
        try {
            val rows = Database.fetchNotes(uid, limit = 50)
            val serverIds = rows.map { it.id }.toSet()
            val windowFloor = if (rows.size == 50) rows.lastOrNull()?.createdAt else null

            val merged = _notes.value.filter { note ->
                if (note.id in serverIds) return@filter true
                val created = note.createdAt ?: return@filter false
                if (windowFloor != null && created < windowFloor) return@filter true
                false
            }.toMutableList()

            for (row in rows) {
                val idx = merged.indexOfFirst { it.id == row.id }
                if (idx >= 0) merged[idx] = row else merged.add(row)
            }
            merged.sortByDescending { it.createdAt.orEmpty() }
            _notes.value = merged
        } catch (_: Exception) {
        }
    }

    private fun friendlyMessage(e: Exception): String {
        val text = e.message ?: e.toString()
        return if ("notes" in text && "exist" in text) {
            "Notes isn't set up on this account yet."
        } else {
            text
        }
    }
}