package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.Palette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.data.AttachmentType
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.ui.AvatarImage

/** Display row for any message kind (DM / channel / group). */
data class ChatRow(
    val id: String,
    val author: Profile?,
    val content: String,
    val attachmentType: AttachmentType?,
    val createdAt: String,
)

private fun ChatRow.isMine(ownUserId: String?): Boolean = ownUserId != null && author?.id == ownUserId

fun ChatRow.fromProfile() = author

/**
 * Message list + composer with a simple top bar, used by DM / channel / group
 * screens. Pure presentation; the caller owns the rows and send logic.
 */
@Composable
fun ChatScaffold(
    title: String,
    subtitle: String,
    avatarUrl: String?,
    avatarName: String,
    ownUserId: String?,
    rows: List<ChatRow>,
    loading: Boolean,
    emptyText: String,
    callAction: (@Composable () -> Unit)? = null,
    onSend: (String) -> Unit,
    sendEnabled: Boolean = true,
    onBack: () -> Unit,
) {
    val palette = LocalPalette.current
    val listState = rememberLazyListState()

    LaunchedEffect(rows.size) {
        if (rows.isNotEmpty()) listState.scrollToItem(rows.lastIndex)
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(palette.background)
            .imePadding(),
    ) {
        ChatTopBar(
            title = title,
            subtitle = subtitle,
            avatarUrl = avatarUrl,
            avatarName = avatarName,
            callAction = callAction,
            onBack = onBack,
        )
        HorizontalDivider(color = palette.divider)

        Box(Modifier.fillMaxWidth().weight(1f)) {
            when {
                loading && rows.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
                rows.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(emptyText, color = palette.textMuted, fontSize = 15.sp)
                }
                else -> MessageList(listState, rows, ownUserId)
            }
        }

        Composer(palette = palette, onSend = onSend, enabled = sendEnabled)
    }
}

@Composable
private fun ChatTopBar(
    title: String,
    subtitle: String,
    avatarUrl: String?,
    avatarName: String,
    callAction: (@Composable () -> Unit)?,
    onBack: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .background(palette.surface)
            .statusBarsPadding()
            .height(56.dp)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                tint = palette.textPrimary,
            )
        }
        AvatarImage(url = avatarUrl, name = avatarName, size = 36.dp)
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Text(title, color = palette.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle.isNotBlank()) {
                Text(subtitle, color = palette.textMuted, fontSize = 12.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis)
            }
        }
        callAction?.invoke()
    }
}

@Composable
private fun MessageList(listState: LazyListState, rows: List<ChatRow>, ownUserId: String?) {
    val palette = LocalPalette.current
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 12.dp),
        state = listState,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items(rows, key = { it.id }) { row ->
            MessageBubble(
                row = row,
                isMine = row.isMine(ownUserId),
                showName = row.author?.id != ownUserId,
                palette = palette,
            )
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun MessageBubble(row: ChatRow, isMine: Boolean, showName: Boolean, palette: Palette) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start,
    ) {
        if (!isMine) {
            AvatarImage(url = row.author?.avatarUrl, name = row.author?.name ?: "?", size = 32.dp)
            Spacer(Modifier.width(8.dp))
        }
        Column(
            Modifier
                .fillMaxWidth(if (isMine) 0.78f else 0.85f)
                .padding(top = 2.dp),
            horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
        ) {
            if (!isMine && showName) {
                Text(
                    row.author?.name ?: "Unknown",
                    color = palette.accent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
            }
            val bg = if (isMine) palette.accent else palette.surfaceRaised
            val shape = RoundedCornerShape(14.dp)
            Column(
                Modifier
                    .background(bg, shape)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                if (row.content.isNotBlank()) {
                    Text(
                        row.content,
                        color = if (isMine) androidx.compose.ui.graphics.Color.White else palette.textPrimary,
                        fontSize = 15.sp,
                    )
                }
                row.attachmentType?.let { type ->
                    val label = when (type) {
                        AttachmentType.Image, AttachmentType.Gif -> "Photo"
                        AttachmentType.Video -> "Video"
                        else -> "Attachment"
                    }
                    Text(
                        label,
                        color = if (isMine) androidx.compose.ui.graphics.Color.White.copy(alpha = 0.85f)
                        else palette.textMuted,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Text(
                TimeFormat.short(row.createdAt),
                color = palette.textMuted,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 3.dp, start = 4.dp, end = 4.dp),
            )
        }
    }
}

@Composable
private fun Composer(palette: Palette, onSend: (String) -> Unit, enabled: Boolean) {
    var text by remember { mutableStateOf("") }
    Row(
        Modifier
            .fillMaxWidth()
            .background(palette.surface)
            .navigationBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            modifier = Modifier.weight(1f),
            placeholder = { Text("Message", color = palette.textMuted) },
            maxLines = 4,
            shape = RoundedCornerShape(18.dp),
        )
        Spacer(Modifier.width(6.dp))
        IconButton(
            onClick = {
                val trimmed = text.trim()
                if (trimmed.isNotEmpty()) {
                    onSend(trimmed)
                    text = ""
                }
            },
            enabled = enabled && text.isNotBlank(),
            modifier = Modifier.size(44.dp),
        ) {
            Icon(Icons.Filled.Send, contentDescription = "Send", tint = palette.accent)
        }
    }
}