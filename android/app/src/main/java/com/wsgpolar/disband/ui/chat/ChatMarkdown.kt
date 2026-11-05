package com.wsgpolar.disband.ui.chat

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.wsgpolar.disband.core.Palette

/**
 * Discord-style markdown, rendered to an [AnnotatedString].
 *
 * Messages arrived on Android as raw text: `**bold**` showed its asterisks, a
 * fenced block was a wall of unindented prose, and a `@mention` looked like
 * any other word. The same message already rendered properly on the web and
 * on iOS, so a conversation read differently depending on which phone was in
 * your hand.
 *
 * This is a parser rather than a stack of regexes, for the same reason the
 * iOS one is ([ChatMarkdown.swift]): styling the text *between* markers
 * without removing them leaves the markers on screen, and each regex pass
 * overwrites the style the previous pass set. It walks the string once and
 * builds spans as it goes.
 *
 * Supported, matching `src/lib/markdown.tsx` and the iOS renderer:
 * fenced and inline code, `**bold**`, `*italic*` / `_italic_`,
 * `__underline__`, `~~strikethrough~~`, `||spoiler||`, `#`..`###` headings,
 * `> ` quotes, `-# ` small text, and `@mentions`.
 */
object ChatMarkdown {

    /** One parsed block: markdown never crosses a fenced boundary. */
    sealed interface Block {
        data class Text(val content: AnnotatedString) : Block
        data class Code(val language: String?, val code: String) : Block
        data class Quote(val content: AnnotatedString) : Block
    }

    private val FENCE = Regex("```(\\w*)\\n?([\\s\\S]*?)```")

    /**
     * Split a message into blocks.
     *
     * Fenced code is lifted out first because nothing inside it is markdown —
     * a `**` in a code sample is two asterisks, not the start of bold.
     */
    fun blocks(raw: String, palette: Palette, baseSize: TextUnit = 15.sp, reveal: Boolean = false): List<Block> {
        val out = mutableListOf<Block>()
        var cursor = 0

        for (match in FENCE.findAll(raw)) {
            val before = raw.substring(cursor, match.range.first)
            if (before.isNotBlank()) out += lines(before, palette, baseSize, reveal)
            val language = match.groupValues[1].takeIf { it.isNotBlank() }
            out += Block.Code(language, match.groupValues[2].trimEnd('\n'))
            cursor = match.range.last + 1
        }
        val rest = raw.substring(cursor)
        if (rest.isNotBlank() || out.isEmpty()) out += lines(rest, palette, baseSize, reveal)
        return out
    }

    /** Line-level constructs: quotes, headings, small text. */
    private fun lines(chunk: String, palette: Palette, baseSize: TextUnit, reveal: Boolean): List<Block> {
        val out = mutableListOf<Block>()
        val pending = StringBuilder()

        fun flush() {
            if (pending.isNotEmpty()) {
                out += Block.Text(inline(pending.toString().trimEnd('\n'), palette, baseSize, reveal))
                pending.clear()
            }
        }

        for (line in chunk.split("\n")) {
            when {
                line.startsWith(">>> ") || line.startsWith("> ") -> {
                    flush()
                    val body = line.removePrefix(">>> ").removePrefix("> ")
                    out += Block.Quote(inline(body, palette, baseSize, reveal))
                }
                line.startsWith("-# ") -> {
                    flush()
                    out += Block.Text(
                        buildAnnotatedString {
                            pushStyle(SpanStyle(color = palette.textMuted, fontSize = baseSize * 0.82f))
                            append(inline(line.removePrefix("-# "), palette, baseSize, reveal))
                            pop()
                        }
                    )
                }
                Regex("^#{1,3} ").containsMatchIn(line) -> {
                    flush()
                    val hashes = line.takeWhile { it == '#' }.length
                    // 1.5 / 1.3 / 1.15 — the same steps the web uses.
                    val scale = when (hashes) { 1 -> 1.5f; 2 -> 1.3f; else -> 1.15f }
                    out += Block.Text(
                        buildAnnotatedString {
                            pushStyle(
                                SpanStyle(
                                    fontSize = baseSize * scale,
                                    fontWeight = FontWeight.Bold,
                                    color = palette.textPrimary,
                                )
                            )
                            append(inline(line.drop(hashes + 1), palette, baseSize, reveal))
                            pop()
                        }
                    )
                }
                else -> pending.append(line).append('\n')
            }
        }
        flush()
        return out
    }

    /** One inline rule: the markers that open and close it, and the style. */
    private data class Rule(val marker: String, val style: SpanStyle)

    /**
     * Longest markers first. `**` has to be tried before `*`, or bold is read
     * as an empty italic followed by stray asterisks.
     */
    private fun rules(palette: Palette) = listOf(
        Rule("***", SpanStyle(fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic)),
        Rule("**", SpanStyle(fontWeight = FontWeight.Bold)),
        Rule("__", SpanStyle(textDecoration = TextDecoration.Underline)),
        Rule("~~", SpanStyle(textDecoration = TextDecoration.LineThrough)),
        Rule("||", SpanStyle()), // styled in `inline`, which knows whether it is open
        Rule("*", SpanStyle(fontStyle = FontStyle.Italic)),
        Rule("_", SpanStyle(fontStyle = FontStyle.Italic)),
    )

    /** `@&Role-Name` (role pings, as the web writes them) or `@username`. */
    private val MENTION = Regex("(?<![\\w.])@(&[A-Za-z0-9_-]{1,64}|[A-Za-z0-9_.]{1,32})")

    private data class RoleInfo(val name: String, val color: Color?)

    /** The open space's roles by slug, so role pings show in their colour (as on web and iOS). */
    @Volatile private var roles: Map<String, RoleInfo> = emptyMap()

    fun setRoles(list: List<Pair<String, String>>) {
        roles = list.mapNotNull { (name, hex) ->
            val slug = roleSlug(name).lowercase()
            if (slug.isEmpty()) null else slug to RoleInfo(name, roleColour(hex))
        }.toMap()
    }

    /** `roleMentionSlug` in `src/lib/utils.ts`. */
    private fun roleSlug(name: String): String =
        name.trim()
            .replace(Regex("\\s+"), "-")
            .replace(Regex("[^a-zA-Z0-9_-]"), "")
            .replace(Regex("-+"), "-")
            .trim('-')

    /** Grey (a new role's default) keeps the usual accent chip. */
    private fun roleColour(hex: String): Color? {
        val c = hex.trim().lowercase()
        if (c.length != 7 || !c.startsWith("#") || c in setOf("#949ba4", "#99aab5", "#000000")) return null
        val v = c.drop(1).toLongOrNull(16) ?: return null
        return Color(0xFF000000 or v)
    }

    /**
     * Inline markers, resolved left to right.
     *
     * Inline code is matched before everything else so `**x**` inside
     * backticks stays literal, and mentions are applied last so a name inside
     * emphasis still reads as a mention.
     */
    /** Whether the text has a ||spoiler|| to tap open. */
    fun hasSpoiler(raw: String): Boolean = Regex("\\|\\|[\\s\\S]+?\\|\\|").containsMatchIn(raw)

    fun inline(text: String, palette: Palette, baseSize: TextUnit = 15.sp, reveal: Boolean = false): AnnotatedString =
        buildAnnotatedString {
            var rest = text
            val ruleSet = rules(palette)

            while (rest.isNotEmpty()) {
                val code = Regex("`([^`\\n]+)`").find(rest)
                var bestIndex = code?.range?.first ?: Int.MAX_VALUE
                var bestRule: Rule? = null
                var bestMatch: MatchResult? = null

                for (rule in ruleSet) {
                    val quoted = Regex.escape(rule.marker)
                    val found = Regex("$quoted([\\s\\S]+?)$quoted").find(rest) ?: continue
                    if (found.range.first < bestIndex) {
                        bestIndex = found.range.first
                        bestRule = rule
                        bestMatch = found
                    }
                }

                if (bestIndex == Int.MAX_VALUE) {
                    appendPlain(rest, palette)
                    break
                }

                appendPlain(rest.substring(0, bestIndex), palette)

                if (bestRule == null && code != null) {
                    pushStyle(
                        SpanStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = baseSize * 0.9f,
                            background = palette.elevated,
                            color = palette.textPrimary,
                        )
                    )
                    append(code.groupValues[1])
                    pop()
                    rest = rest.substring(code.range.last + 1)
                } else {
                    val match = bestMatch!!
                    val inner = inline(match.groupValues[1], palette, baseSize, reveal)
                    if (bestRule!!.marker == "||" && !reveal) {
                        // Hidden: a dark bar the width of the text. Plain text,
                        // so a mention's own colour can't show through.
                        pushStyle(SpanStyle(background = Color(0xFF202225), color = Color.Transparent))
                        append(inner.text)
                    } else if (bestRule.marker == "||") {
                        pushStyle(SpanStyle(background = palette.textPrimary.copy(alpha = 0.1f)))
                        append(inner)
                    } else {
                        pushStyle(bestRule.style)
                        // Recursive: `**a *b* c**` keeps both.
                        append(inner)
                    }
                    pop()
                    rest = rest.substring(match.range.last + 1)
                }
            }
        }

    /** Plain text, with @mentions tinted. */
    private fun androidx.compose.ui.text.AnnotatedString.Builder.appendPlain(
        text: String,
        palette: Palette,
    ) {
        if (text.isEmpty()) return
        var cursor = 0
        for (mention in MENTION.findAll(text)) {
            append(text.substring(cursor, mention.range.first))
            val role = if (mention.value.startsWith("@&")) roles[mention.value.drop(2).lowercase()] else null
            val tint = role?.color ?: palette.accent
            pushStyle(
                SpanStyle(
                    color = tint,
                    background = tint.copy(alpha = if (role?.color != null) 0.18f else 0.15f),
                    fontWeight = FontWeight.Medium,
                )
            )
            append(
                when {
                    role != null -> "@${role.name}"
                    mention.value.startsWith("@&") -> "@" + mention.value.drop(2).replace('-', ' ')
                    else -> mention.value
                }
            )
            pop()
            cursor = mention.range.last + 1
        }
        append(text.substring(cursor))
    }
}
