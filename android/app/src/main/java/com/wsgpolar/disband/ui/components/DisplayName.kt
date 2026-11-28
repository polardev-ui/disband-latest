package com.wsgpolar.disband.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.wsgpolar.disband.R
import com.wsgpolar.disband.core.LocalPalette
import com.wsgpolar.disband.data.Profile
import com.wsgpolar.disband.data.ServerAdmin

/** The web's name fonts (`src/lib/nameFonts.ts`), same files, same ids. */
object NameFonts {
    private val families = mutableMapOf<String, FontFamily>()

    private fun resource(id: String): Int? = when (id) {
        "matcha" -> R.font.name_matcha
        "gothic" -> R.font.name_gothic
        "future" -> R.font.name_future
        "spooky" -> R.font.name_spooky
        "pixels" -> R.font.name_pixels
        "brutal" -> R.font.name_brutal
        "graffiti" -> R.font.name_graffiti
        "dunker" -> R.font.name_dunker
        "sharp" -> R.font.name_sharp
        else -> null // "default", null and unknown ids: the system font
    }

    fun family(id: String?): FontFamily? {
        val key = id ?: return null
        families[key]?.let { return it }
        val res = resource(key) ?: return null
        return FontFamily(Font(res)).also { families[key] = it }
    }
}

/** "#rgb" / "#rrggbb" to a colour, or null. */
fun parseHexColour(raw: String?): Color? {
    var c = raw?.trim()?.lowercase() ?: return null
    if (Regex("^#[0-9a-f]{3}$").matches(c)) c = "#" + c.drop(1).map { "$it$it" }.joinToString("")
    if (!Regex("^#[0-9a-f]{6}$").matches(c)) return null
    return Color(0xFF000000 or c.drop(1).toLong(16))
}

/** A CSS `linear-gradient(<angle>, a, b)` as a brush, to the nearest 45°. */
private fun cssGradient(direction: String?, from: Color, to: Color): Brush {
    val degrees = direction?.trim()?.removeSuffix("deg")?.toFloatOrNull() ?: 135f
    val inf = Float.POSITIVE_INFINITY
    return when (((Math.round(degrees / 45f) % 8) + 8) % 8) {
        0 -> Brush.linearGradient(listOf(from, to), start = Offset(0f, inf), end = Offset.Zero) // to top
        1 -> Brush.linearGradient(listOf(from, to), start = Offset(0f, inf), end = Offset(inf, 0f))
        2 -> Brush.horizontalGradient(listOf(from, to))
        3 -> Brush.linearGradient(listOf(from, to))
        4 -> Brush.verticalGradient(listOf(from, to))
        5 -> Brush.linearGradient(listOf(from, to), start = Offset(inf, 0f), end = Offset(0f, inf))
        6 -> Brush.horizontalGradient(listOf(to, from))
        else -> Brush.linearGradient(listOf(to, from))
    }
}

/**
 * How a name is painted, in the web's order of precedence: a personal Aero
 * name colour or gradient, then the member's top role colour (and its
 * gradient where the web uses one), then the caller's default.
 */
data class NameStyle(val brush: Brush? = null, val color: Color? = null)

fun nameStyle(profile: Profile?, role: ServerAdmin.Role? = null, roleGradient: Boolean = false): NameStyle {
    val second = parseHexColour(profile?.nameColor2)
    val start = parseHexColour(profile?.nameColor) ?: if (second != null) Color.White else null
    if (start != null && second != null) return NameStyle(brush = cssGradient(profile?.nameGradientDir, start, second))
    if (start != null) return NameStyle(color = start)
    val roleColour = parseHexColour(role?.color) ?: return NameStyle()
    val roleTo = parseHexColour(role?.gradientTo)
    if (roleGradient && roleTo != null) return NameStyle(brush = Brush.horizontalGradient(listOf(roleColour, roleTo)))
    return NameStyle(color = roleColour)
}

/**
 * Chat author colours for the open space: the member's top role, as the web's
 * `getMemberColor`. Provided by a channel screen; DMs and groups leave it unset.
 */
val LocalAuthorRole = compositionLocalOf<(String?) -> ServerAdmin.Role?> { { null } }

/**
 * Someone's name exactly as the web draws it (`DisplayName.tsx`): the web's
 * `displayName()` string, in their name font, in their name colour or
 * gradient, else their role colour, else [color].
 */
@Composable
fun DisplayNameText(
    profile: Profile?,
    modifier: Modifier = Modifier,
    fallback: String = "Unknown",
    color: Color = LocalPalette.current.textPrimary,
    fontSize: TextUnit = 15.sp,
    fontWeight: FontWeight = FontWeight.SemiBold,
    role: ServerAdmin.Role? = null,
    roleGradient: Boolean = false,
    maxLines: Int = 1,
    text: String? = null,
) {
    val style = nameStyle(profile, role, roleGradient)
    val family = NameFonts.family(profile?.nameFont)
    Text(
        text ?: profile?.name ?: fallback,
        modifier = modifier,
        style = style.brush?.let { brush ->
            TextStyle(brush = brush, fontSize = fontSize, fontWeight = fontWeight, fontFamily = family)
        } ?: TextStyle(color = style.color ?: color, fontSize = fontSize, fontWeight = fontWeight, fontFamily = family),
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

/** A role's icon: an emoji, or an image URL (`RoleIcon.tsx`). */
@Composable
fun RoleIcon(icon: String?, size: Int = 14) {
    val value = icon?.trim()?.takeIf { it.isNotEmpty() } ?: return
    if (value.startsWith("https://")) {
        AsyncImage(model = value, contentDescription = null,
            modifier = Modifier.size(size.dp).clip(RoundedCornerShape(3.dp)))
    } else {
        Text(value, fontSize = (size - 1).sp)
    }
}

/**
 * The profile "Roles" section's chips (`UserProfilePopout.tsx`): a rounded
 * pill with a dot in the role's colour, its icon, and its name.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RolePills(roles: List<ServerAdmin.Role>, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (role in roles) {
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(palette.elevated)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                androidx.compose.foundation.layout.Box(
                    Modifier.size(12.dp).clip(CircleShape)
                        .background(parseHexColour(role.color) ?: palette.textMuted),
                )
                Spacer(Modifier.width(5.dp))
                if (!role.icon.isNullOrBlank()) {
                    RoleIcon(role.icon, 14)
                    Spacer(Modifier.width(4.dp))
                }
                Text(role.name, color = palette.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            }
        }
    }
}
