package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.ApiHttp
import com.wsgpolar.disband.core.AppConfig
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.LocalPalette
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
private data class OwnedGift(
    val code: String,
    val plan: String = "aero",
    val months: Int = 1,
    val status: String = "",
    @SerialName("expires_at") val expiresAt: String? = null,
) {
    val sendable: Boolean get() = status == "unclaimed" &&
        (expiresAt?.let { com.wsgpolar.disband.core.TimeFormat.parse(it) }?.isAfter(java.time.Instant.now()) ?: true)
    val planName: String get() = if (plan == "lite") "Disband Lite" else "Disband Aero"
    val length: String get() = if (months == 12) "1 year" else "$months month${if (months == 1) "" else "s"}"
}

@Serializable
private data class Mine(val sent: List<OwnedGift> = emptyList())

/**
 * The composer's gift picker (iOS `GiftPickerSheet`): gifts you've bought and
 * not handed out, from `/api/gifts/mine`. Picking one sends its link, which
 * renders as a claim card. Buying stays on the web (card checkout).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GiftPickerSheet(onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val palette = LocalPalette.current
    var gifts by remember { mutableStateOf<List<OwnedGift>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        runCatching {
            val token = DisbandSupabase.auth.currentSessionOrNull()?.accessToken ?: error("Not signed in")
            val res = ApiHttp.client.get("${AppConfig.WEB_APP_URL}/api/gifts/mine") { header("Authorization", "Bearer $token") }
            if (!res.status.isSuccess()) error("HTTP ${res.status.value}")
            Json { ignoreUnknownKeys = true }.decodeFromString(Mine.serializer(), res.bodyAsText()).sent.filter { it.sendable }
        }.onSuccess { gifts = it }.onFailure { error = "Couldn't load your gifts. Try again in a moment." }
    }
    ModalBottomSheet(onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = palette.surface) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Send a gift", color = palette.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text("Pick one of your gifts to drop into this chat.", color = palette.textMuted, fontSize = 13.sp)
            Spacer(Modifier.height(14.dp))
            val list = gifts
            when {
                error != null -> Text(error!!, color = palette.textMuted, fontSize = 14.sp)
                list == null -> Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = palette.accent)
                }
                list.isEmpty() -> Column {
                    Text("No gifts to send", color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("Gifts you've bought on the web and not handed out yet show up here.", color = palette.textMuted, fontSize = 13.sp)
                }
                else -> list.forEach { gift ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(14.dp)).background(palette.elevated)
                            .clickable(role = Role.Button, onClickLabel = "Send ${gift.planName}") {
                                onPick("${AppConfig.WEB_APP_URL.trimEnd('/')}/gift/${gift.code}")
                                onDismiss()
                            }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(40.dp).clip(CircleShape).background(Color(0x29F0B232)), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.CardGiftcard, null, tint = Color(0xFFF0B232), modifier = Modifier.size(20.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Text("${gift.planName} · ${gift.length}", color = palette.textPrimary, fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text("Send", color = palette.accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
