package com.wsgpolar.disband.core

import android.content.Context
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.wsgpolar.disband.data.UserStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * Theme registry mirroring `ios/DisbandiOS/Theme/Palette.swift` and the web
 * app's `[data-theme]` blocks. Ids and plan gating must stay in step with the
 * web app since the choice is stored on `profiles.theme`.
 */
enum class ThemeId(val raw: String) {
    Dark("dark"),
    Midnight("midnight"),
    Light("light"),
    Sunset("sunset"),
    Ocean("ocean"),
    RoseGold("rose-gold"),
    Plasma("plasma"),
    Nord("nord");

    companion object {
        fun from(raw: String?): ThemeId? = entries.firstOrNull { it.raw == raw }
    }
}

data class Palette(
    /** --bg-tertiary */
    val background: Color,
    /** --bg-secondary */
    val surface: Color,
    /** --bg-primary */
    val surfaceRaised: Color,
    /** --interactive-hover */
    val elevated: Color,
    /** --brand */
    val accent: Color,
    val accentSoft: Color,
    /** --text-normal */
    val textPrimary: Color,
    val textSecondary: Color,
    /** --text-muted */
    val textMuted: Color,
    val divider: Color,
    val isDark: Boolean,
)

data class ThemeDefinition(
    val id: ThemeId,
    val label: String,
    val detail: String,
    val palette: Palette,
)

@Suppress("DEPRECATION")
object Themes {
    /**
     * Builds a colour from a hex literal.
     *
     * `Color(Int)` reads its argument as ARGB, so a plain six-digit RGB value
     * like 0x1E1F22 arrives as 0x001E1F22 — alpha zero, completely
     * transparent. Every palette entry is written in the six-digit form, which
     * made the whole app invisible: text, backgrounds and dividers all painted
     * nothing, leaving the window background showing through.
     *
     * A value with no alpha byte is therefore made opaque. Anything that
     * already carries one is passed through, so a deliberately translucent
     * colour still works.
     */
    fun color(hex: Long): Color {
        val argb = if (hex <= 0xFFFFFFL) hex or 0xFF000000L else hex
        return Color(argb.toInt())
    }

    val all: List<ThemeDefinition> = listOf(
        ThemeDefinition(
            ThemeId.Dark, "Disband Dark", "Classic Disband dark theme",
            Palette(
                background = color(0x1E1F22), surface = color(0x2B2D31),
                surfaceRaised = color(0x313338), elevated = color(0x35373C),
                accent = color(0x5865F2), accentSoft = color(0x4752C4),
                textPrimary = color(0xF2F3F5), textSecondary = color(0xB5BAC1),
                textMuted = color(0x949BA4), divider = color(0x3F4147), isDark = true,
            ),
        ),
        ThemeDefinition(
            ThemeId.Midnight, "AMOLED", "Pure black for OLED displays",
            Palette(
                background = color(0x050506), surface = color(0x0A0A0B),
                surfaceRaised = color(0x060607), elevated = color(0x1A1B1E),
                accent = color(0x5865F2), accentSoft = color(0x4752C4),
                textPrimary = color(0xF2F3F5), textSecondary = color(0xB5BAC1),
                textMuted = color(0x949BA4), divider = color(0x2E3035), isDark = true,
            ),
        ),
        ThemeDefinition(
            ThemeId.Light, "Disband Light", "Bright and clean",
            Palette(
                background = color(0xE3E5E8), surface = color(0xF2F3F5),
                surfaceRaised = color(0xFFFFFF), elevated = color(0xE3E5E8),
                accent = color(0x5865F2), accentSoft = color(0x4752C4),
                textPrimary = color(0x313338), textSecondary = color(0x4E5058),
                textMuted = color(0x5C5E66), divider = color(0xD4D7DC), isDark = false,
            ),
        ),
        ThemeDefinition(
            ThemeId.Sunset, "Sunset", "Warm tones, pink accent",
            Palette(
                background = color(0x181214), surface = color(0x231C1E),
                surfaceRaised = color(0x2A2224), elevated = color(0x32282B),
                accent = color(0xEB459E), accentSoft = color(0xC23884),
                textPrimary = color(0xF2E8E4), textSecondary = color(0xCBB6B0),
                textMuted = color(0xA8948E), divider = color(0x3F3538), isDark = true,
            ),
        ),
        ThemeDefinition(
            ThemeId.Ocean, "Ocean", "Cool blues, teal accent",
            Palette(
                background = color(0x0D1B2A), surface = color(0x1B2838),
                surfaceRaised = color(0x1B2A3A), elevated = color(0x1F3042),
                accent = color(0x2DD4BF), accentSoft = color(0x24A99A),
                textPrimary = color(0xE2E8F0), textSecondary = color(0xB6C2D1),
                textMuted = color(0x94A3B8), divider = color(0x334155), isDark = true,
            ),
        ),
        ThemeDefinition(
            ThemeId.RoseGold, "Rose Gold", "Elegant rose tones, gold accent",
            Palette(
                background = color(0x1C1415), surface = color(0x2C1D1F),
                surfaceRaised = color(0x332224), elevated = color(0x3D282B),
                accent = color(0xF5A0B8), accentSoft = color(0xCC8399),
                textPrimary = color(0xFCE7F0), textSecondary = color(0xE0BECD),
                textMuted = color(0xC9A0B0), divider = color(0x4A3035), isDark = true,
            ),
        ),
        ThemeDefinition(
            ThemeId.Plasma, "Plasma", "Deep purple with vibrant magenta",
            Palette(
                background = color(0x0E0A16), surface = color(0x1A0F2E),
                surfaceRaised = color(0x1F1137), elevated = color(0x281A40),
                accent = color(0xC77DFF), accentSoft = color(0xA463D6),
                textPrimary = color(0xEADAFF), textSecondary = color(0xC0A9DA),
                textMuted = color(0x9D7CBF), divider = color(0x2D1B45), isDark = true,
            ),
        ),
        ThemeDefinition(
            ThemeId.Nord, "Nord", "Arctic blues, frost accent",
            Palette(
                background = color(0x2E3440), surface = color(0x3B4252),
                surfaceRaised = color(0x434C5E), elevated = color(0x4C566A),
                accent = color(0x88C0D0), accentSoft = color(0x6E9DAC),
                textPrimary = color(0xECEFF4), textSecondary = color(0xCBD2DC),
                textMuted = color(0xA5ABB6), divider = color(0x4C566A), isDark = true,
            ),
        ),
    )

    val freeThemeIds: Set<ThemeId> = setOf(ThemeId.Dark, ThemeId.Midnight, ThemeId.Light, ThemeId.Sunset)

    fun definition(id: ThemeId): ThemeDefinition = all.firstOrNull { it.id == id } ?: all[0]
}

/** Holds the active theme and persists it locally + to the profile. */
class ThemeManager(context: Context) {
    private val prefs = context.getSharedPreferences("disband_theme", Context.MODE_PRIVATE)

    private val _themeId = MutableStateFlow(ThemeId.from(prefs.getString("theme", null)) ?: ThemeId.Dark)
    val themeId: StateFlow<ThemeId> = _themeId

    val palette: StateFlow<Palette> = _themeId.map { Themes.definition(it).palette }
        .stateIn(kotlinx.coroutines.CoroutineScope(Dispatchers.Main.immediate), kotlinx.coroutines.flow.SharingStarted.Eagerly, Themes.definition(_themeId.value).palette)

    fun setTheme(value: ThemeId) {
        _themeId.value = value
        prefs.edit().putString("theme", value.raw).apply()
    }

    fun adopt(profileTheme: String?) {
        val id = ThemeId.from(profileTheme) ?: return
        if (id != _themeId.value) {
            _themeId.value = id
            prefs.edit().putString("theme", id.raw).apply()
        }
    }
}

val LocalThemeManager = staticCompositionLocalOf<ThemeManager?> { null }
val LocalPalette = staticCompositionLocalOf { Themes.definition(ThemeId.Dark).palette }

/** Applies the active theme as a Material3 ColorScheme and provides the palette. */
@Composable
fun DisbandTheme(content: @Composable () -> Unit) {
    val themeManager = LocalThemeManager.current
    val palette = if (themeManager != null) {
        themeManager.palette.collectAsState().value
    } else {
        Themes.definition(ThemeId.Dark).palette
    }
    CompositionLocalProvider(
        LocalPalette provides palette,
    ) {
        androidx.compose.material3.MaterialTheme(
            colorScheme = disbandColorScheme(palette),
            content = content,
        )
    }
}

/** Presence/destructive colours are fixed; they must not drift per theme. */
object Brand {
    val online = Color(0xFF23A55A)
    val idle = Color(0xFFF0B232)
    val dnd = Color(0xFFF23F43)
    val danger = Color(0xFFDA373C)
}

fun UserStatus.color(palette: Palette): Color = when (this) {
    UserStatus.Online -> Brand.online
    UserStatus.Idle -> Brand.idle
    UserStatus.Dnd -> Brand.dnd
    UserStatus.Offline -> palette.textMuted
}

/** Stable color derived from an arbitrary string (avatar fallback). */
fun Color.Companion.seeded(seed: String): Color {
    val palette = listOf(
        0x5865F2L, 0xEB459EL, 0xED4245L, 0xFAA61AL,
        0x57F287L, 0x3BA55CL, 0x9B59B6L, 0x1ABC9CL, 0xE67E22L,
    )
    var hash = 5381L
    for (b in seed.encodeToByteArray()) {
        hash = ((hash shl 5) + hash) + b
    }
    return Themes.color(palette[Math.floorMod(hash, palette.size.toLong()).toInt()])
}

@Composable
fun disbandColorScheme(palette: Palette): ColorScheme = if (palette.isDark) {
    darkColorScheme(
        primary = palette.accent,
        onPrimary = Color.White,
        primaryContainer = palette.accentSoft,
        onPrimaryContainer = Color.White,
        secondary = palette.accentSoft,
        background = palette.background,
        onBackground = palette.textPrimary,
        surface = palette.surface,
        onSurface = palette.textPrimary,
        onSurfaceVariant = palette.textSecondary,
        outline = palette.divider,
        outlineVariant = palette.divider,
        error = Brand.danger,
    )
} else {
    lightColorScheme(
        primary = palette.accent,
        onPrimary = Color.White,
        primaryContainer = palette.accentSoft,
        onPrimaryContainer = Color.White,
        secondary = palette.accentSoft,
        background = palette.background,
        onBackground = palette.textPrimary,
        surface = palette.surface,
        onSurface = palette.textPrimary,
        onSurfaceVariant = palette.textSecondary,
        outline = palette.divider,
        outlineVariant = palette.divider,
        error = Brand.danger,
    )
}

@Composable
fun DisbandThemeProvider(themeManager: ThemeManager, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalThemeManager provides themeManager) {
        content()
    }
}