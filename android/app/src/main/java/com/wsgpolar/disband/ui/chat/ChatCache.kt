package com.wsgpolar.disband.ui.chat

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest

/**
 * The last [KEEP] messages of each conversation, so opening one draws
 * straight away and the network refresh lands behind it. Held in memory for
 * this run and on disk (app-private files) for the next; wiped on sign-out,
 * and every key carries the signed-in user's id so accounts never mix.
 */
object ChatCache {
    private const val KEEP = 50
    private const val MEMORY_CONVERSATIONS = 40

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val serializer = ListSerializer(ChatRow.serializer())

    private val memory = object : LinkedHashMap<String, List<ChatRow>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<ChatRow>>?) = size > MEMORY_CONVERSATIONS
    }
    private val writes = mutableMapOf<String, Job>()
    @Volatile private var dir: File? = null

    fun init(context: Context) {
        if (dir == null) dir = File(context.filesDir, "chat-cache").apply { mkdirs() }
    }

    /** Synchronous, for the first frame. */
    fun memory(key: String): List<ChatRow>? = synchronized(memory) { memory[key] }

    /** Off the main thread; null when nothing was saved. */
    suspend fun disk(key: String): List<ChatRow>? = withContext(Dispatchers.IO) {
        val file = file(key) ?: return@withContext null
        if (!file.exists()) return@withContext null
        runCatching { json.decodeFromString(serializer, file.readText()) }.getOrNull()
            ?.also { rows -> synchronized(memory) { if (memory[key] == null) memory[key] = rows } }
    }

    /** Keep the newest messages; written to disk a moment later, coalesced. */
    fun store(key: String, rows: List<ChatRow>) {
        val kept = rows.filterNot { it.pending }.takeLast(KEEP).map { it.copy(reactions = emptyList()) }
        if (kept.isEmpty()) return
        synchronized(memory) { memory[key] = kept }
        synchronized(writes) {
            writes[key]?.cancel()
            writes[key] = scope.launch {
                delay(1_500)
                val file = file(key) ?: return@launch
                runCatching {
                    val tmp = File(file.parentFile, file.name + ".tmp")
                    tmp.writeText(json.encodeToString(serializer, kept))
                    tmp.renameTo(file)
                }
            }
        }
    }

    fun clear(context: Context) {
        synchronized(memory) { memory.clear() }
        synchronized(writes) { writes.values.forEach { it.cancel() }; writes.clear() }
        val folder = dir ?: File(context.filesDir, "chat-cache")
        scope.launch { runCatching { folder.listFiles()?.forEach { it.delete() } } }
    }

    private fun file(key: String): File? {
        val folder = dir ?: return null
        val digest = MessageDigest.getInstance("SHA-1").digest(key.toByteArray())
        return File(folder, digest.joinToString("") { "%02x".format(it) } + ".json")
    }
}
