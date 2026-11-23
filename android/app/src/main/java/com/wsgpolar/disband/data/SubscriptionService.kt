package com.wsgpolar.disband.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Plans, mirroring the web's `SubscriptionPlan` and the iOS enum: Free, and
 * Disband Aero.
 *
 * Basic and Super were merged into Aero (migration 0072). Rows written before
 * that still say "basic" or "super", and gifts may too, so every raw value
 * goes through [normalize] — the port of the web's `normalizePlan`. Decoding
 * "aero" against a naive enum is what made every Aero subscriber look
 * unsubscribed on iPhone; Android never read the table at all, which had the
 * same effect for everyone.
 */
enum class SubscriptionPlan {
    Free,
    Lite,
    Aero;

    /** Aero-only perks (premium themes, Tether). Lite is paid but does not get these. */
    val isPaid: Boolean get() = this == Aero

    /** Any paid plan: decides whether to show the subscriber card or the upsell. */
    val isSubscribed: Boolean get() = this != Free

    val label: String get() = when (this) { Aero -> "Aero"; Lite -> "Lite"; Free -> "Free" }
    val productName: String get() = "Disband $label"

    companion object {
        fun normalize(raw: String?): SubscriptionPlan = when (raw?.lowercase()) {
            "aero", "basic", "super" -> Aero
            "lite" -> Lite
            else -> Free
        }
    }
}

@Serializable
private data class EntitlementResult(
    val plan: String? = null,
    @SerialName("gift_until") val giftUntil: String? = null,
)

@Serializable
data class Subscription(
    @SerialName("user_id") val userId: String,
    val plan: String,
    val status: String,
    @SerialName("current_period_end") val currentPeriodEnd: String? = null,
    /** "stripe" or "apple". Null on rows written before migration 0045. */
    val provider: String? = null,
) {
    /**
     * Billed through the App Store, so only Apple can change the card, cancel
     * it or refund it. Android cannot offer to manage one of these, and must
     * not pretend otherwise.
     */
    val isApple: Boolean get() = provider == "apple"
}

/**
 * Feature limits per plan. Kept in step with `ENTITLEMENTS` in
 * `src/lib/subscription.ts` and `Entitlements` on iOS — if you change one,
 * change all three. A client that claims a perk the server does not grant is
 * a refund request.
 */
data class Entitlements(
    val maxUploadBytes: Long,
    val maxMessageChars: Int,
    val maxBioLength: Int,
    val animatedAvatar: Boolean,
    val animatedBanner: Boolean,
    val screenShare: Boolean,
    val historyExport: Boolean,
    val prioritySupport: Boolean,
) {
    companion object {
        val Free = Entitlements(
            maxUploadBytes = 50L * 1024 * 1024,
            maxMessageChars = 2000,
            maxBioLength = 190,
            animatedAvatar = false,
            animatedBanner = false,
            screenShare = true,
            historyExport = false,
            prioritySupport = false,
        )
        val Aero = Entitlements(
            maxUploadBytes = 500L * 1024 * 1024,
            maxMessageChars = 4000,
            maxBioLength = 230,
            animatedAvatar = true,
            animatedBanner = true,
            screenShare = true,
            historyExport = true,
            prioritySupport = true,
        )

        val Lite = Entitlements(
            maxUploadBytes = 100L * 1024 * 1024,
            maxMessageChars = 2500,
            maxBioLength = 200,
            animatedAvatar = false,
            animatedBanner = false,
            screenShare = true,
            historyExport = false,
            prioritySupport = false,
        )

        fun forPlan(plan: SubscriptionPlan) = when (plan) {
            SubscriptionPlan.Aero -> Aero
            SubscriptionPlan.Lite -> Lite
            SubscriptionPlan.Free -> Free
        }
    }
}

/**
 * Tracks the signed-in user's subscription and keeps entitlements live.
 *
 * Android had none of this: no plan, no entitlements, no badge. Someone
 * paying for Aero got the free limits on their phone — a 50 MB upload cap
 * they had paid to be rid of — and no sign anywhere that they were a
 * subscriber.
 *
 * Which statuses count as paid matches the other clients exactly: `trialing`
 * is paid intent, and `past_due` means a renewal is being retried, so cutting
 * perks there would punish someone whose card merely needs updating.
 */
class SubscriptionService {

    var subscription by mutableStateOf<Subscription?>(null)
        private set
    var plan by mutableStateOf(SubscriptionPlan.Free)
        private set
    var loading by mutableStateOf(true)
        private set

    val entitlements: Entitlements get() = Entitlements.forPlan(plan)

    /** Set when the plan comes from a gift (dashboard grant, giveaway) rather than billing. */
    var giftUntil by mutableStateOf<String?>(null)
        private set

    private var userId: String? = null
    private var loaded = false

    private val grantingStatuses = setOf("active", "trialing", "past_due")

    suspend fun start(userId: String?) {
        // A failed first load must not stick for the whole session.
        if (this.userId == userId && (loaded || userId == null)) return
        this.userId = userId
        loaded = false
        if (userId == null) {
            subscription = null
            giftUntil = null
            plan = SubscriptionPlan.Free
            loading = false
            return
        }
        reload()
    }

    suspend fun reload() {
        val uid = userId ?: return
        loading = true
        try {
            val rows = DisbandSupabase.client.from("subscriptions")
                .select(Columns.ALL) {
                    filter { eq("user_id", uid) }
                    limit(1)
                }
                .decodeList<Subscription>()
            val row = rows.firstOrNull()
            // The server's answer counts gifts and Lite, as the web does.
            // Reading only `subscriptions` treated gifted Aero as Free.
            val granted = runCatching {
                DisbandSupabase.client.postgrest.rpc("get_entitlement").decodeAs<EntitlementResult>()
            }.getOrNull()
            subscription = row
            plan = granted?.plan?.let { SubscriptionPlan.normalize(it) } ?: planFrom(row)
            giftUntil = granted?.giftUntil
            loaded = true
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) {
            // Leave the last known plan in place rather than silently
            // downgrading a paying user because one request failed.
        } finally {
            loading = false
        }
    }

    private fun planFrom(row: Subscription?): SubscriptionPlan =
        if (row != null && row.status in grantingStatuses) SubscriptionPlan.normalize(row.plan)
        else SubscriptionPlan.Free
}
