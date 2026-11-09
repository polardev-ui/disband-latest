package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.BotCommand
import com.wsgpolar.disband.data.BotCommandOption
import com.wsgpolar.disband.data.BotService
import com.wsgpolar.disband.ui.AvatarImage
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Typing "/" in a channel lists the space's bot commands; picking one opens
 * a dialog for its options, and Send asks the bot to run it.
 */
@Composable
fun BotCommandBar(serverId: String, channelId: String, draft: String, clear: () -> Unit) {
    val palette = LocalPalette.current
    var commands by remember(serverId) { mutableStateOf<List<BotCommand>>(emptyList()) }
    var running by remember(channelId) { mutableStateOf<BotCommand?>(null) }

    val typingCommand = draft.startsWith("/") && !draft.contains(' ') && !draft.contains('\n')
    LaunchedEffect(serverId, typingCommand) {
        if (typingCommand) commands = BotService.commands(serverId)
    }

    running?.let { cmd ->
        BotCommandDialog(cmd, serverId, channelId, onDismiss = { running = null })
    }

    if (!typingCommand) return
    val q = draft.drop(1).lowercase()
    val matches = commands.filter { q.isEmpty() || it.name.startsWith(q) }.take(25)
    if (matches.isEmpty()) return

    LazyColumn(
        Modifier
            .padding(horizontal = 10.dp)
            .fillMaxWidth()
            .heightIn(max = 260.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(palette.surface)
            .border(1.dp, palette.divider, RoundedCornerShape(16.dp)),
    ) {
        items(matches, key = { it.botId + "/" + it.name }) { cmd ->
            Row(
                Modifier.fillMaxWidth()
                    .clickable { clear(); running = cmd }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AvatarImage(url = cmd.botAvatarUrl, name = cmd.botName, size = 28.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("/" + cmd.name, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(cmd.description, color = palette.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.width(8.dp))
                Text(cmd.botName, color = palette.textMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

@Composable
private fun BotCommandDialog(command: BotCommand, serverId: String, channelId: String, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val values = remember(command) { mutableStateMapOf<String, String>() }
    var running by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val ready = command.options.all { !it.required || values[it.name].orEmpty().isNotBlank() }

    AlertDialog(
        onDismissRequest = { if (!running) onDismiss() },
        containerColor = palette.surfaceRaised,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AvatarImage(url = command.botAvatarUrl, name = command.botName, size = 32.dp)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("/" + command.name, color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    Text(command.botName, color = palette.textMuted, fontSize = 12.sp)
                }
            }
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (command.description.isNotBlank()) Text(command.description, color = palette.textSecondary, fontSize = 14.sp)
                command.options.forEach { option -> OptionField(option, values[option.name].orEmpty()) { values[option.name] = it } }
                error?.let { Text(it, color = Brand.dnd, fontSize = 13.sp) }
            }
        },
        confirmButton = {
            if (running) CircularProgressIndicator(color = palette.accent, strokeWidth = 2.dp, modifier = Modifier.padding(8.dp).width(20.dp))
            else TextButton(enabled = ready, onClick = {
                running = true
                error = null
                scope.launch {
                    try {
                        val options = mutableMapOf<String, JsonElement>()
                        command.options.forEach { o ->
                            BotService.value(o, values[o.name].orEmpty(), serverId)?.let { options[o.name] = it }
                        }
                        BotService.run(command, channelId, JsonObject(options))
                        onDismiss()
                    } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                    catch (e: Exception) { error = e.message ?: "That didn't work. Try again." }
                    running = false
                }
            }) { Text("Send", color = if (ready) palette.accent else palette.textMuted, fontWeight = FontWeight.SemiBold) }
        },
        dismissButton = {
            TextButton(enabled = !running, onClick = onDismiss) { Text("Cancel", color = palette.textSecondary) }
        },
    )
}

@Composable
private fun OptionField(option: BotCommandOption, value: String, onChange: (String) -> Unit) {
    val palette = LocalPalette.current
    val label = if (option.required) option.name else "${option.name} (optional)"
    val choices = option.choices.orEmpty().mapNotNull { c ->
        runCatching { c.name to c.value.jsonPrimitive.contentOrNull.orEmpty() }.getOrNull()
    } + if (option.type == "boolean") listOf("True" to "true", "False" to "false") else emptyList()

    Column {
        Text(label, color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        if (choices.isNotEmpty()) {
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                choices.take(6).forEach { (name, v) ->
                    val on = value == v
                    Text(
                        name,
                        color = if (on) palette.accent else palette.textSecondary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(if (on) palette.accent.copy(alpha = 0.15f) else palette.surface)
                            .clickable { onChange(if (on) "" else v) }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }
        } else {
            OutlinedTextField(
                value = value,
                onValueChange = onChange,
                placeholder = { Text(option.description, color = palette.textMuted, fontSize = 13.sp) },
                singleLine = option.type != "string",
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
