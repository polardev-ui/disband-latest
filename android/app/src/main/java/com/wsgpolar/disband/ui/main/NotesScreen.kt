package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.core.TimeFormat
import com.wsgpolar.disband.data.Note
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.collectAsStateValue
import com.wsgpolar.disband.ui.components.CapsuleFilterBar
import com.wsgpolar.disband.ui.components.ScreenHeader
import com.wsgpolar.disband.ui.components.SectionCaption
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class NoteFilter(val label: String) {
    All("All"),
    Pinned("Pinned"),
}

/**
 * Personal notes, matching iOS NotesTab: a header, All/Pinned, notes grouped
 * under day captions as cards, and a composer pinned to the bottom.
 */
@Composable
fun NotesScreen(app: AppState) {
    val palette = LocalPalette.current
    val notes by app.notes.notes.collectAsStateValue()
    val loading by app.notes.loading.collectAsStateValue()
    val userId = app.currentUserId
    val scope = rememberCoroutineScope()
    var filter by remember { mutableStateOf(NoteFilter.All) }
    var draft by remember { mutableStateOf("") }

    LaunchedEffect(userId) {
        if (userId != null) app.notes.start(userId)
    }

    val visible = if (filter == NoteFilter.Pinned) notes.filter { it.pinned } else notes
    val sections = remember(visible, filter) { daySections(visible, filter) }

    Column(Modifier.fillMaxSize().background(palette.background)) {
        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = 12.dp),
        ) {
            item(key = "header") {
                ScreenHeader("Notes", subtitle = "Only you can see these")
            }
            item(key = "filters") {
                CapsuleFilterBar(
                    options = NoteFilter.entries,
                    selected = filter,
                    onSelect = { filter = it },
                    title = { it.label },
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }

            when {
                loading && notes.isEmpty() -> item(key = "loading") {
                    Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = palette.accent)
                    }
                }

                visible.isEmpty() -> item(key = "empty") {
                    Column(
                        Modifier.fillMaxWidth().padding(top = 60.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            if (filter == NoteFilter.Pinned) "Nothing pinned yet" else "No notes yet",
                            color = palette.textPrimary,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "Write one below — only you can see these.",
                            color = palette.textMuted,
                            fontSize = 14.sp,
                        )
                    }
                }

                else -> sections.forEach { section ->
                    item(key = "cap-${section.title}") { SectionCaption(section.title) }
                    items@ for (note in section.notes) {
                        item(key = note.id) {
                            NoteCard(
                                note = note,
                                onTogglePin = { scope.launch { app.notes.togglePin(note) } },
                                onEdit = { content ->
                                    scope.launch { app.notes.edit(note, content) }
                                },
                                onDelete = { scope.launch { app.notes.delete(note) } },
                                modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 10.dp),
                            )
                        }
                    }
                }
            }
        }

        Composer(
            text = draft,
            onTextChange = { draft = it },
            onSend = {
                val body = draft.trim()
                if (body.isNotEmpty()) {
                    draft = ""
                    scope.launch { app.notes.send(body) }
                }
            },
        )
    }
}

@Composable
private fun NoteCard(
    note: Note,
    onTogglePin: () -> Unit,
    onEdit: (String) -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val clipboard = LocalClipboardManager.current
    var menuOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var editText by remember(note.id, note.content) { mutableStateOf(note.content) }

    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.surface)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (note.pinned) {
                Icon(Icons.Filled.PushPin, "Pinned", tint = Brand.idle, modifier = Modifier.size(12.dp))
            }
            Text(TimeFormat.short(note.createdAt), color = palette.textMuted, fontSize = 12.sp,
                fontWeight = FontWeight.Medium)
            if (note.editedAt != null) {
                Text("· edited", color = palette.textMuted, fontSize = 12.sp)
            }
            Spacer(Modifier.weight(1f))
            Box {
                androidx.compose.material3.IconButton(
                    onClick = { menuOpen = true },
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(
                        Icons.Filled.MoreHoriz,
                        contentDescription = "Note options",
                        tint = palette.textMuted,
                        modifier = Modifier.size(20.dp),
                    )
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text(if (note.pinned) "Unpin" else "Pin") },
                        leadingIcon = { Icon(Icons.Filled.PushPin, null) },
                        onClick = { menuOpen = false; onTogglePin() },
                    )
                    DropdownMenuItem(
                        text = { Text("Edit") },
                        leadingIcon = { Icon(Icons.Filled.Edit, null) },
                        onClick = { menuOpen = false; editText = note.content; editing = true },
                    )
                    if (note.content.isNotEmpty()) {
                        DropdownMenuItem(
                            text = { Text("Copy") },
                            leadingIcon = { Icon(Icons.Filled.ContentCopy, null) },
                            onClick = {
                                menuOpen = false
                                clipboard.setText(AnnotatedString(note.content))
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Delete", color = Brand.danger) },
                        leadingIcon = { Icon(Icons.Filled.Delete, null, tint = Brand.danger) },
                        onClick = { menuOpen = false; onDelete() },
                    )
                }
            }
        }

        note.attachmentUrl?.let { url ->
            AsyncImage(
                model = url,
                contentDescription = note.attachmentName,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 280.dp)
                    .clip(RoundedCornerShape(14.dp)),
            )
        }

        if (editing) {
            androidx.compose.material3.OutlinedTextField(
                value = editText,
                onValueChange = { editText = it },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.material3.OutlinedButton(
                    onClick = { editing = false },
                    shape = RoundedCornerShape(50),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text("Cancel") }
                androidx.compose.material3.Button(
                    onClick = { editing = false; onEdit(editText.trim()) },
                    enabled = editText.trim().isNotEmpty() && editText.trim() != note.content,
                    shape = RoundedCornerShape(50),
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = palette.accent,
                        contentColor = Color.White,
                    ),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text("Save") }
            }
        } else if (note.content.isNotBlank()) {
            Text(note.content, color = palette.textPrimary, fontSize = 15.sp)
        }
    }
}

@Composable
private fun Composer(text: String, onTextChange: (String) -> Unit, onSend: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .background(palette.background)
            .imePadding()
            // Sits above the floating dock rather than under it.
            .padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 96.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextField(
            value = text,
            onValueChange = onTextChange,
            placeholder = { Text("Write a note…", color = palette.textMuted) },
            modifier = Modifier.weight(1f).clip(CircleShape),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = palette.elevated,
                unfocusedContainerColor = palette.elevated,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                focusedTextColor = palette.textPrimary,
                unfocusedTextColor = palette.textPrimary,
            ),
            maxLines = 4,
            shape = CircleShape,
        )
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(if (text.isBlank()) palette.elevated else palette.accent)
                .clickable(
                    enabled = text.isNotBlank(),
                    role = androidx.compose.ui.semantics.Role.Button,
                    onClickLabel = "Save note",
                    onClick = onSend,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.AutoMirrored.Filled.Send,
                contentDescription = null,
                tint = if (text.isBlank()) palette.textMuted else Color.White,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

private class DaySection(val title: String, val notes: List<Note>)

/** Today / Yesterday / weekday-and-date buckets, in the order iOS uses. */
private fun daySections(notes: List<Note>, filter: NoteFilter): List<DaySection> {
    if (filter == NoteFilter.Pinned) return listOf(DaySection("Pinned", notes))
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now(zone)
    val order = mutableListOf<String>()
    val buckets = linkedMapOf<String, MutableList<Note>>()
    for (note in notes) {
        val instant = TimeFormat.parse(note.createdAt)
        val title = if (instant == null) {
            "Earlier"
        } else {
            val day = LocalDateTime.ofInstant(instant, zone).toLocalDate()
            when (day) {
                today -> "Today"
                today.minusDays(1) -> "Yesterday"
                else -> day.format(DateTimeFormatter.ofPattern("EEEE, MMM d"))
            }
        }
        if (buckets[title] == null) {
            order.add(title)
            buckets[title] = mutableListOf()
        }
        buckets.getValue(title).add(note)
    }
    return order.map { DaySection(it, buckets.getValue(it)) }
}
