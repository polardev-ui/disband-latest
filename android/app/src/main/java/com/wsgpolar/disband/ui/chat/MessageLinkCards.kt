package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.core.DisbandSupabase
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.ui.AvatarImage
import kotlinx.coroutines.launch
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Cards drawn under a message for links the app understands, as on iOS
 * (`MessageEmbeds.swift`) and the web: a space invite becomes a join card,
 * a gift link a claim card. Both used to be plain text on Android.
 */
object MessageLinks {
    private val INVITE = Regex(
        """(?:https?://(?:www\.)?disband\.dev|(?<![\w/.:-]))/(?:server|invite)/([a-zA-Z0-9-]{3,32})(?![\w-])""",
        RegexOption.IGNORE_CASE,
    )
    private val GIFT = Regex("""(?:https?://\S+)?/gift/([a-zA-Z0-9]{10})\b""", RegexOption.IGNORE_CASE)

    fun inviteCodes(text: String): List<String> = INVITE.findAll(text).map { it.groupValues[1] }.distinct().take(3).toList()
    fun giftCodes(text: String): List<String> = GIFT.findAll(text).map { it.groupValues[1] }.distinct().take(3).toList()

    private val URL = Regex("""https?://[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'"`]""", RegexOption.IGNORE_CASE)

    /** Plain links worth a preview: not invites, gifts or bot invites (iOS `previewURLs`), at most two. */
    fun previewUrls(text: String): List<String> = URL.findAll(text).map { it.value }
        .filter { inviteCodes(it).isEmpty() && giftCodes(it).isEmpty() && !it.contains("/bot-invite/", ignoreCase = true) }
        .distinct().take(2).toList()
}

/**
 * Link previews through the web's `/api/link/preview`, never scraped on the
 * phone: that endpoint carries the SSRF guard and rate limits (iOS rule).
 */
private object LinkPreviews {
    @Serializable
    data class Preview(val title: String? = null, val description: String? = null, val image: String? = null)

    private val cache = java.util.concurrent.ConcurrentHashMap<String, java.util.Optional<Preview>>()
    private val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }

    suspend fun get(url: String): Preview? {
        cache[url]?.let { return it.orElse(null) }
        val result = runCatching {
            val res = com.wsgpolar.disband.core.ApiHttp.client.get("${com.wsgpolar.disband.core.AppConfig.WEB_APP_URL}/api/link/preview") {
                parameter("url", url)
            }
            if (res.status.value != 200) null
            else json.decodeFromString(Preview.serializer(), res.bodyAsText()).takeIf { !it.title.isNullOrBlank() }
        }.getOrNull()
        cache[url] = java.util.Optional.ofNullable(result)
        return result
    }
}

/** Opens the join sheet for an invite code; the main screen points it at its sheet. */
object InviteRouter {
    var open: (String) -> Unit = {}
}

val LocalOpenInvite = compositionLocalOf<(String) -> Unit> { { code -> InviteRouter.open(code) } }

@Composable
fun MessageLinkCards(text: String) {
    val invites = remember(text) { MessageLinks.inviteCodes(text) }
    val gifts = remember(text) { MessageLinks.giftCodes(text) }
    // The person's own "link previews" setting is respected, as on the web.
    val me = remember { DisbandSupabase.auth.currentUserOrNull()?.id }
    val previewsOn = com.wsgpolar.disband.data.ProfileStore.get(me)?.linkPreviewsEnabled != false
    val links = remember(text, previewsOn) { if (previewsOn) MessageLinks.previewUrls(text) else emptyList() }
    if (invites.isEmpty() && gifts.isEmpty() && links.isEmpty()) return
    Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        invites.forEach { InviteCard(it) }
        gifts.forEach { GiftClaimCard(it) }
        links.forEach { LinkPreviewCard(it) }
    }
}

/**
 * Invite lookups made this run. The database allows 15 a minute per person,
 * and a channel full of invites would otherwise run out (iOS `InviteCache`).
 */
private object InviteCache {
    val previews = mutableMapOf<String, Database.InvitePreview>()
    val invalid = mutableSetOf<String>()
}

@Composable
private fun InviteCard(code: String) {
    val palette = LocalPalette.current
    val open = LocalOpenInvite.current
    var preview by remember(code) { mutableStateOf(InviteCache.previews[code]) }
    var invalid by remember(code) { mutableStateOf(code in InviteCache.invalid) }
    LaunchedEffect(code) {
        if (preview != null || invalid) return@LaunchedEffect
        val found = runCatching { Database.serverByInvite(code) }
        found.getOrNull()?.let { InviteCache.previews[code] = it; preview = it }
        if (found.isSuccess && found.getOrNull() == null) { InviteCache.invalid += code; invalid = true }
    }
    val p = preview
    CardShell(accent = palette.accent) {
        Text(if (invalid) "INVITE EXPIRED" else "YOU'VE BEEN INVITED TO A SPACE", color = palette.textMuted,
            fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarImage(url = p?.iconUrl, name = p?.name ?: "?", size = 44.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(p?.name ?: if (invalid) "This invite is no longer valid" else "Loading…", color = palette.textPrimary,
                    fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (p != null) {
                    Text("${p.memberCount} ${if (p.memberCount == 1) "member" else "members"}", color = palette.textMuted, fontSize = 12.sp)
                }
            }
            if (p != null) {
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(8.dp)).background(Brand.online)
                        .clickable(role = Role.Button, onClickLabel = "Join ${p.name}") { open(code) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) { Text("Join", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold) }
            }
        }
    }
}

@Serializable
private data class GiftRow(
    val code: String,
    val plan: String = "aero",
    val months: Int = 1,
    val status: String = "unclaimed",
    @SerialName("buyer_id") val buyerId: String? = null,
    @SerialName("claimed_by") val claimedBy: String? = null,
)

@Serializable
private data class ClaimResult(val ok: Boolean = false, val error: String? = null)

private val AERO_GOLD = Color(0xFFF0B232)

/**
 * A gift posted into a conversation (iOS `GiftClaimCard`). Anyone who can see
 * it may claim it; the race is settled in the database (`claim_gift`), so a
 * claim that loses says so.
 */
@Composable
private fun GiftClaimCard(code: String) {
    val palette = LocalPalette.current
    val scope = rememberCoroutineScope()
    val me = remember { DisbandSupabase.auth.currentUserOrNull()?.id }
    var gift by remember(code) { mutableStateOf<GiftRow?>(null) }
    var buyerName by remember(code) { mutableStateOf("Someone") }
    var claiming by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        // Gift codes are bearer secrets: the RPC returns the one row for the code you have.
        val row = runCatching {
            DisbandSupabase.postgrest.rpc("get_gift", buildJsonObject { put("p_code", code) }).decodeList<GiftRow>().firstOrNull()
        }.getOrNull() ?: runCatching {
            DisbandSupabase.postgrest.rpc("get_gift", buildJsonObject { put("p_code", code) }).decodeAs<GiftRow>()
        }.getOrNull()
        gift = row
        row?.buyerId?.let { id -> runCatching { Database.profile(id) }.getOrNull()?.let { buyerName = it.name } }
    }
    LaunchedEffect(code) { load() }
    val g = gift ?: return
    val mine = g.buyerId != null && g.buyerId == me
    val claimedByMe = g.claimedBy != null && g.claimedBy == me
    val months = if (g.months == 12) "1 year" else "${g.months} month${if (g.months == 1) "" else "s"}"

    CardShell(accent = AERO_GOLD) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(CircleShape).background(AERO_GOLD.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.CardGiftcard, contentDescription = null, tint = AERO_GOLD, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(if (mine) "YOUR GIFT" else "A GIFT FROM ${buyerName.uppercase()}", color = palette.textMuted,
                    fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (g.plan.contains("lite", ignoreCase = true)) "Disband Aero Lite" else "Disband Aero",
                    color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text(months + if (g.status == "unclaimed") " · first to claim it gets it" else "", color = palette.textMuted, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.height(10.dp))
        when {
            claimedByMe -> Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = AERO_GOLD, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text("Claimed by you", color = AERO_GOLD, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
            g.status == "claimed" -> Text("Already claimed.", color = palette.textMuted, fontSize = 12.sp)
            g.status == "expired" -> Text("This gift expired.", color = palette.textMuted, fontSize = 12.sp)
            g.status == "pending" -> Text("Waiting for payment to clear…", color = palette.textMuted, fontSize = 12.sp)
            mine -> Text("Waiting for someone to claim it.", color = palette.textMuted, fontSize = 12.sp)
            else -> Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(AERO_GOLD)
                    .clickable(enabled = !claiming, role = Role.Button, onClickLabel = "Claim gift") {
                        claiming = true
                        error = null
                        scope.launch {
                            val result = runCatching {
                                DisbandSupabase.postgrest.rpc("claim_gift", buildJsonObject { put("p_code", code) }).decodeAs<ClaimResult>()
                            }.getOrNull()
                            if (result?.ok != true) error = result?.error ?: "Couldn't claim this gift."
                            // A lost race shows as claimed rather than still offering the button.
                            load()
                            claiming = false
                        }
                    }
                    .padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) { Text(if (claiming) "Claiming…" else "Claim", color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.SemiBold) }
        }
        error?.let { Text(it, color = Brand.danger, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp)) }
    }
}

@Composable
private fun CardShell(accent: Color, content: @Composable () -> Unit) {
    val palette = LocalPalette.current
    Row(
        Modifier.widthIn(max = 420.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(palette.elevated)
            .height(androidx.compose.foundation.layout.IntrinsicSize.Min),
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().background(accent))
        Column(Modifier.padding(12.dp)) { content() }
    }
}

@Composable
private fun LinkPreviewCard(url: String) {
    val palette = LocalPalette.current
    val context = androidx.compose.ui.platform.LocalContext.current
    val preview by androidx.compose.runtime.produceState<LinkPreviews.Preview?>(null, url) { value = LinkPreviews.get(url) }
    val p = preview ?: return
    val host = remember(url) { runCatching { android.net.Uri.parse(url).host?.removePrefix("www.") }.getOrNull() }
    Row(
        Modifier.widthIn(max = 420.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(palette.elevated)
            .clickable(role = Role.Button, onClickLabel = "Open link") {
                runCatching { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
            }
            .height(androidx.compose.foundation.layout.IntrinsicSize.Min),
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().background(palette.accent))
        Column(Modifier.weight(1f).padding(12.dp)) {
            host?.let { Text(it, color = palette.textMuted, fontSize = 11.sp, maxLines = 1) }
            Text(p.title.orEmpty(), color = palette.accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            p.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = palette.textSecondary, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            p.image?.takeIf { it.startsWith("https://") }?.let {
                Spacer(Modifier.height(8.dp))
                coil.compose.AsyncImage(model = it, contentDescription = null,
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(8.dp)))
            }
        }
    }
}
