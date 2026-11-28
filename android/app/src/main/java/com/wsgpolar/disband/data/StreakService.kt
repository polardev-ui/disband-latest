package com.wsgpolar.disband.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters

/**
 * The daily streak, ported from iOS `StreakService`: open Disband on
 * consecutive days to keep it going. Kept on the device, counted by calendar
 * day in the local time zone. Milestones get a small celebration.
 */
object StreakService {
    data class State(
        val current: Int = 0,
        val best: Int = 0,
        /** Days opened in the last two weeks. */
        val recent: Set<LocalDate> = emptySet(),
        /** Set when today's visit reached a milestone; the card celebrates once. */
        val milestone: Int? = null,
    ) {
        val nextMilestone: Int get() = MILESTONES.firstOrNull { it > current } ?: (current + 100)
    }

    val MILESTONES = listOf(3, 7, 14, 30, 50, 100, 365)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var loaded = false

    private fun prefs(context: Context) = context.getSharedPreferences("disband_streak", Context.MODE_PRIVATE)

    private fun load(context: Context) {
        if (loaded) return
        loaded = true
        val p = prefs(context)
        val last = p.getString("last", null)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        var current = p.getInt("current", 0)
        // A streak whose last day is before yesterday has lapsed.
        if (last != null && ChronoUnit.DAYS.between(last, LocalDate.now()) > 1) current = 0
        val recent = p.getStringSet("recent", emptySet()).orEmpty()
            .mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }.toSet()
        _state.value = State(current, p.getInt("best", 0), recent)
    }

    /** Count today. Call when the app comes to the foreground. */
    fun recordVisit(context: Context) {
        load(context)
        val p = prefs(context)
        val today = LocalDate.now()
        val last = p.getString("last", null)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        if (last == today) return
        val now = _state.value
        val next = if (last != null && ChronoUnit.DAYS.between(last, today) == 1L) now.current + 1 else 1
        val cutoff = today.minusDays(14)
        val recent = (now.recent + today).filter { !it.isBefore(cutoff) }.toSet()
        val best = maxOf(now.best, next)
        p.edit()
            .putInt("current", next)
            .putInt("best", best)
            .putString("last", today.toString())
            .putStringSet("recent", recent.map { it.toString() }.toSet())
            .apply()
        _state.value = State(next, best, recent, milestone = next.takeIf { it in MILESTONES })
    }

    fun celebrated() { _state.value = _state.value.copy(milestone = null) }

    /** Monday to Sunday of this week: label, visited, today. */
    fun week(state: State): List<Triple<String, Boolean, Boolean>> {
        val today = LocalDate.now()
        val monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val labels = listOf("M", "T", "W", "T", "F", "S", "S")
        return (0 until 7).map { i ->
            val day = monday.plusDays(i.toLong())
            Triple(labels[i], day in state.recent, day == today)
        }
    }
}
