package com.wsgpolar.disband.ui.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MentionSuggestionsTest {
    @Test fun queryAfterSpaceOrStart() {
        assertEquals("al", mentionQuery("hey @al"))
        assertEquals("", mentionQuery("@"))
        assertEquals("bob_1", mentionQuery("@bob_1"))
    }

    @Test fun emailIsNotAMention() {
        assertNull(mentionQuery("mail me at a@b"))
    }

    @Test fun finishedMentionStopsSuggesting() {
        assertNull(mentionQuery("hi @alex how are you"))
    }

    @Test fun applyReplacesTypedQuery() {
        assertEquals("hey @alex ", applyMention("@alex", "hey @al"))
        assertEquals("@&Mods ", applyMention("@&Mods", "@mo"))
    }

    @Test fun roleSlugMatchesWeb() {
        assertEquals("Super-Mods", roleMentionSlug("  Super   Mods! "))
        assertEquals("a-b", roleMentionSlug("a - b"))
    }
}
