package com.wsgpolar.disband.ui.main

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationSourceTest {
    private val id = "5f0c5f18-2f5f-4f4a-9a7f-2f5f4f4a9a7f"

    @Test fun channelPrefix() {
        assertEquals(id, notificationSourceId("channel:$id"))
    }

    @Test fun dmPrefix() {
        assertEquals(id, notificationSourceId("dm:$id"))
    }

    @Test fun groupPath() {
        assertEquals(id, notificationSourceId("/group/$id"))
    }

    @Test fun groupPrefix() {
        assertEquals(id, notificationSourceId("group:$id"))
    }

    @Test fun bareSourceIsUnchanged() {
        assertEquals(id, notificationSourceId("  $id  "))
    }

    @Test fun officialLinkIsNotGuessed() {
        assertEquals("https://disband.dev/status", notificationSourceId("https://disband.dev/status"))
    }
}
