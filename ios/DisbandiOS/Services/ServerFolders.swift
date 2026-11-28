import Foundation
import Supabase

/**
 Folders and the order of spaces on the rail, saved per account by the web
 and desktop (`server_folders`, `server_list_state`). iOS listed every space
 loose in join order, so folders made on the desktop never showed here.
 Layout follows the web's `computeRailLayout`: loose spaces first by their
 saved position, then each folder (by position) with its spaces.
 Read-only here: folders are still made and arranged on the desktop.
 */
enum ServerFolders {
    struct Folder: Decodable, Hashable, Sendable {
        let id: String
        var name: String
        var color: String
        var position: Int

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? "Folder"
            color = (try? c.decodeIfPresent(String.self, forKey: .color)) ?? "#5865f2"
            position = (try? c.decodeIfPresent(Int.self, forKey: .position)) ?? 0
        }
        enum CodingKeys: String, CodingKey { case id, name, color, position }
    }

    struct Slot: Decodable, Hashable, Sendable {
        let serverId: String
        let position: Int?
        let folderId: String?
        enum CodingKeys: String, CodingKey {
            case position
            case serverId = "server_id"
            case folderId = "folder_id"
        }
    }

    struct Layout {
        var top: [Server]
        var folders: [(folder: Folder, servers: [Server])]
    }

    static func load() async -> (folders: [Folder], slots: [Slot])? {
        let client = SupabaseManager.client
        async let foldersCall: [Folder]? = try? client.from("server_folders")
            .select("id, name, color, position").order("position").execute().value
        async let slotsCall: [Slot]? = try? client.from("server_list_state")
            .select("server_id, position, folder_id").execute().value
        let (folders, slots) = await (foldersCall, slotsCall)
        guard let folders, let slots else { return nil }
        return (folders, slots)
    }

    static func layout(servers: [Server], folders: [Folder], states: [Slot]) -> Layout {
        let byServer = Dictionary(states.map { ($0.serverId, $0) }, uniquingKeysWith: { a, _ in a })
        let live = Set(folders.map(\.id))
        func position(_ s: Server) -> Int { byServer[s.id]?.position ?? .max }
        func ordered(_ list: [Server]) -> [Server] {
            list.sorted { a, b in
                position(a) != position(b) ? position(a) < position(b) : (a.createdAt ?? "") < (b.createdAt ?? "")
            }
        }
        let top = ordered(servers.filter { s in
            guard let folder = byServer[s.id]?.folderId else { return true }
            return !live.contains(folder)
        })
        let grouped = folders.sorted { $0.position < $1.position }.compactMap { folder -> (Folder, [Server])? in
            let members = ordered(servers.filter { byServer[$0.id]?.folderId == folder.id })
            return members.isEmpty ? nil : (folder, members)
        }
        return Layout(top: top, folders: grouped.map { (folder: $0.0, servers: $0.1) })
    }
}
