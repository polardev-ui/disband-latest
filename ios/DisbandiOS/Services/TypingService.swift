import Foundation
import Supabase
import Realtime

/// Typing indicators over Supabase broadcast, interoperable with the web
/// client: same topics (`typing:ch/dm/group:{id}`) and payload keys
/// (`userId`, `name`), so native and web typers see each other.
enum TypingService {
    struct Event: Sendable {
        let userId: String
        let name: String
    }

    private struct Payload: Codable {
        let userId: String
        let name: String
    }

    static func topic(kind: String, id: String) -> String {
        "typing:\(kind):\(id)"
    }

    static func watch(topic: String) async -> (channel: RealtimeChannelV2, stream: AsyncStream<Event>) {
        let channel = SupabaseManager.client.channel(topic)
        let raw = channel.broadcastStream(event: "typing")
        await channel.subscribe()
        let stream = AsyncStream<Event> { continuation in
            let task = Task {
                for await obj in raw {
                    guard
                        let payload = obj["payload"]?.objectValue,
                        let userId = payload["userId"]?.stringValue,
                        let name = payload["name"]?.stringValue,
                        !userId.isEmpty, !name.isEmpty
                    else { continue }
                    continuation.yield(Event(userId: userId, name: name))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return (channel, stream)
    }

    /// `via` is the conversation's own watch channel. `channel(topic)` hands
    /// back the registered channel for a topic, so opening this topic again
    /// returned the watcher, and unsubscribing it afterwards ended the watch:
    /// after typing once, you stopped seeing anyone else type.
    static func send(topic: String, userId: String, name: String, via: RealtimeChannelV2? = nil) async {
        let payload = Payload(userId: userId, name: name)
        if let via, via.status == .subscribed {
            try? await via.broadcast(event: "typing", message: payload)
            return
        }
        let channel = SupabaseManager.client.channel(topic)
        await channel.subscribe()
        try? await channel.broadcast(event: "typing", message: payload)
        await SupabaseManager.client.removeChannel(channel)
    }
}
