package com.wsgpolar.disband.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.ServerAdmin
import com.wsgpolar.disband.ui.AvatarImage
import kotlinx.coroutines.delay

/** Who an "@" in this conversation can mean. */
sealed interface MentionSource {
    /** A DM or group: the people in it. */
    data class Local(val people: List<Profile>) : MentionSource
    /** A space channel: its whole roster (searched), plus @everyone and roles if allowed. */
    data class Space(val serverId: String) : MentionSource
}

private data class MentionSuggestion(
    val id: String,
    val title: String,
    val subtitle: String?,
    val avatarUrl: String?,
    /** What replaces the typed "@query". */
    val insert: String,
)

/** The "@query" being typed at the end of the draft, if any. Port of iOS `query(in:)`. */
internal fun mentionQuery(draft: String): String? {
    val at = draft.lastIndexOf('@')
    if (at < 0) return null
    // "name@example.com" is an email address, not a mention.
    if (at > 0 && !draft[at - 1].isWhitespace()) return null
    val tail = draft.substring(at + 1)
    if (tail.length > 32 || !tail.all { it.isLetterOrDigit() || it == '_' || it == '.' || it == '-' }) return null
    return tail
}

/** The draft with the typed "@query" swapped for the pick, plus a space. */
internal fun applyMention(insert: String, draft: String): String {
    val at = draft.lastIndexOf('@')
    return if (at < 0) "$draft$insert " else draft.substring(0, at) + insert + " "
}

/** `roleMentionSlug` in src/lib/utils.ts: the `@&slug` token the web writes for a role. */
internal fun roleMentionSlug(name: String): String = name.trim()
    .replace(Regex("\\s+"), "-")
    .replace(Regex("[^a-zA-Z0-9_-]"), "")
    .replace(Regex("-+"), "-")
    .trim('-')

/**
 * The list above the composer while an @mention is being typed, like iOS's
 * MentionSuggestionList. Picking one rewrites [state] in place.
 */
@Composable
fun MentionSuggestionBar(source: MentionSource, state: TextFieldState) {
    val palette = LocalPalette.current
    val query = mentionQuery(state.text.toString())
    var results by remember { mutableStateOf<List<MentionSuggestion>>(emptyList()) }

    // A space's permissions and roles, fetched once per space.
    val serverId = (source as? MentionSource.Space)?.serverId
    var canPingEveryone by remember(serverId) { mutableStateOf(false) }
    var roles by remember(serverId) { mutableStateOf<List<ServerAdmin.Role>>(emptyList()) }
    LaunchedEffect(serverId) {
        if (serverId == null) return@LaunchedEffect
        val perms = ServerAdmin.permissions(serverId)
        canPingEveryone = perms["mention_everyone"] == true || perms["administrator"] == true
        if (canPingEveryone) roles = runCatching { ServerAdmin.roles(serverId) }.getOrDefault(emptyList())
    }

    LaunchedEffect(query, source, canPingEveryone, roles) {
        if (query == null) { results = emptyList(); return@LaunchedEffect }
        val q = query.lowercase()
        fun hit(text: String?) = q.isEmpty() || text?.lowercase()?.contains(q) == true
        val members = when (source) {
            is MentionSource.Local -> source.people.filter { hit(it.displayName) || hit(it.username) }
            is MentionSource.Space -> {
                delay(200) // debounce the roster search while typing
                ServerAdmin.searchMembers(source.serverId, query)
            }
        }.filter { !it.username.isNullOrEmpty() }.distinctBy { it.id }

        val out = mutableListOf<MentionSuggestion>()
        if (serverId != null && canPingEveryone && hit("everyone")) {
            out += MentionSuggestion("everyone", "@everyone", "Notify everyone in this channel", null, "@everyone")
        }
        out += members.take(8).map {
            MentionSuggestion(it.id, it.name, "@${it.username}", it.avatarUrl, "@${it.username}")
        }
        if (canPingEveryone) out += roles
            .filter { it.isDefault != true && hit(it.name) }
            .mapNotNull { role ->
                val slug = roleMentionSlug(role.name)
                if (slug.isEmpty()) null
                else MentionSuggestion("role:${role.id}", "@${role.name}", "Role", null, "@&$slug")
            }
        results = out.take(10)
    }

    if (query == null || results.isEmpty()) return
    Column(Modifier.fillMaxWidth().background(palette.surfaceRaised)) {
        HorizontalDivider(color = palette.divider)
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 220.dp)) {
            items(results, key = { it.id }) { item ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { state.setTextAndPlaceCursorAtEnd(applyMention(item.insert, state.text.toString())) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (item.id.startsWith("role:") || item.id == "everyone") {
                        Box(
                            Modifier.size(28.dp).clip(CircleShape).background(palette.elevated),
                            contentAlignment = Alignment.Center,
                        ) { Text("@", color = palette.accent, fontWeight = FontWeight.Bold) }
                    } else {
                        AvatarImage(url = item.avatarUrl, name = item.title, size = 28.dp)
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(item.title, color = palette.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                    item.subtitle?.let {
                        Spacer(Modifier.width(8.dp))
                        Text(it, color = palette.textMuted, fontSize = 13.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}
