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

    /// Observe DELETEs on `table`, yielding the deleted row's primary key.
    ///
    /// The filter is intentionally optional and the callers below pass `nil`:
    /// Supabase only carries the old row's primary key unless the table uses
    /// `REPLICA IDENTITY FULL`, so a `channel_id=eq.…` filter would never
    /// match a delete and the event would be dropped silently.
    static func observeDeletes(
        table: String,
        filter: String? = nil
    ) async -> (channel: RealtimeChannelV2, stream: AsyncStream<String>) {
        let topic = "rt-del:\(table):\(UUID().uuidString.prefix(8))"
        let channel = client.channel(topic)
        let changes = channel.postgresChange(
            DeleteAction.self, schema: "public", table: table, filter: filter
        )
        await channel.subscribe()

        let stream = AsyncStream<String> { continuation in
            let task = Task {
                for await change in changes {
                    if case let .string(id) = change.oldRecord["id"] {
                        continuation.yield(id)
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return (channel, stream)
    }

    /// Observe *any* change (insert, update, delete) on `table`, emitting a tick
    /// per change. Use when the reaction is "go re-read the row" rather than
    /// decoding the payload — an UPDATE is what carries a plan upgrade, so
    /// insert-only subscriptions would miss it.
    static func observeChanges(
        table: String,
        filter: String? = nil
    ) async -> (channel: RealtimeChannelV2, stream: AsyncStream<Void>) {
        let topic = "rt-any:\(table):\(filter ?? "all"):\(UUID().uuidString.prefix(8))"
        let channel = client.channel(topic)
        let changes = channel.postgresChange(
            AnyAction.self, schema: "public", table: table, filter: filter
        )
        await channel.subscribe()

        let stream = AsyncStream<Void> { continuation in
            let task = Task {
                for await _ in changes {
                    continuation.yield(())
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return (channel, stream)
    }
}

/**
 Channels that are rejoined under the same topic.

 `client.channel(topic)` hands back whatever channel is still registered for
 that topic, and a channel stays registered until the server confirms it has
 left. Every "stop, then start again" path (presence on foreground, a voice
 room left and rejoined, a chat closed and reopened) let go of the old channel
 in a background task and asked for the topic straight away, so it got the
 old channel back: already subscribed, so the new listeners were refused, and
 then unsubscribed underneath it by the old teardown. Presence came back with
 nobody in it but you ("1 Online" in a space where the desktop shows eleven),
 and a rejoined voice room heard no signals.

 `release` queues the teardown per topic; `channel` waits for any queued
 teardown of the same topic before creating the new one.
 */
@MainActor
enum RealtimeTopics {
    private static var teardowns: [String: Task<Void, Never>] = [:]

    private static func key(_ topic: String) -> String {
        topic.hasPrefix("realtime:") ? topic : "realtime:\(topic)"
    }

    /// Unsubscribe and remove `channel`, queued behind any earlier teardown of its topic.
    static func release(_ channel: RealtimeChannelV2?) {
        guard let channel else { return }
        let topic = key(channel.topic)
        let previous = teardowns[topic]
        let task = Task { @MainActor in
            await previous?.value
            await channel.unsubscribe()
            await SupabaseManager.client.removeChannel(channel)
        }
        teardowns[topic] = task
        Task { @MainActor in
            await task.value
            if teardowns[topic] == task { teardowns[topic] = nil }
        }
    }

    /// A channel for `topic` that no earlier teardown can take down.
    static func channel(
        _ topic: String,
        options: @escaping @Sendable (inout RealtimeChannelConfig) -> Void = { _ in }
    ) async -> RealtimeChannelV2 {
        if let pending = teardowns[key(topic)] {
            // Bounded: a teardown whose reply never comes must not stop the
            // new channel from ever being made.
            _ = await withTaskGroup(of: Void.self) { group in
                group.addTask { await pending.value }
                group.addTask { try? await Task.sleep(for: .seconds(3)) }
                await group.next()
                group.cancelAll()
            }
        }
        let client = SupabaseManager.client
        let channel = client.channel(topic, options: options)
        // Still the old one (its teardown timed out): drop it and start clean.
        if channel.status != .unsubscribed {
            await client.removeChannel(channel)
            return client.channel(topic, options: options)
        }
        return channel
    }
}
