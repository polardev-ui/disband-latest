package com.wsgpolar.disband.ui.main

import org.junit.Assert.assertEquals
import org.junit.Test

class InviteCodeTest {
    @Test fun sevenCharacterLink() {
        assertEquals("aB3xY9k", inviteCode("https://www.disband.dev/server/aB3xY9k"))
    }

    @Test fun longGeneratedCode() {
        val code = "0123456789abcdef0123456789ABCDEF"
        assertEquals(code, inviteCode("https://disband.dev/server/$code"))
    }

    @Test fun vanityCodeWithHyphen() {
        assertEquals("my-space", inviteCode("https://www.disband.dev/server/my-space"))
    }

    @Test fun oldInvitePathAndAppScheme() {
        assertEquals("abcdefg", inviteCode("https://www.disband.dev/invite/abcdefg"))
        assertEquals("abcdefg", inviteCode("disband://invite/abcdefg"))
    }

    @Test fun trailingSlashAndQuery() {
        assertEquals("abcdefg", inviteCode("https://www.disband.dev/server/abcdefg/"))
        assertEquals("abcdefg", inviteCode("https://www.disband.dev/server/abcdefg?ref=x"))
    }

    @Test fun bareCodeIsTakenAsIs() {
        assertEquals("aB3xY9k", inviteCode("  aB3xY9k  "))
    }
}
