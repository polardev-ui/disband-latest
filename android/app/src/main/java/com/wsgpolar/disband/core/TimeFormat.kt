package com.wsgpolar.disband.core

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

object TimeFormat {
    /**
     * Postgres' own rendering, with a space instead of a `T`. Only reached
     * for values that did not come through PostgREST.
     */
    private val spaced: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss[.SSSSSSSSS][.SSSSSS][.SSS]XXX")
            .withZone(ZoneId.systemDefault())

    /**
     * Turn a server timestamp into an instant.
     *
     * This used to insist on exactly three fractional digits
     * (`yyyy-MM-dd'T'HH:mm:ss.SSSXXX`), with a fallback that allowed none at
     * all. Postgres emits however many it has — `…:14.69127+00:00` is five —
     * so both patterns threw and every timestamp in the app silently became
     * an empty string. Message rows had no time next to the name at all, and
     * nothing failed loudly enough to notice.
     *
     * `ISO_OFFSET_DATE_TIME` accepts any number of fractional digits, which
     * is what the format actually guarantees.
     */
    fun parse(string: String?): Instant? {
        if (string.isNullOrBlank()) return null
        // Ordered by how the server actually sends them.
        for (attempt in listOf<(String) -> Instant>(
            { Instant.from(DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse(it)) },
            { Instant.parse(it) },
            { Instant.from(spaced.parse(it)) },
            // No offset at all: Postgres `timestamp without time zone`, which
            // this schema stores in UTC.
            { java.time.LocalDateTime.parse(it).toInstant(java.time.ZoneOffset.UTC) },
        )) {
            runCatching { return attempt(string) }
        }
        return null
    }

    /**
     * Whole minutes from `earlier` to `later`, or null when either is
     * unparseable. Used to decide whether consecutive messages read as one
     * run or deserve a fresh header.
     */
    fun minutesBetween(earlier: String?, later: String?): Long? {
        val a = parse(earlier) ?: return null
        val b = parse(later) ?: return null
        return ChronoUnit.MINUTES.between(a, b)
    }

    /** Compact relative timestamp: "now", "5m", "2h", "Yesterday", "Mon", "Aug 5". */
    fun compact(string: String?): String {
        val date = parse(string) ?: return ""
        val now = Instant.now()
        val seconds = ChronoUnit.SECONDS.between(date, now)
        if (seconds < 60) return "now"
        if (seconds < 3600) return "${seconds / 60}m"
        val hour = ChronoUnit.HOURS.between(date, now)
        val day = LocalDate.ofInstant(now, ZoneId.systemDefault())
        val thatDay = LocalDate.ofInstant(date, ZoneId.systemDefault())
        if (thatDay == day) return "${hour}h"
        if (thatDay == day.minusDays(1)) return "Yesterday"
        val days = ChronoUnit.DAYS.between(thatDay, day)
        if (days < 7) return thatDay.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault())
        return thatDay.format(DateTimeFormatter.ofPattern("MMM d"))
    }

    /** Longer relative timestamp for message rows. */
    fun short(string: String?): String {
        val date = parse(string) ?: return ""
        val zone = ZoneId.systemDefault()
        val local = LocalDateTime.ofInstant(date, zone)
        val today = LocalDate.now(zone)
        val thatDay = local.toLocalDate()
        return when {
            thatDay == today -> local.format(DateTimeFormatter.ofPattern("h:mm a"))
            thatDay == today.minusDays(1) ->
                "Yesterday ${local.format(DateTimeFormatter.ofPattern("h:mm a"))}"
            java.time.temporal.ChronoUnit.DAYS.between(thatDay, today) < 7 ->
                local.format(DateTimeFormatter.ofPattern("EEE h:mm a"))
            else -> local.format(DateTimeFormatter.ofPattern("MMM d"))
        }
    }

    /** ISO-8601 stamp for edited_at. */
    fun nowStamp(): String =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSXXX").withZone(ZoneId.systemDefault())
            .format(Instant.now())
}