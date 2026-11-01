package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ServerFolder(
    val id: String,
    val name: String = "Folder",
    val color: String = "#5865f2",
    val position: Int = 0,
)

@Serializable
data class ServerListState(
    @SerialName("server_id") val serverId: String,
    val position: Int = 0,
    @SerialName("folder_id") val folderId: String? = null,
)

/** The rail as the web arranges it: loose spaces first, then folders. */
data class RailLayout(
    val top: List<Server>,
    val folders: List<Pair<ServerFolder, List<Server>>>,
)

/**
 * Folders and the order of spaces, saved per account by the web and desktop
 * (server_folders and server_list_state). Android ignored both, so a phone
 * showed every space loose in join order and folders seemed not to sync.
 */
object ServerFolders {
    suspend fun load(): Pair<List<ServerFolder>, List<ServerListState>> {
        val client = DisbandSupabase.client
        val folders = client.from("server_folders")
            .select(Columns.list("id", "name", "color", "position")) { order("position", Order.ASCENDING) }
            .decodeList<ServerFolder>()
        val states = client.from("server_list_state")
            .select(Columns.list("server_id", "position", "folder_id"))
            .decodeList<ServerListState>()
        return folders to states
    }

    /** Same rules as computeRailLayout() on the web. */
    fun layout(servers: List<Server>, folders: List<ServerFolder>, states: List<ServerListState>): RailLayout {
        val byServer = states.associateBy { it.serverId }
        val live = folders.map { it.id }.toSet()
        val order = compareBy<Server>({ byServer[it.id]?.position ?: Int.MAX_VALUE }, { it.createdAt ?: "" })
        val top = servers.filter { s -> byServer[s.id]?.folderId.let { it == null || it !in live } }.sortedWith(order)
        val grouped = folders.sortedBy { it.position }.map { folder ->
            folder to servers.filter { byServer[it.id]?.folderId == folder.id }.sortedWith(order)
        }.filter { it.second.isNotEmpty() }
        return RailLayout(top, grouped)
    }
}
