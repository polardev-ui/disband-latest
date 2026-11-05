package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.leave
import com.wsgpolar.disband.data.Poll
import com.wsgpolar.disband.data.PollService
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.broadcast
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.channel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlin.math.roundToInt

/** A poll in a message: tap to vote, counts update live. Matches the web's PollCard. */
@Composable
fun PollCard(pollId: String) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val me = remember { runCatching { DisbandSupabase.auth.currentUserOrNull()?.id }.getOrNull() }
    var poll by remember(pollId) { mutableStateOf<Poll?>(null) }
    var error by remember(pollId) { mutableStateOf<String?>(null) }
    var busy by remember(pollId) { mutableStateOf(false) }
    var channel by remember(pollId) { mutableStateOf<RealtimeChannel?>(null) }

    suspend fun load() {
        runCatching { PollService.get(pollId) }
            .onSuccess { poll = it; error = null }
            .onFailure { if (poll == null) error = "This poll couldn't be loaded." }
    }

    LaunchedEffect(pollId) {
        load()
        val ch = DisbandSupabase.client.channel(PollService.topic(pollId)) { broadcast { } }
        val changes = ch.broadcastFlow<JsonObject>("changed")
        val pump = launch { changes.collect { if (!busy) load() } }
        runCatching { ch.subscribe() }
        channel = ch
        try {
            kotlinx.coroutines.awaitCancellation()
        } finally {
            pump.cancel()
            channel = null
            kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) { runCatching { ch.leave() } }
        }
    }

    fun act(failure: String, call: suspend () -> Poll) {
        if (busy) return
        busy = true
        scope.launch {
            runCatching { call() }
                .onSuccess {
                    poll = it
                    error = null
                    runCatching { channel?.broadcast("changed", JsonObject(emptyMap())) }
                }
                .onFailure { error = failure }
            busy = false
        }
    }

    Column(
        Modifier
            .padding(top = 6.dp)
            .widthIn(max = 320.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(palette.elevated)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val p = poll
        if (p == null) {
            if (error == null) {
                Box(Modifier.fillMaxWidth().height(60.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                }
            }
        } else {
            Row(verticalAlignment = Alignment.Top) {
                Text(p.question, color = palette.textPrimary, fontWeight = FontWeight.SemiBold, fontSize = 15.sp,
                    modifier = Modifier.weight(1f))
                if (p.authorId != null && p.authorId == me && !p.closed) {
                    TextButton(onClick = { act("Couldn't close the poll.") { PollService.close(pollId) } }, enabled = !busy) {
                        Text("Close", fontSize = 12.sp, color = palette.textMuted)
                    }
                }
            }
            val total = p.totalVotes
            val leading = p.options.indices.maxOfOrNull { p.count(it) } ?: 0
            p.options.forEachIndexed { index, label ->
                val votes = p.count(index)
                val share = if (total > 0) votes.toFloat() / total else 0f
                val mine = p.myVote == index
                val winning = p.closed && votes == leading && votes > 0
                val accent = if (mine) palette.accent else palette.textMuted
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(palette.surface)
                        .border(1.dp, if (mine) palette.accent else androidx.compose.ui.graphics.Color.Transparent, RoundedCornerShape(8.dp))
                        .clickable(enabled = !p.closed && !busy, role = Role.Button) {
                            act("Couldn't record your vote.") { PollService.vote(pollId, index) }
                        },
                ) {
                    Box(Modifier.matchParentSize()) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth(share).background(accent.copy(alpha = 0.18f)))
                    }
                    Row(
                        Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            if (mine) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                            contentDescription = null,
                            tint = accent,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(label, color = palette.textPrimary, fontSize = 14.sp,
                            fontWeight = if (winning) FontWeight.Bold else FontWeight.Normal,
                            maxLines = 2, modifier = Modifier.weight(1f))
                        Text("${(share * 100).roundToInt()}%", color = palette.textMuted, fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            val votes = "$total ${if (total == 1) "vote" else "votes"}"
            Text(if (p.closed) "$votes · Poll closed" else votes, color = palette.textMuted, fontSize = 12.sp)
        }
        error?.let { Text(it, color = Brand.dnd, fontSize = 12.sp) }
    }
}

/** Ask a question with 2–10 answers. Sent as a message, as on the web and iOS. */
@Composable
fun PollCreateDialog(onDismiss: () -> Unit, onCreated: (String) -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var question by remember { mutableStateOf("") }
    val options = remember { mutableStateListOf("", "") }
    var creating by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val answers = options.map { it.trim() }.filter { it.isNotEmpty() }
    val canCreate = question.isNotBlank() && answers.size >= 2 && !creating

    AlertDialog(
        onDismissRequest = { if (!creating) onDismiss() },
        title = { Text("Create a poll") },
        text = {
            LazyColumn(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    OutlinedTextField(
                        value = question,
                        onValueChange = { question = it.take(200) },
                        label = { Text("Question") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                itemsIndexed(options) { index, value ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = value,
                            onValueChange = { options[index] = it.take(100) },
                            label = { Text("Answer ${index + 1}") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        if (options.size > 2) {
                            IconButton(onClick = { options.removeAt(index) }) {
                                Icon(Icons.Filled.RemoveCircle, contentDescription = "Remove answer ${index + 1}", tint = Brand.dnd)
                            }
                        }
                    }
                }
                if (options.size < PollService.MAX_OPTIONS) {
                    item { TextButton(onClick = { options.add("") }) { Text("Add an answer") } }
                }
                error?.let { item { Text(it, color = Brand.dnd, fontSize = 12.sp) } }
            }
        },
        confirmButton = {
            TextButton(
                enabled = canCreate,
                onClick = {
                    creating = true
                    scope.launch {
                        runCatching { PollService.create(question.trim(), answers) }
                            .onSuccess { onCreated(it.id); onDismiss() }
                            .onFailure { error = "Couldn't create the poll. Try again." }
                        creating = false
                    }
                },
            ) { Text(if (creating) "Posting…" else "Post") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !creating) { Text("Cancel", color = palette.textMuted) } },
    )
}
