package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.FriendshipStatus
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.ui.AvatarImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** The server's limit (add_group_members, create_group_chat): a group holds at most 10 people. */
private const val MAX_GROUP_MEMBERS = 10

/** create_group_chat wants at least 3 friends besides you (0149). */
private const val MIN_NEW_GROUP_FRIENDS = 3

private suspend fun acceptedFriends(uid: String): List<Profile> =
    Database.friendships(uid)
        .filter { it.status == FriendshipStatus.Accepted }
        .mapNotNull { if (it.requesterId == uid) it.addressee else it.requester }
        .sortedBy { it.name.lowercase() }

@Composable
private fun FriendPicker(
    friends: List<Profile>,
    picked: Set<String>,
    room: Int,
    enabled: Boolean,
    onChange: (Set<String>) -> Unit,
) {
    val palette = LocalPalette.current
    LazyColumn(Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
        items(friends, key = { it.id }) { friend ->
            val checked = friend.id in picked
            val canPick = checked || picked.size < room
            Row(
                Modifier.fillMaxWidth()
                    .clickable(enabled = canPick && enabled) {
                        onChange(if (checked) picked - friend.id else picked + friend.id)
                    }
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AvatarImage(url = friend.avatarUrl, name = friend.name, size = 36.dp)
                Spacer(Modifier.width(12.dp))
                Text(friend.name, color = palette.textPrimary, fontSize = 15.sp, modifier = Modifier.weight(1f))
                Checkbox(checked = checked, onCheckedChange = null, enabled = canPick)
            }
        }
    }
}

/** Turns a Postgres exception into its message ("Can only add accepted friends"). */
private fun serverMessage(e: Exception, fallback: String): String =
    e.message?.lineSequence()?.firstOrNull { it.isNotBlank() && it.length < 120 && !it.contains("http") } ?: fallback

@Composable
fun RenameGroupDialog(groupId: String, current: String, onDismiss: () -> Unit, onRenamed: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(current) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Rename group") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it.take(100) }, singleLine = true,
                    label = { Text("Group name") })
                error?.let { Text(it, color = Brand.dnd, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp)) }
            }
        },
        confirmButton = {
            TextButton(enabled = !saving && name.isNotBlank() && name.trim() != current, onClick = {
                saving = true
                error = null
                scope.launch {
                    try {
                        Database.renameGroup(groupId, name.trim())
                        onRenamed(name.trim())
                        onDismiss()
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) { error = serverMessage(e, "Couldn't rename the group. Try again.") }
                    finally { saving = false }
                }
            }) { Text(if (saving) "Saving…" else "Save") }
        },
        dismissButton = { TextButton(enabled = !saving, onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Pick friends to add. Only accepted friends who aren't already in the group are offered. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddGroupMembersSheet(
    uid: String,
    groupId: String,
    currentMemberIds: Set<String>,
    onDismiss: () -> Unit,
    onAdded: () -> Unit,
) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var friends by remember { mutableStateOf<List<Profile>?>(null) }
    var picked by remember { mutableStateOf<Set<String>>(emptySet()) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val room = (MAX_GROUP_MEMBERS - currentMemberIds.size).coerceAtLeast(0)

    LaunchedEffect(uid) {
        val loaded = runCatching { acceptedFriends(uid) }
        if (loaded.isFailure) error = "Couldn't load your friends. Try again."
        friends = loaded.getOrDefault(emptyList()).filter { it.id !in currentMemberIds }
    }

    ModalBottomSheet(
        onDismissRequest = { if (!saving) onDismiss() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 16.dp)) {
            Text("Add people", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            Text(
                if (room == 0) "This group is full (10 people)." else "You can add $room more.",
                color = palette.textMuted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp),
            )
            error?.let { Text(it, color = Brand.dnd, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp)) }
            val list = friends
            if (list == null) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
            } else {
                if (list.isEmpty()) Text("Everyone you're friends with is already here.", color = palette.textMuted,
                    fontSize = 14.sp, modifier = Modifier.padding(20.dp))
                FriendPicker(list, picked, room, enabled = !saving) { picked = it }
                Button(
                    enabled = picked.isNotEmpty() && !saving,
                    onClick = {
                        saving = true
                        error = null
                        scope.launch {
                            try {
                                Database.addGroupMembers(groupId, picked.toList())
                                onAdded()
                                onDismiss()
                            } catch (e: CancellationException) { throw e }
                            catch (e: Exception) { error = serverMessage(e, "Couldn't add them. Try again.") }
                            finally { saving = false }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                ) { Text(if (saving) "Adding…" else if (picked.isEmpty()) "Add" else "Add ${picked.size}") }
            }
        }
    }
}

/** Name a new group and pick 3 to 9 friends. Calls [onCreated] with the new group's id. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateGroupSheet(uid: String, onDismiss: () -> Unit, onCreated: (String) -> Unit) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    var friends by remember { mutableStateOf<List<Profile>?>(null) }
    var picked by remember { mutableStateOf<Set<String>>(emptySet()) }
    var name by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val room = MAX_GROUP_MEMBERS - 1

    LaunchedEffect(uid) {
        val loaded = runCatching { acceptedFriends(uid) }
        if (loaded.isFailure) error = "Couldn't load your friends. Try again."
        friends = loaded.getOrDefault(emptyList())
    }

    ModalBottomSheet(
        onDismissRequest = { if (!saving) onDismiss() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = palette.surface,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 16.dp)) {
            Text("New group", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            OutlinedTextField(
                value = name, onValueChange = { name = it.take(100) }, singleLine = true,
                label = { Text("Group name") },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            )
            Text(
                "Pick at least $MIN_NEW_GROUP_FRIENDS friends (up to $room).",
                color = palette.textMuted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
            )
            error?.let { Text(it, color = Brand.dnd, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) }
            val list = friends
            if (list == null) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
            } else {
                if (list.size < MIN_NEW_GROUP_FRIENDS) Text(
                    "You need at least $MIN_NEW_GROUP_FRIENDS friends to start a group.",
                    color = palette.textMuted, fontSize = 14.sp, modifier = Modifier.padding(20.dp),
                )
                FriendPicker(list, picked, room, enabled = !saving) { picked = it }
                Button(
                    enabled = !saving && name.isNotBlank() && picked.size >= MIN_NEW_GROUP_FRIENDS,
                    onClick = {
                        saving = true
                        error = null
                        scope.launch {
                            try {
                                val id = Database.createGroupChat(name.trim(), picked.toList())
                                onCreated(id)
                                onDismiss()
                            } catch (e: CancellationException) { throw e }
                            catch (e: Exception) { error = serverMessage(e, "Couldn't create the group. Try again.") }
                            finally { saving = false }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                ) { Text(if (saving) "Creating…" else "Create group") }
            }
        }
    }
}
