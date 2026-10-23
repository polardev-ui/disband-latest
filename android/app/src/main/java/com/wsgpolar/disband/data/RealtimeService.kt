package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.flow.merge
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.decodeFromJsonElement
import java.util.UUID

/**
 * Live Postgres-change subscriptions over Supabase Realtime, mirroring the iOS
 * `RealtimeService`. Holds the returned channel + flow; cancel the consuming
 * task and call `channel.unsubscribe()` when done.
 */
object RealtimeService {
    private val client get() = DisbandSupabase.client
    private val json get() = DisbandSupabase.sessionJson

    /**
     * Observe INSERTs on [table] (optionally filtered, e.g. "channel_id=eq.<id>"),
     * decoding each new row into [T].
     */
    suspend fun <T> observeInserts(
        table: String,
        filter: String? = null,
        serializer: KSerializer<T>,
    ): LiveChannel<T> {
        val topic = "rt:$table:${filter ?: "all"}:${UUID.randomUUID().toString().take(8)}"
        val channel = client.channel(topic) { }
        val insertFlow = channel.postgresChangeFlow<PostgresAction.Insert>("public") {
            this.table = table
            filter?.let { this.filter = it }
        }
        channel.subscribe()
        val flow = insertFlow.map { action ->
            json.decodeFromJsonElement(serializer, action.record)
        }
        return LiveChannel(channel, flow)
    }

    /** Deletes only carry their primary key under RLS; discard unknown ids in the timeline. */
    suspend fun <T> observeMessages(
        table: String,
        filter: String,
        serializer: KSerializer<T>,
    ): LiveChannel<MessageChange<T>> {
        val channel = client.channel("chat:$table:${UUID.randomUUID()}") { }
        val inserts = channel.postgresChangeFlow<PostgresAction.Insert>("public") {
            this.table = table
            this.filter = filter
        }.map { MessageChange.Upsert(json.decodeFromJsonElement(serializer, it.record)) }
        val updates = channel.postgresChangeFlow<PostgresAction.Update>("public") {
            this.table = table
            this.filter = filter
        }.map { MessageChange.Upsert(json.decodeFromJsonElement(serializer, it.record)) }
        val deletes = channel.postgresChangeFlow<PostgresAction.Delete>("public") {
            this.table = table
        }.map { MessageChange.Removed(it.oldRecord["id"]?.jsonPrimitive?.content.orEmpty()) }
        channel.subscribe(blockUntilSubscribed = true)
        return LiveChannel(channel, merge(inserts, updates, deletes))
    }

    /**
     * Observe any change (insert/update/delete) on [table], emitting a tick per
     * change. Use when the reaction is "go re-read the row".
     */
    suspend fun observeChanges(table: String, filter: String? = null): LiveChannel<Unit> {
        val topic = "rt-any:$table:${filter ?: "all"}:${UUID.randomUUID().toString().take(8)}"
        val channel = client.channel(topic) { }
        val insert = channel.postgresChangeFlow<PostgresAction.Insert>("public") {
            this.table = table
            filter?.let { this.filter = it }
        }
        val update = channel.postgresChangeFlow<PostgresAction.Update>("public") {
            this.table = table
            filter?.let { this.filter = it }
        }
        val delete = channel.postgresChangeFlow<PostgresAction.Delete>("public") {
            this.table = table
            filter?.let { this.filter = it }
        }
        channel.subscribe()
        val tick = merge(insert, update, delete).map { }
        return LiveChannel(channel, tick)
    }
}

class LiveChannel<T>(
    val channel: RealtimeChannel,
    val flow: Flow<T>,
)
sealed interface MessageChange<out T> {
    data class Upsert<T>(val message: T) : MessageChange<T>
    data class Removed(val id: String) : MessageChange<Nothing>
}
