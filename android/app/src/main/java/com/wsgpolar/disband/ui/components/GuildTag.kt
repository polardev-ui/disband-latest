package com.wsgpolar.disband.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Brand
import com.wsgpolar.disband.data.Database
import com.wsgpolar.disband.data.GuildTag
import com.wsgpolar.disband.data.GuildTagIcon
import com.wsgpolar.disband.data.GuildTagSpace
import com.wsgpolar.disband.data.GuildTagStore
import kotlinx.coroutines.launch

// MARK: - pixel icons

private val GUILD_TAG_PIXELS: Map<GuildTagIcon, List<String>> = mapOf(
    GuildTagIcon.Star to listOf(
        ".....++.....",".....##.....","....+##+....","....####....",
        "+##########+",".+########+.","..+######+..","...######...",
        "..+######+..","..###++###..",".+##+..+##+.",".##......##."
    ),
    GuildTagIcon.Heart to listOf(
        "............",".+##+..+##+.","+####++####+","##.#########",
        "#.##########","############","+##########+",".+########+.",
        "..+######+..","...+####+...","....+##+....",".....++....."
    ),
    GuildTagIcon.Bolt to listOf(
        "......####..",".....####...","....####....","...####.....",
        "..#########.",".#########..",".....####...","....####....",
        "....###.....","...###......","...##.......","..#........."
    ),
    GuildTagIcon.Crown to listOf(
        "............","+....++....+","#+..+##+..+#","##+.####.+##",
        "###+####+###","############","############","##.##..##.##",
        "############","############","+##########+","............"
    ),
    GuildTagIcon.Skull to listOf(
        "...+####+...",".+########+.",".##########.","############",
        "##+..##..+##","##...##...##","###+####+###","+####..####+",
        ".+########+.","..########..","..##.##.##..","...+####+..."
    ),
    GuildTagIcon.Moon to listOf(
        "....+###+...","..+###+.....",".+###.......",".###........",
        "####........","####........","####.......+","####+.....+#",
        "+####+...+##",".+#########+","..+#######+.","....+###+..."
    ),
    GuildTagIcon.Leaf to listOf(
        ".........###",".......#####",".....######+","....#####.##",
        "...####.###+","..####.####.","..###.####..","..##.####...",
        "..+.####....",".+.+##+.....",".#..........","#..........."
    ),
    GuildTagIcon.Flame to listOf(
        "......#.....",".....##.....",".....###....","....+###....",
        "...+####+...","..+###+##+..","..####.###..",".####..+###.",
        ".###+...###.",".###....+##.","..###..###..","...+####+..."
    ),
)

@Composable
fun PixelGuildIcon(icon: GuildTagIcon, color: Color, size: Dp) {
    val rows = GUILD_TAG_PIXELS[icon] ?: GUILD_TAG_PIXELS[GuildTagIcon.Star]!!
    val density = LocalDensity.current
    val px = with(density) { size.toPx() }
    Canvas(modifier = Modifier.size(size)) {
        val cell = px / 12f
        rows.forEachIndexed { y, row ->
            row.forEachIndexed { x, ch ->
                if (ch != '.') {
                    drawRect(
                        color = color.copy(alpha = if (ch == '+') 0.5f else 1f),
                        topLeft = androidx.compose.ui.geometry.Offset(x * cell, y * cell),
                        size = androidx.compose.ui.geometry.Size(cell, cell),
                    )
                }
            }
        }
    }
}

enum class GuildTagBadgeSize(val height: Dp, val icon: Dp, val fontSize: Int, val hPad: Dp) {
    Small(16.dp, 11.dp, 10, 4.dp),
    Medium(18.dp, 12.dp, 11, 5.dp),
}

@Composable
fun GuildTagBadge(tag: GuildTag, size: GuildTagBadgeSize = GuildTagBadgeSize.Small, onClick: (() -> Unit)? = null) {
    val fg = guildTagForeground(tag.color)
    val bg = parseColor(tag.color)
    val content = @Composable {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            PixelGuildIcon(icon = tag.iconEnum, color = fg, size = size.icon)
            Text(tag.tag.uppercase(), fontSize = size.fontSize.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.2.sp, maxLines = 1, color = fg)
        }
    }
    val modifier = Modifier
        .height(size.height)
        .padding(horizontal = size.hPad)
        .clip(RoundedCornerShape(4.dp))
        .background(bg)
        .border(0.5.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
    if (onClick != null) {
        Box(modifier.clickable(onClick = onClick), contentAlignment = Alignment.Center) { content() }
    } else {
        Box(modifier, contentAlignment = Alignment.Center) { content() }
    }
}

@Composable
fun GuildTagView(userId: String?, size: GuildTagBadgeSize = GuildTagBadgeSize.Small) {
    val tags by GuildTagStore.tags.collectAsState()
    val tag = userId?.let { tags[it] }
    LaunchedEffect(userId) { GuildTagStore.ensureLoaded(userId) }
    var spaceId by remember { mutableStateOf<String?>(null) }
    if (tag != null) {
        GuildTagBadge(tag = tag, size = size) { spaceId = tag.serverId }
    }
    if (spaceId != null) {
        GuildTagSpaceSheet(serverId = spaceId!!, onDismiss = { spaceId = null })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuildTagSpaceSheet(serverId: String, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var space by remember { mutableStateOf<GuildTagSpace?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var joining by remember { mutableStateOf(false) }
    var joinError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(serverId) {
        try {
            space = Database.guildTagSpace(serverId)
        } catch (e: Exception) {
            error = e.message
        }
        loading = false
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(20.dp)) {
            if (loading) {
                Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else if (error != null) {
                Text(error!!, color = Brand.dnd)
            } else {
                val s = space
                if (s?.isPrivateSpace == true) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Text("Private space", fontWeight = FontWeight.SemiBold)
                        Text("This space keeps its identity private.")
                    }
                } else if (s != null) {
                    Text(s.name ?: "Space", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(s.description ?: "No description yet.")
                    RowInfo(s)
                    if (s.joined == true) {
                        Text("You're a member", color = Color(0xFF23A55A))
                    } else if (s.discoverable == true) {
                        Button(enabled = !joining, onClick = {
                            scope.launch {
                                joining = true
                                joinError = null
                                try {
                                    Database.joinServerById(serverId)
                                    onDismiss()
                                } catch (e: Exception) {
                                    joinError = e.message
                                }
                                joining = false
                            }
                        }) { Text(if (joining) "Joining…" else "Join Space") }
                    }
                    if (joinError != null) Text(joinError!!, color = Brand.dnd)
                }
            }
        }
    }
}

@Composable
private fun RowInfo(s: GuildTagSpace) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("${s.onlineCount ?: 0} online")
        Text("${s.memberCount ?: 0} members")
    }
}

// foreground color calc
fun guildTagForeground(hex: String): Color {
    val normalized = normalizeGuildTagColor(hex) ?: "#5865f2"
    val value = normalized.drop(1).toLong(16)
    val r = ((value shr 16) and 0xFF) / 255.0
    val g = ((value shr 8) and 0xFF) / 255.0
    val b = (value and 0xFF) / 255.0
    fun channel(c: Double): Double = if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
    val lum = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    return if (lum > 0.179) Color(0xFF111214) else Color.White
}

fun parseColor(hex: String): Color {
    return try { Color(android.graphics.Color.parseColor(hex)) } catch (_: Exception) { Color(0xFF5865F2) }
}

// extension on GuildTag for normalized color? Add helper in GuildTag companion via extension function.
fun normalizeGuildTagColor(raw: String): String? {
    var value = raw.trim()
    if (value.startsWith("#")) value = value.drop(1)
    if (value.length != 6) return null
    if (!value.all { it.isDigit() || it in 'a'..'f' || it in 'A'..'F' }) return null
    return "#${value.lowercase()}"
}

// Add extension functions to GuildTag for color sanitization/static helpers.
val GuildTag.iconEnum: GuildTagIcon get() = GuildTagIcon.from(icon)

// Extension property already? We'll add top-level helper instead.
fun sanitizeGuildTag(raw: String): String {
    return raw.uppercase().filter { it.isLetterOrDigit() || it == '.' || it == '_' || it == '-' }.take(4)
}

fun guildTagError(raw: String): String? {
    val t = sanitizeGuildTag(raw)
    if (t.isEmpty()) return "Enter 1–4 letters, numbers, dots, underscores or hyphens."
    if (t.length > 4) return "Guild tags are 1–4 characters."
    return null
}
