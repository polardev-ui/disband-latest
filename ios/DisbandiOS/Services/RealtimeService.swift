import Foundation
import Supabase
import Realtime

/// Live Postgres-change subscriptions over Supabase Realtime v2.
///
/// Usage: hold the returned `RealtimeChannelV2` and iterate the stream; cancel
/// the iterating task and call `await channel.unsubscribe()` when done.
enum RealtimeService {
    private static var client: SupabaseClient { SupabaseManager.client }

    /// Observe INSERTs on `table` (optionally filtered, e.g. "channel_id=eq.<id>")
    /// decoding each new row into `T`.
    static func observeInserts<T: Decodable & Sendable>(
        table: String,
        filter: String? = nil,
        as _: T.Type
    ) async -> (channel: RealtimeChannelV2, stream: AsyncStream<T>) {
        let topic = "rt:\(table):\(filter ?? "all"):\(UUID().uuidString.prefix(8))"
        let channel = client.channel(topic)
        let changes = channel.postgresChange(
            InsertAction.self, schema: "public", table: table, filter: filter
        )
        await channel.subscribe()

        let stream = AsyncStream<T> { continuation in
            let task = Task {
                let decoder = JSONDecoder()
                for await change in changes {
                    if let row = try? change.decodeRecord(decoder: decoder) as T {
                        continuation.yield(row)
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return (channel, stream)
    }
}
