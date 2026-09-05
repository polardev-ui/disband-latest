package com.wsgpolar.disband.ui.main

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Note
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.collectAsStateValue
import kotlinx.coroutines.launch

@Composable
fun NotesScreen(app: AppState) {
    val palette = LocalPalette.current
    val notes by app.notes.notes.collectAsStateValue()
    val loading by app.notes.loading.collectAsStateValue()
    val userId = app.currentUserId
    LaunchedEffect(userId) {
        if (userId != null) app.notes.start(userId)
    }
    when {
        loading && notes.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = palette.accent)
        }
        notes.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No notes yet", color = palette.textMuted, fontSize = 15.sp)
        }
        else -> LazyColumn(Modifier.fillMaxSize().background(palette.background)) {
            items(notes, key = { it.id }) { note ->
                NoteRow(note)
            }
        }
    }
}

@Composable
private fun NoteRow(note: Note) {
    val palette = LocalPalette.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(note.content, color = palette.textPrimary, fontSize = 15.sp)
        if (note.attachmentUrl != null) {
            Spacer(Modifier.padding(top = 6.dp))
            androidx.compose.material3.Text(
                if (note.attachmentType == com.wsgpolar.disband.data.AttachmentType.Video) "Video" else "Photo",
                color = palette.textMuted,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
fun YouScreen(app: AppState) {
    val palette = LocalPalette.current
    val profile by app.profile.collectAsStateValue()
    val profileError by app.profileError.collectAsStateValue()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val requestNotifs = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { _ -> }

    val notificationsGranted = remember {
        ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(palette.background)
            .padding(24.dp),
    ) {
        profile?.let { p ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                com.wsgpolar.disband.ui.AvatarImage(url = p.avatarUrl, name = p.name, size = 72.dp)
                Column(Modifier.padding(start = 16.dp)) {
                    Text(p.name, color = palette.textPrimary, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                    Text("@" + p.handle, color = palette.textMuted, fontSize = 14.sp)
                }
            }
            p.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                Spacer(Modifier.height(12.dp))
                Text(bio, color = palette.textSecondary, fontSize = 14.sp)
            }
        }

        // A null profile used to render nothing at all, leaving a page with a
        // Sign out button and no explanation. Report it, and offer a retry —
        // this is usually a transient read rather than a missing account.
        if (profile == null) {
            Text("Couldn't load your profile", color = palette.textPrimary,
                fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            profileError?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, color = palette.textMuted, fontSize = 13.sp)
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = { scope.launch { app.loadProfile() } }) {
                Text("Retry", color = palette.textPrimary)
            }
        }

        Spacer(Modifier.height(24.dp))
        HorizontalDivider(color = palette.divider)

        if (!notificationsGranted) {
            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = { requestNotifs.launch(Manifest.permission.POST_NOTIFICATIONS) }) {
                Icon(Icons.Filled.Notifications, contentDescription = null,
                    tint = palette.accent, modifier = Modifier.height(18.dp))
                Text("  Enable notifications", color = palette.textPrimary)
            }
        }

        Spacer(Modifier.weight(1f))

        Button(
            onClick = { scope.launch { app.signOut() } },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Filled.Person, contentDescription = null, tint = androidx.compose.ui.graphics.Color.White,
                modifier = Modifier.height(18.dp))
            Text("  Sign out")
        }
    }
}