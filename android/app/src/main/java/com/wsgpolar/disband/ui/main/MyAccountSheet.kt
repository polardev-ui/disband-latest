package com.wsgpolar.disband.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.state.AppState
import com.wsgpolar.disband.ui.collectAsStateValue
import kotlinx.coroutines.launch

/**
 * My Account, as the web's `MyAccountPanel`: display name and username (both
 * open Edit profile), email, password reset, security settings on the web,
 * and deleting the account. Android had no route to any of these (bug 1083bd33).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyAccountSheet(app: AppState, onEditProfile: () -> Unit, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val profile by app.profile.collectAsStateValue()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val email = remember { DisbandSupabase.auth.currentUserOrNull()?.email }
    var reveal by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

    fun masked(e: String): String {
        val at = e.indexOf('@')
        return if (at <= 1) "••••" + e.substring(maxOf(at, 0)) else e.first() + "•".repeat(at - 1) + e.substring(at)
    }

    @Composable
    fun AccountRow(label: String, value: String, action: String?, onAction: (() -> Unit)?) {
        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label.uppercase(), color = palette.textMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(value, color = palette.textPrimary, fontSize = 15.sp)
            }
            if (action != null && onAction != null) TextButton(onClick = onAction) { Text(action, color = palette.accent) }
        }
        HorizontalDivider(color = palette.divider)
    }

    ModalBottomSheet(onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = palette.surface) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("My account", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            AccountRow("Display name", profile?.name ?: "—", "Edit") { onDismiss(); onEditProfile() }
            AccountRow("Username", profile?.username?.let { "@$it" } ?: "—", "Edit") { onDismiss(); onEditProfile() }
            AccountRow("Email", email?.let { if (reveal) it else masked(it) } ?: "—", if (email != null) (if (reveal) "Hide" else "Reveal") else null) {
                reveal = !reveal
            }
            AccountRow("Password", "••••••••", "Reset") {
                val address = email ?: return@AccountRow
                scope.launch {
                    app.sendPasswordReset(address)
                    notice = "We've sent a reset link to your email."
                }
            }
            AccountRow("Two-factor, passkeys and sessions", "Managed in Settings on the web", "Open") {
                runCatching {
                    context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,
                        android.net.Uri.parse("${AppConfig.WEB_APP_URL}/app")))
                }
            }
            notice?.let { Text(it, color = palette.textSecondary, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
            Spacer(Modifier.height(18.dp))
            Text(if (deleting) "Deleting…" else "Delete account", color = Brand.dnd, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(role = Role.Button, enabled = !deleting) { confirmDelete = true }.padding(vertical = 8.dp))
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete your account?") },
            text = { Text("This permanently deletes your account, messages and spaces you own. It can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    deleting = true
                    scope.launch {
                        val error = app.deleteAccount()
                        deleting = false
                        if (error != null) notice = error else onDismiss()
                    }
                }) { Text("Delete", color = Brand.dnd) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}
