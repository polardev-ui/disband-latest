package com.wsgpolar.disband.ui.calls

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Headset
import androidx.compose.material.icons.filled.HeadsetOff
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.call.StageInfo
import com.wsgpolar.disband.call.VoiceMember
import com.wsgpolar.disband.call.VoicePhase
import com.wsgpolar.disband.call.VoiceRoom
import com.wsgpolar.disband.call.VoiceSession
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Channel
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.AvatarImage
import com.wsgpolar.disband.ui.collectAsStateValue
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/**
 * A voice channel or stage: who's there and a button to join, then the call
 * itself. A stage shows its topic, speakers and audience, and lets the
 * audience raise a hand; moderators run it from here. Mirrors iOS.
 */
@Composable
fun VoiceStageView(
    app: AppState,
    channel: Channel,
    onMinimize: () -> Unit,
    onBack: () -> Unit,
) {
    val voice = app.voice
    val phase by voice.phase.collectAsStateValue()
    val room by voice.room.collectAsStateValue()
    val error by voice.error.collectAsStateValue()
    val joined = phase != VoicePhase.Idle && room?.channelId == channel.id

    BackHandler(onBack = onMinimize)

    if (joined) InCall(app, voice, channel, onMinimize)
    else Lobby(app, voice, channel, onBack)

    error?.let { message ->
        AlertDialog(
            onDismissRequest = { voice.clearError() },
            confirmButton = { TextButton(onClick = { voice.clearError() }) { Text("OK") } },
            text = { Text(message) },
        )
    }
}

// MARK: - Lobby

@Composable
private fun Lobby(app: AppState, voice: VoiceSession, channel: Channel, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val isStage = channel.isStage == true
    var members by remember { mutableStateOf<List<VoiceMember>>(emptyList()) }
    var stage by remember { mutableStateOf<StageInfo?>(null) }
    var joining by remember { mutableStateOf(false) }
    val phase by voice.phase.collectAsStateValue()
    LaunchedEffect(phase) { if (phase == VoicePhase.Idle) joining = false }

    LaunchedEffect(channel.id) {
        while (isActive) {
            runCatching { VoiceSession.fetchMembers(channel.id) }.getOrNull()?.let { members = it }
            if (isStage) app.currentUserId?.let { uid -> stage = VoiceSession.fetchStage(channel.id, uid, moderator = false) }
            delay(4_000)
        }
    }

    val join = rememberAudioPermissionTrigger(onDenied = {}) {
        joining = true
        val server = app.servers.value.firstOrNull { it.id == channel.serverId }
        voice.join(VoiceRoom(channel.id, channel.name, channel.serverId, server?.name.orEmpty()))
    }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        TopBar(
            title = channel.name,
            subtitle = if (isStage) "Stage" else "Voice channel",
            icon = if (isStage) Icons.Filled.Podcasts else Icons.Filled.GraphicEq,
            onBack = onBack,
        )
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                val speakers = members.count { it.stageSpeaker }
                val summary = when {
                    isStage -> (stage?.topic?.takeIf { stage?.isLive == true } ?: "This stage hasn't started yet.") +
                        "\n$speakers speaking · ${members.size - speakers} listening. You'll join the audience, muted."
                    members.isEmpty() -> "No one's here yet — be the first."
                    else -> "${members.size} here"
                }
                Text(summary, color = palette.textSecondary, fontSize = 15.sp,
                    modifier = Modifier.padding(bottom = 8.dp))
            }
            items(members, key = { it.userId }) { member -> MemberRow(member, speaking = false) }
        }
        Box(Modifier.fillMaxWidth().background(palette.surface).navigationBarsPadding().padding(16.dp)) {
            Button(
                onClick = join,
                enabled = !joining,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = Brand.online, contentColor = Color.White),
            ) {
                if (joining) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                else Text(if (isStage) "Join Stage" else "Join Voice", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            }
        }
    }
}

// MARK: - In call

@Composable
private fun InCall(app: AppState, voice: VoiceSession, channel: Channel, onMinimize: () -> Unit) {
    val palette = LocalPalette.current
    val phase by voice.phase.collectAsStateValue()
    val members by voice.members.collectAsStateValue()
    val speaking by voice.speaking.collectAsStateValue()
    val connected by voice.connectedPeers.collectAsStateValue()
    val micMuted by voice.micMuted.collectAsStateValue()
    val deafened by voice.deafened.collectAsStateValue()
    val speakerOn by voice.speakerOn.collectAsStateValue()
    val stage by voice.stage.collectAsStateValue()
    val connectedAt by voice.connectedAt.collectAsStateValue()
    val me = app.currentUserId
    // Recomposed with members, so `canSpeak` stays current.
    val canSpeak = stage == null || members.firstOrNull { it.userId == me }?.stageSpeaker == true

    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (isActive) { delay(1_000); now = System.currentTimeMillis() } }
    val others = members.count { it.userId != me }
    val status = when {
        phase == VoicePhase.Connecting -> "Connecting…"
        stage != null -> "Stage"
        others == 0 -> "Waiting for others…"
        connected.isEmpty() -> "Connecting to $others ${if (others == 1) "person" else "people"}…"
        else -> connectedAt?.let { formatElapsed((now - it) / 1000) } ?: ""
    }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        TopBar(
            title = channel.name,
            subtitle = status,
            icon = if (stage != null) Icons.Filled.Podcasts else Icons.Filled.GraphicEq,
            onBack = onMinimize,
        ) {
            IconButton(onClick = { voice.toggleSpeaker() }) {
                Icon(if (speakerOn) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
                    contentDescription = if (speakerOn) "Use earpiece" else "Use speaker",
                    tint = palette.textPrimary)
            }
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            val currentStage = stage
            if (currentStage != null) {
                StageBody(voice, currentStage, members, speaking, me, micMuted)
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(members, key = { it.userId }) { member ->
                        val isMe = member.userId == me
                        MemberRow(
                            member.copy(muted = if (isMe) micMuted else member.muted,
                                deafened = if (isMe) deafened else member.deafened),
                            speaking = member.userId in speaking,
                            you = isMe,
                            connecting = !isMe && member.userId !in connected,
                        )
                    }
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().background(palette.surface).navigationBarsPadding()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val currentStage = stage
            when {
                canSpeak -> {
                    ControlButton(if (micMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                        if (micMuted) "Unmute" else "Mute", alert = micMuted) { voice.toggleMute() }
                    if (currentStage != null && me != null) {
                        ControlButton(Icons.Filled.ArrowDownward, "Audience") { voice.moveToAudience(me) }
                    }
                }
                currentStage?.isModerator == true && me != null ->
                    ControlButton(Icons.Filled.RecordVoiceOver, "Speak") { voice.inviteToSpeak(me) }
                else -> {
                    val raised = members.firstOrNull { it.userId == me }?.handRaised == true
                    val allowed = currentStage?.requestsEnabled != false
                    ControlButton(Icons.Filled.PanTool, if (raised) "Lower Hand" else "Raise Hand",
                        highlight = raised, dimmed = !allowed && !raised) {
                        voice.setHandRaised(!raised)
                    }
                }
            }
            ControlButton(if (deafened) Icons.Filled.HeadsetOff else Icons.Filled.Headset,
                if (deafened) "Undeafen" else "Deafen", alert = deafened) { voice.toggleDeafen() }
            ControlButton(Icons.Filled.CallEnd, "Leave", alert = true, big = true) { voice.leave() }
        }
    }
}

// MARK: - Stage

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StageBody(
    voice: VoiceSession,
    stage: StageInfo,
    members: List<VoiceMember>,
    speaking: Set<String>,
    me: String?,
    micMuted: Boolean,
) {
    val palette = LocalPalette.current
    val speakers = members.filter { it.stageSpeaker }
    val audience = members.filterNot { it.stageSpeaker }
    val hands = audience.filter { it.handRaised }.sortedBy { it.handRaisedAt }
    val invited = members.firstOrNull { it.userId == me }?.stageInvited == true
    var editingTopic by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(palette.surfaceRaised).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (stage.isLive) {
                        Text("LIVE", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black,
                            modifier = Modifier.clip(CircleShape).background(Brand.online).padding(horizontal = 7.dp, vertical = 2.dp))
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("${speakers.size} speaking · ${audience.size} listening",
                        color = palette.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f))
                    if (stage.isModerator) {
                        Box {
                            IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Filled.MoreVert, contentDescription = "Stage settings", tint = palette.textPrimary)
                            }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                if (stage.isLive) {
                                    DropdownMenuItem(text = { Text("Edit Topic") }, onClick = {
                                        menuOpen = false
                                        editingTopic = true
                                    })
                                }
                                DropdownMenuItem(
                                    text = { Text("Allow requests to speak") },
                                    trailingIcon = { Switch(checked = stage.requestsEnabled, onCheckedChange = null) },
                                    onClick = { voice.setStageRequests(!stage.requestsEnabled) },
                                )
                                if (stage.isLive) {
                                    DropdownMenuItem(text = { Text("End Stage", color = Brand.dnd) }, onClick = {
                                        menuOpen = false
                                        voice.endStage()
                                    })
                                }
                            }
                        }
                    }
                }
                if (stage.isLive && stage.topic != null) {
                    Text(stage.topic, color = palette.textPrimary, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                } else {
                    Text(if (stage.isModerator) "This stage hasn't started yet." else "Waiting for the Stage to start.",
                        color = palette.textSecondary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    if (stage.isModerator) {
                        Button(
                            onClick = { editingTopic = true },
                            shape = CircleShape,
                            colors = ButtonDefaults.buttonColors(containerColor = Brand.online, contentColor = Color.White),
                        ) { Text("Start the Stage", fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
        }

        if (invited) item {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(palette.accent.copy(alpha = 0.18f))
                    .border(1.dp, palette.accent, RoundedCornerShape(20.dp)).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("You've been invited to speak.", color = palette.textPrimary, fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextButton(onClick = { voice.respondToInvite(false) }, modifier = Modifier.weight(1f)) { Text("Decline") }
                    Button(
                        onClick = { voice.respondToInvite(true) }, modifier = Modifier.weight(1f), shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(containerColor = Brand.online, contentColor = Color.White),
                    ) { Text("Accept") }
                }
            }
        }

        item {
            SectionTitle(if (speakers.isEmpty()) "Speakers" else "Speakers — ${speakers.size}")
            if (speakers.isEmpty()) {
                Text("Nobody is on stage yet.", color = palette.textMuted, fontSize = 14.sp)
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    speakers.forEach { member ->
                        StagePerson(voice, stage, member, 68.dp, member.userId in speaking,
                            muted = if (member.userId == me) micMuted else member.muted, me = me)
                    }
                }
            }
        }

        if (stage.isModerator && hands.isNotEmpty()) item {
            SectionTitle("Requests — ${hands.size}")
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                hands.forEach { member ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(palette.surfaceRaised)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AvatarImage(url = member.profile?.avatarUrl, name = member.name, size = 34.dp)
                        Spacer(Modifier.width(10.dp))
                        Text(member.name, color = palette.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f))
                        TextButton(onClick = { voice.moveToAudience(member.userId) }) { Text("Dismiss") }
                        Button(
                            onClick = { voice.inviteToSpeak(member.userId) }, shape = CircleShape,
                            colors = ButtonDefaults.buttonColors(containerColor = Brand.online, contentColor = Color.White),
                        ) { Text("Invite") }
                    }
                }
            }
        }

        if (audience.isNotEmpty()) item {
            SectionTitle("Audience — ${audience.size}")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                audience.forEach { member ->
                    StagePerson(voice, stage, member, 50.dp, speaking = false, muted = false, me = me)
                }
            }
        }
    }

    if (editingTopic) {
        var draft by remember { mutableStateOf(if (stage.isLive) stage.topic.orEmpty() else "") }
        AlertDialog(
            onDismissRequest = { editingTopic = false },
            title = { Text(if (stage.isLive) "Edit Topic" else "Start the Stage") },
            text = {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it.take(120) },
                    placeholder = { Text("What will you be talking about today?") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(enabled = draft.isNotBlank(), onClick = {
                    editingTopic = false
                    voice.startStage(draft.trim())
                }) { Text(if (stage.isLive) "Save" else "Start") }
            },
            dismissButton = { TextButton(onClick = { editingTopic = false }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun StagePerson(
    voice: VoiceSession,
    stage: StageInfo,
    member: VoiceMember,
    size: Dp,
    speaking: Boolean,
    muted: Boolean,
    me: String?,
) {
    val palette = LocalPalette.current
    val isMe = member.userId == me
    var menu by remember { mutableStateOf(false) }
    val actions = buildList<Pair<String, () -> Unit>> {
        if (stage.isModerator) {
            if (member.stageSpeaker) add("Move to Audience" to { voice.moveToAudience(member.userId) })
            else if (!member.stageInvited) add((if (isMe) "Become a Speaker" else "Invite to Speak") to { voice.inviteToSpeak(member.userId) })
            if (!isMe) add("Disconnect from Stage" to { voice.disconnectFromStage(member.userId) })
        } else if (isMe && member.stageSpeaker) {
            add("Move to Audience" to { voice.moveToAudience(member.userId) })
        }
    }
    Box {
        Column(
            Modifier.widthIn(max = size + 24.dp)
                .combinedClickable(onClick = { if (actions.isNotEmpty()) menu = true }, onLongClick = { if (actions.isNotEmpty()) menu = true }),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box {
                AvatarImage(url = member.profile?.avatarUrl, name = member.name, size = size)
                if (speaking) Box(Modifier.size(size).border(3.dp, Brand.online, CircleShape))
                val badge = when {
                    member.stageSpeaker && muted -> Icons.Filled.MicOff to Brand.dnd
                    member.handRaised -> Icons.Filled.PanTool to palette.accent
                    else -> null
                }
                badge?.let { (icon, color) ->
                    Box(
                        Modifier.align(Alignment.BottomEnd).size(22.dp).clip(CircleShape).background(color),
                        contentAlignment = Alignment.Center,
                    ) { Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp)) }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(if (isMe) "${member.name} (you)" else member.name, color = palette.textSecondary, fontSize = 12.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            actions.forEach { (label, run) ->
                DropdownMenuItem(
                    text = { Text(label, color = if (label.startsWith("Disconnect")) Brand.dnd else Color.Unspecified) },
                    onClick = { menu = false; run() },
                )
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(title.uppercase(), color = LocalPalette.current.textMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(bottom = 10.dp))
}

// MARK: - Shared pieces

@Composable
private fun TopBar(
    title: String,
    subtitle: String,
    icon: ImageVector,
    onBack: () -> Unit,
    trailing: @Composable () -> Unit = {},
) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().background(palette.surface).statusBarsPadding().height(56.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.textPrimary)
        }
        Icon(icon, contentDescription = null, tint = palette.accent)
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Text(title, color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, color = palette.textMuted, fontSize = 12.sp, maxLines = 1)
        }
        trailing()
    }
    HorizontalDivider(color = palette.divider)
}

@Composable
private fun MemberRow(member: VoiceMember, speaking: Boolean, you: Boolean = false, connecting: Boolean = false) {
    val palette = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(palette.surfaceRaised)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            AvatarImage(url = member.profile?.avatarUrl, name = member.name, size = 40.dp)
            if (speaking) Box(Modifier.size(40.dp).border(2.dp, Brand.online, CircleShape))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(if (you) "${member.name} (you)" else member.name, color = palette.textPrimary, fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (connecting) Text("Connecting…", color = palette.textMuted, fontSize = 12.sp)
        }
        when {
            member.deafened -> Icon(Icons.Filled.HeadsetOff, contentDescription = "Deafened", tint = Brand.dnd, modifier = Modifier.size(18.dp))
            member.muted -> Icon(Icons.Filled.MicOff, contentDescription = "Muted", tint = palette.textMuted, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun ControlButton(
    icon: ImageVector,
    label: String,
    alert: Boolean = false,
    highlight: Boolean = false,
    dimmed: Boolean = false,
    big: Boolean = false,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    val size = if (big) 64.dp else 52.dp
    val background = when {
        alert -> Brand.dnd
        highlight -> palette.accent
        else -> palette.surfaceRaised
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.then(if (dimmed) Modifier.background(Color.Transparent) else Modifier)) {
        IconButton(onClick = onClick, modifier = Modifier.size(size).clip(CircleShape).background(background.copy(alpha = if (dimmed) 0.45f else 1f))) {
            Icon(icon, contentDescription = label, tint = if (alert || highlight) Color.White else palette.textPrimary,
                modifier = Modifier.size(24.dp))
        }
        Spacer(Modifier.size(4.dp))
        Text(label, color = palette.textSecondary, fontSize = 11.sp)
    }
}

private fun formatElapsed(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
