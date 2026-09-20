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

    static func send(topic: String, userId: String, name: String) async {
        let channel = SupabaseManager.client.channel(topic)
        await channel.subscribe()
        try? await channel.broadcast(event: "typing", message: Payload(userId: userId, name: name))
        await channel.unsubscribe()
    }
}
