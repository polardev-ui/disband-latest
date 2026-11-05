package com.wsgpolar.disband.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class BadgeDef(
    val key: String,
    val name: String,
    val description: String = "",
    val category: String = "",
    val accent: String = "#99AAB5",
    val sort: Int = 0,
)

@Serializable
private data class UserBadgeRow(
    @SerialName("user_id") val userId: String,
    @SerialName("badge_key") val badgeKey: String,
    @SerialName("awarded_at") val awardedAt: String? = null,
    val visible: Boolean? = null,
)

data class AwardedBadge(
    val def: BadgeDef,
    val awardedAt: String? = null,
)

/**
 * Badge catalogue + awards, mirroring iOS BadgeService.
 *
 * The catalogue lives in `badges`; what somebody holds lives in
 * `user_badges`. Unknown keys still render (fallback colour + initial)
 * so a badge added server-side appears instead of vanishing.
 * Failures degrade to the legacy `show_*` flags on the profile.
 */
class BadgeService {
    var catalogue by mutableStateOf<Map<String, BadgeDef>>(emptyMap())
        private set

    private val cache = mutableMapOf<String, List<AwardedBadge>>()

    suspend fun loadCatalogue() {
        if (catalogue.isNotEmpty()) return
        runCatching {
            val defs = DisbandSupabase.client.from("badges")
                .select(Columns.ALL)
                .decodeList<BadgeDef>()
            catalogue = defs.associateBy { it.key }
        }
    }

    suspend fun badgesFor(userId: String): List<AwardedBadge> {
        cache[userId]?.let { return it }
        loadCatalogue()
        val rows = runCatching {
            DisbandSupabase.client.from("user_badges")
                .select(Columns.list("user_id", "badge_key", "awarded_at")) {
                    filter {
                        eq("user_id", userId)
                        eq("visible", true)
                    }
                }
                .decodeList<UserBadgeRow>()
        }.getOrDefault(emptyList())
        val out = rows.mapNotNull { row ->
            catalogue[row.badgeKey]?.let { AwardedBadge(it, row.awardedAt) }
        }.sortedBy { it.def.sort }
        cache[userId] = out
        return out
    }

    fun invalidate(userId: String) {
        cache.remove(userId)
    }

    /** Every badge you hold, shown or hidden, for the Badges settings screen. */
    suspend fun ownBadges(userId: String): List<Pair<AwardedBadge, Boolean>> {
        loadCatalogue()
        val rows = DisbandSupabase.client.from("user_badges")
            .select(Columns.list("user_id", "badge_key", "awarded_at", "visible")) {
                filter { eq("user_id", userId) }
            }
            .decodeList<UserBadgeRow>()
        return rows.mapNotNull { row ->
            catalogue[row.badgeKey]?.let { AwardedBadge(it, row.awardedAt) to (row.visible ?: true) }
        }.sortedBy { it.first.def.sort }
    }

    /** Hiding a badge only takes it off your profile; you keep it. */
    suspend fun setVisible(userId: String, key: String, visible: Boolean) {
        DisbandSupabase.postgrest.rpc(
            "set_badge_visible",
            buildJsonObject {
                put("p_key", key)
                put("p_visible", visible)
            },
        )
        invalidate(userId)
    }
}
