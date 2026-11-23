package com.wsgpolar.disband.ui.chat

import com.wsgpolar.disband.data.AttachmentType
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.StoredAttachment
import org.junit.Assert.assertEquals
import org.junit.Test

class ForwardTest {
    private fun row(text: String, author: Profile? = Profile(id = "a", username = "alex"),
                    attachments: List<StoredAttachment>? = null, legacyUrl: String? = null,
                    legacyType: AttachmentType? = null) = ChatRow(
        id = "m", author = author, authorId = author?.id, content = text,
        attachmentType = legacyType, attachmentUrl = legacyUrl, attachments = attachments,
        createdAt = "2026-11-21T12:00:00Z",
    )

    @Test fun textMatchesWebFormat() {
        assertEquals("[Forwarded from alex]\nhello", forwardedContent(row("hello"), hasAttachments = false))
        assertEquals("[Forwarded]\nhello", forwardedContent(row("hello", author = null), hasAttachments = false))
    }

    @Test fun blankTextWithoutAttachmentsSaysAttachment() {
        assertEquals("[Forwarded from alex]\n(attachment)", forwardedContent(row(""), hasAttachments = false))
        assertEquals("[Forwarded from alex]", forwardedContent(row(""), hasAttachments = true))
    }

    @Test fun legacyAttachmentIsCarriedAndPollsAreDropped() {
        val legacy = forwardedAttachments(row("", legacyUrl = "https://cdn/x.png", legacyType = AttachmentType.Image))
        assertEquals(listOf("https://cdn/x.png"), legacy.map { it.url })
        assertEquals("image", legacy.single().type)
        val poll = forwardedAttachments(row("", attachments = listOf(StoredAttachment(url = "poll-id", type = "poll"))))
        assertEquals(emptyList<StoredAttachment>(), poll)
    }
}
