package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.broadcast
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable

/**
 * Typing indicators over Supabase broadcast.
 *
 * Android had a typing bubble and nothing to put in it: `typingUsers` was
 * hard-wired to an empty list and nothing ever broadcast, so an Android user
 * neither saw anyone typing nor showed as typing to anyone else. Web and iOS
 * had been talking to each other about it the whole time.
 *
 * Interoperable by construction: the same topics (`typing:ch|dm|group:{id}`)
 * and the same payload keys (`userId`, `name`) as the web and iOS clients.
 * Change one and change all three, or the clients stop seeing each other.
 */
object TypingService {

    @Serializable
    data class Payload(val userId: String, val name: String)

    data class Event(val userId: String, val name: String)

    private val client get() = DisbandSupabase.client

    fun topic(kind: String, id: String): String = "typing:$kind:$id"

    /**
     * Listen for typing on a conversation.
     *
     * The caller owns the returned channel and must unsubscribe when the
     * screen goes away.
     */
    suspend fun watch(topic: String): Pair<RealtimeChannel, Flow<Payload>> {
        val channel = client.channel(topic) { broadcast { } }
        val flow = channel.broadcastFlow<Payload>("typing")
        channel.subscribe(blockUntilSubscribed = true)
        return channel to flow
    }

    /**
     * Say that this user is typing.
     *
     * `blockUntilSubscribed` is not optional here. supabase-kt's `subscribe()`
     * returns before the JOIN completes, and a broadcast sent on a channel
     * that has not joined yet is dropped without error — the same trap that
     * made a desktop-to-Android call connect on the phone and hang forever on
     * the PC. A dropped typing frame is far less serious, but it is the same
     * silence, and it is the reason a "fire and forget" version of this would
     * look like it worked while sending nothing.
     *
     * Best-effort throughout: nobody should see an error because a typing
     * ping failed.
     */
    suspend fun send(topic: String, userId: String, name: String) {
        runCatching {
            val channel = client.channel(topic) { broadcast { acknowledgeBroadcasts = false } }
            withTimeoutOrNull(4_000) { channel.subscribe(blockUntilSubscribed = true) }
            try {
                channel.broadcast("typing", Payload(userId = userId, name = name))
                // Let the frame reach the socket before tearing the channel
                // down; unsubscribing immediately can cut it short.
                kotlinx.coroutines.delay(80)
            } finally {
                runCatching { channel.unsubscribe() }
                runCatching { client.realtime.removeChannel(channel) }
            }
        }
    }
}
