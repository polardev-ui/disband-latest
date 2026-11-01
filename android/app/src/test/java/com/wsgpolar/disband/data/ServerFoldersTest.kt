package com.wsgpolar.disband.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ServerFoldersTest {
    private fun space(id: String, created: String = "2026-01-0${id.last()}") = Server(id = id, name = id, ownerId = "o", createdAt = created)

    @Test
    fun loose_spaces_follow_saved_order_and_folders_come_after() {
        val servers = listOf(space("a1"), space("b2"), space("c3"), space("d4"))
        val folders = listOf(ServerFolder(id = "f2", position = 1), ServerFolder(id = "f1", position = 0))
        val states = listOf(
            ServerListState("c3", position = 0),
            ServerListState("a1", position = 1),
            ServerListState("b2", position = 1, folderId = "f1"),
            ServerListState("d4", position = 0, folderId = "f1"),
        )
        val layout = ServerFolders.layout(servers, folders, states)
        assertEquals(listOf("c3", "a1"), layout.top.map { it.id })
        // Empty folder f2 is hidden; f1 lists its spaces in their own order.
        assertEquals(listOf("f1"), layout.folders.map { it.first.id })
        assertEquals(listOf("d4", "b2"), layout.folders[0].second.map { it.id })
    }

    @Test
    fun a_space_in_a_deleted_folder_falls_back_to_the_top() {
        val layout = ServerFolders.layout(
            listOf(space("a1"), space("b2")),
            emptyList(),
            listOf(ServerListState("b2", position = 0, folderId = "gone")),
        )
        assertEquals(listOf("b2", "a1"), layout.top.map { it.id })
    }
}
