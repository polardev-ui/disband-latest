package com.wsgpolar.disband.ui.chat

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.util.UUID
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.MAX_ATTACHMENTS
import com.wsgpolar.disband.data.MediaService
import com.wsgpolar.disband.data.StoredAttachment

/**
 * Picking images and sending them.
 *
 * Android could not attach anything at all: the composer was a text field and
 * a send button, with no way to reach the gallery. Uploading already worked
 * ([MediaService.uploadImage]) and the insert already accepted an attachment
 * — only the screen between them was missing.
 *
 * Uploads run one at a time, like the web's `uploadAttachments` and iOS's
 * batch path, for the same reason: ten concurrent uploads of phone-sized
 * photos saturate an ordinary connection, make each one slower, and turn the
 * progress number into noise. [progress] runs across the whole set so the
 * composer shows one bar rather than ten.
 */
class AttachmentSender(
    private val context: String,
    private val parentId: String,
) {
    /** 0f..1f while a set is uploading, null when idle. */
    var progress by mutableStateOf<Float?>(null)
        private set

    /** Set when a send fails, for the composer to surface. */
    var error by mutableStateOf<String?>(null)

    var staged by mutableStateOf<List<Uri>>(emptyList())
        private set

    var sentRow: ChatRow? = null
        private set
    private val uploadedCache = mutableMapOf<Uri, StoredAttachment>()

    fun stage(uris: List<Uri>) {
        if (progress != null) return
        // The picker is capped too, but a share-sheet hand-off is not.
        staged = (staged + uris).distinct().take(MAX_ATTACHMENTS)
    }

    /**
     * An image or GIF from the keyboard (Gboard's GIFs, a pasted screenshot).
     * The keyboard only lends read access while it's handing it over, so the
     * bytes are copied into the cache now and that copy is what's sent.
     * Returns false if it couldn't be read.
     */
    fun stagePasted(androidContext: Context, uri: Uri, mimeHint: String?): Boolean {
        if (progress != null || staged.size >= MAX_ATTACHMENTS) return false
        val resolver = androidContext.contentResolver
        val mime = (resolver.getType(uri) ?: mimeHint)?.takeIf { it.startsWith("image/") || it.startsWith("video/") }
            ?: return false
        val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "img"
        val dir = File(androidContext.cacheDir, "pasted").apply { mkdirs() }
        val file = File(dir, "pasted-${UUID.randomUUID()}.$ext")
        val copied = runCatching {
            resolver.openInputStream(uri)?.use { input ->
                file.outputStream().use { out -> input.copyTo(out) }
            } != null
        }.getOrDefault(false)
        if (!copied || file.length() == 0L) {
            file.delete()
            return false
        }
        stage(listOf(Uri.fromFile(file)))
        return true
    }

    fun unstage(uri: Uri) {
        if (progress != null) return
        staged = staged - uri
        uploadedCache.remove(uri)
    }

    fun clear() {
        staged = emptyList()
        uploadedCache.clear()
    }

    /**
     * Upload everything staged and send it as one message.
     *
     * A failure part-way keeps what already landed rather than discarding it:
     * the message goes out with the images that uploaded and the rest is
     * reported. Throwing the lot away would mean a dropped connection on the
     * last photo costs all the others.
     */
    suspend fun send(
        androidContext: Context,
        authorId: String,
        caption: String,
        replyToId: String? = null,
    ): Boolean {
        val uris = staged
        if (uris.isEmpty() || progress != null) return false

        progress = 0f
        error = null
        sentRow = null
        try {
        val uploaded = mutableListOf<StoredAttachment>()
        val uploadedUris = mutableListOf<Uri>()
        var failure: String? = null

        for ((index, uri) in uris.withIndex()) {
            val cached = uploadedCache[uri]
            if (cached != null) {
                uploaded += cached
                uploadedUris += uri
                progress = (index + 1f) / uris.size
                continue
            }
            val bytes = withContext(Dispatchers.IO) {
                runCatching { androidContext.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            }
            if (bytes == null) {
                failure = "Couldn't read one of those images."
                continue
            }
            val name = withContext(Dispatchers.IO) { displayName(androidContext, uri) }
                ?: uri.takeIf { it.scheme == "file" }?.lastPathSegment
                ?: "image-${index + 1}.jpg"
            // A pasted copy is a plain file, which has no content type: go by its extension.
            val mime = androidContext.contentResolver.getType(uri)
                ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
                ?: "image/jpeg"

            val result = try { MediaService.uploadImage(bytes, name, mime) }
                catch (e: CancellationException) { throw e }
                catch (_: Exception) { null }
            if (result == null) {
                failure = "Couldn't upload one of those images."
                break
            }
            uploadedUris += uri
            uploaded += StoredAttachment(
                url = result.url,
                key = result.key,
                type = if (mime.startsWith("video/")) "video" else "image",
                name = name,
                size = bytes.size,
            )
            uploadedCache[uri] = uploaded.last()
            // Across the set, not this one file.
            progress = (index + 1f) / uris.size
        }

        if (uploaded.isEmpty()) {
            error = failure ?: "Couldn't send those images."
            return false
        }

        val sentAt = java.time.Instant.now().toString()
        val id = try {
            Database.sendWithAttachments(
                context = context,
                parentId = parentId,
                authorId = authorId,
                content = caption.trim(),
                attachments = uploaded,
                replyToId = replyToId,
            )
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { null }

        if (id == null) {
            error = "Couldn't send that message."
            return false
        }

        sentRow = ChatRow(id = id, author = null, authorId = authorId, content = caption.trim(),
            attachmentType = null, attachments = uploaded.toList(), createdAt = sentAt, replyToId = replyToId)
        staged = staged - uploadedUris.toSet()
        uploadedUris.forEach { uploadedCache.remove(it) }
        if (failure != null) {
            error = "Sent ${uploaded.size} of ${uris.size} — the rest didn't upload."
        }
        return true
        } finally { progress = null }
    }

    /**
     * A poll goes out as a message whose attachment is the poll, as on the
     * web and iOS. It shows up through the conversation's realtime feed.
     */
    suspend fun sendPoll(authorId: String, pollId: String): Boolean {
        val id = try {
            Database.sendWithAttachments(
                context = context,
                parentId = parentId,
                authorId = authorId,
                content = "",
                attachments = listOf(StoredAttachment(url = pollId, type = "poll")),
            )
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { null }
        if (id == null) error = "Couldn't send the poll."
        return id != null
    }

    /** The original filename, so a set does not arrive as ten files all called "image.jpg". */
    private fun displayName(androidContext: Context, uri: Uri): String? = runCatching {
        androidContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()
}
