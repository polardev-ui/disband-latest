package com.wsgpolar.disband.data

import com.wsgpolar.disband.core.DisbandSupabase
import io.github.jan.supabase.postgrest.from

/** Profile column updates, mirroring `ios/DisbandiOS/Services/ProfileService.swift`. */
object ProfileService {
    private val client get() = DisbandSupabase.client

    private fun currentUserId(): String? = runCatching {
        DisbandSupabase.auth.currentUserOrNull()?.id
    }.getOrNull()

    suspend fun update(displayName: String, bio: String) {
        val uid = currentUserId() ?: return
        runCatching {
            client.from("profiles").update({
                set("display_name", displayName.trim())
                set("bio", bio.trim())
            }) {
                filter { eq("id", uid) }
            }
        }
    }

    suspend fun updateTheme(theme: String) {
        val uid = currentUserId() ?: return
        runCatching {
            client.from("profiles").update({ set("theme", theme) }) {
                filter { eq("id", uid) }
            }
        }
    }

    suspend fun updateAccent(color1: String?, color2: String?) {
        val uid = currentUserId() ?: return
        runCatching {
            client.from("profiles").update({
                color1?.let { set("accent_color", it) }
                color2?.let { set("accent_color_2", it) }
            }) {
                filter { eq("id", uid) }
            }
        }
    }

    suspend fun updateStatus(status: UserStatus) {
        val uid = currentUserId() ?: return
        runCatching {
            client.from("profiles").update({
                set("preferred_status", status.raw)
                set("status", status.raw)
            }) {
                filter { eq("id", uid) }
            }
        }
    }

    suspend fun updateAvatar(url: String) {
        val uid = currentUserId() ?: return
        runCatching {
            client.from("profiles").update({ set("avatar_url", url) }) {
                filter { eq("id", uid) }
            }
        }
    }

    suspend fun updateBanner(url: String) {
        val uid = currentUserId() ?: return
        runCatching {
            client.from("profiles").update({ set("banner_url", url) }) {
                filter { eq("id", uid) }
            }
        }
    }
}