package com.wsgpolar.disband.ui.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChatLinksTest {
    @Test fun urlDropsTrailingPunctuation() {
        val t = ChatMarkdown.findLink("see https://example.com/a_b_c.")!!
        assertEquals("https://example.com/a_b_c", t.url)
    }

    @Test fun channelReference() {
        val id = "123e4567-e89b-12d3-a456-426614174000"
        val t = ChatMarkdown.findLink("go <#$id> now")!!
        assertEquals(id, t.channelId)
        assertNull(t.url)
    }

    @Test fun plainTextHasNoLinks() {
        assertEquals(0, ChatMarkdown.findLinks("hello @bob #general").size)
    }
}
