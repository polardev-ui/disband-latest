package com.wsgpolar.disband.core

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

object TimeFormat {
    private val iso: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSXXX").withZone(ZoneId.systemDefault())
    private val isoFallback: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX").withZone(ZoneId.systemDefault())

    fun parse(string: String?): Instant? {
        return try {
            if (string == null) null
            else Instant.from(iso.parse(string))
        } catch (_: Exception) {
            try {
                if (string == null) null else Instant.from(isoFallback.parse(string))
            } catch (_: Exception) {
                null
            }
        }
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