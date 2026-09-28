package com.wsgpolar.disband.ui.chat

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
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

    fun stage(uris: List<Uri>) {
        // The picker is capped too, but a share-sheet hand-off is not.
        staged = (staged + uris).distinct().take(MAX_ATTACHMENTS)
    }

    fun unstage(uri: Uri) {
        staged = staged - uri
    }

    fun clear() {
        staged = emptyList()
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
        if (uris.isEmpty()) return false

        progress = 0f
        error = null
        val uploaded = mutableListOf<StoredAttachment>()
        var failure: String? = null

        for ((index, uri) in uris.withIndex()) {
            val bytes = runCatching {
                androidContext.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            }.getOrNull()
            if (bytes == null) {
                failure = "Couldn't read one of those images."
                continue
            }
            val name = displayName(androidContext, uri) ?: "image-${index + 1}.jpg"
            val mime = androidContext.contentResolver.getType(uri) ?: "image/jpeg"

            val result = runCatching { MediaService.uploadImage(bytes, name, mime) }.getOrNull()
            if (result == null) {
                failure = "Couldn't upload one of those images."
                break
            }
            uploaded += StoredAttachment(
                url = result.url,
                key = result.key,
                type = if (mime.startsWith("video/")) "video" else "image",
                name = name,
                size = bytes.size,
            )
            // Across the set, not this one file.
            progress = (index + 1f) / uris.size
        }

        progress = null

        if (uploaded.isEmpty()) {
            error = failure ?: "Couldn't send those images."
            return false
        }

        val sent = runCatching {
            Database.sendWithAttachments(
                context = context,
                parentId = parentId,
                authorId = authorId,
                content = caption.trim(),
                attachments = uploaded,
                replyToId = replyToId,
            )
        }.isSuccess

        if (!sent) {
            error = "Couldn't send that message."
            return false
        }

        staged = emptyList()
        if (failure != null) {
            error = "Sent ${uploaded.size} of ${uris.size} — the rest didn't upload."
        }
        return true
    }

    /** The original filename, so a set does not arrive as ten files all called "image.jpg". */
    private fun displayName(androidContext: Context, uri: Uri): String? = runCatching {
        androidContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()
}
