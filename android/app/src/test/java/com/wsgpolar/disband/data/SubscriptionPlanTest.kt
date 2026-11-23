package com.wsgpolar.disband.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SubscriptionPlanTest {
    @Test fun legacyPlansAreAero() {
        assertEquals(SubscriptionPlan.Aero, SubscriptionPlan.normalize("basic"))
        assertEquals(SubscriptionPlan.Aero, SubscriptionPlan.normalize("SUPER"))
        assertEquals(SubscriptionPlan.Aero, SubscriptionPlan.normalize("aero"))
    }

    @Test fun liteIsItsOwnPlan() {
        val lite = SubscriptionPlan.normalize("lite")
        assertEquals(SubscriptionPlan.Lite, lite)
        assertTrue(lite.isSubscribed)
        // Lite does not get Aero-only perks (premium themes, Tether).
        assertFalse(lite.isPaid)
        assertEquals(100L * 1024 * 1024, Entitlements.forPlan(lite).maxUploadBytes)
        assertEquals(200, Entitlements.forPlan(lite).maxBioLength)
    }

    @Test fun unknownIsFree() {
        assertEquals(SubscriptionPlan.Free, SubscriptionPlan.normalize(null))
        assertEquals(SubscriptionPlan.Free, SubscriptionPlan.normalize("free"))
        assertFalse(SubscriptionPlan.Free.isSubscribed)
    }
}
