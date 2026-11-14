import Foundation
import Supabase

/// Slash commands from the bots in a space, running them, and pressing their
/// buttons. The same RPCs the web composer uses.
enum BotCommandService {
    private static var client: SupabaseClient { SupabaseManager.client }

    /// Kept for a minute per space, so typing "/" doesn't refetch each time.
    private static var cache: [String: (at: Date, commands: [BotCommand])] = [:]

    static func commands(serverId: String) async -> [BotCommand] {
        if let hit = cache[serverId], Date().timeIntervalSince(hit.at) < 60 { return hit.commands }
        let list: [BotCommand] = (try? await client
            .rpc("space_bot_commands", params: ["p_server_id": serverId])
            .execute().value) ?? []
        cache[serverId] = (Date(), list)
        return list
    }

    /// Ask the bot to run a command here. Its answer arrives as a message.
    static func run(_ command: BotCommand, channelId: String, options: [String: AnyJSON]) async throws {
        struct Params: Encodable {
            let p_bot_id: String
            let p_channel_id: String
            let p_name: String
            let p_options: [String: AnyJSON]
        }
        try await client.rpc("invoke_bot_command", params: Params(
            p_bot_id: command.botId, p_channel_id: channelId, p_name: command.name, p_options: options
        )).execute()
    }

    /// Press a button on a bot's message.
    static func press(messageId: String, customId: String) async throws {
        try await client.rpc("press_bot_button", params: [
            "p_message_id": messageId, "p_custom_id": customId,
        ]).execute()
    }

    /// Turns what was typed into the value the bot expects for that option.
    /// People and channels are sent as ids, as the web does; nil when the
    /// field is empty, and an error when a name doesn't match anything.
    static func value(for option: BotCommand.Option, text: String, serverId: String) async throws -> AnyJSON? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        switch option.type {
        case "integer":
            guard let n = Int(t) else { throw CommandInputError("\(option.name) must be a whole number.") }
            return .integer(n)
        case "number":
            guard let n = Double(t) else { throw CommandInputError("\(option.name) must be a number.") }
            return .double(n)
        case "boolean":
            return .bool(["yes", "true", "on", "1"].contains(t.lowercased()))
        case "user":
            let name = (t.hasPrefix("@") ? String(t.dropFirst()) : t).lowercased()
            struct Row: Decodable { let id: String }
            let rows: [Row] = (try? await client.from("profiles").select("id").eq("username", value: name).limit(1).execute().value) ?? []
            guard let id = rows.first?.id else { throw CommandInputError("No one called @\(name).") }
            return .string(id)
        case "channel":
            let name = (t.hasPrefix("#") ? String(t.dropFirst()) : t).lowercased()
            struct Row: Decodable { let id: String }
            let rows: [Row] = (try? await client.from("channels").select("id")
                .eq("server_id", value: serverId).ilike("name", pattern: DatabaseService.likeExact(name)).limit(1).execute().value) ?? []
            guard let id = rows.first?.id else { throw CommandInputError("No channel called #\(name).") }
            return .string(id)
        default:
            return .string(t)
        }
    }
}

struct CommandInputError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// Forums: listing posts and starting one (migration 0240).
enum ForumService {
    private static var client: SupabaseClient { SupabaseManager.client }

    static func posts(forumId: String) async throws -> [ForumPost] {
        try await client
            .rpc("get_forum_posts", params: ["p_forum_id": AnyJSON.string(forumId), "p_limit": AnyJSON.integer(100)])
            .execute().value
    }

    /// Returns the new post's id (its own channel).
    static func create(forumId: String, title: String, content: String) async throws -> String {
        struct Params: Encodable {
            let p_forum_id: String
            let p_title: String
            let p_content: String
        }
        return try await client
            .rpc("create_forum_post", params: Params(p_forum_id: forumId, p_title: title, p_content: content))
            .execute().value
    }
}
