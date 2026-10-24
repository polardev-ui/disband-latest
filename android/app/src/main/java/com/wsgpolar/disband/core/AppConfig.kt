package com.wsgpolar.disband.core

import org.webrtc.PeerConnection

/**
 * Backend configuration. Mirrors the values used by the iOS app
 * (`ios/DisbandiOS/Config/AppConfig.swift`) and the web/desktop app
 * (`src/lib/public-env.ts`). The anon key is intentionally client-visible and
 * gated by Supabase Row Level Security.
 */
object AppConfig {
    const val SUPABASE_URL = "https://mjqbrcabargylrimlafw.supabase.co"

    const val SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcWJyY2FiYXJneWxyaW1sYWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDU2MzQsImV4cCI6MjA5NzU4MTYzNH0.wPZ49DaEv_NDyXovBwLcgyeoHxnvuSEa693zOmGMBbM"

    /**
     * Uploads, image delivery, Giphy search and link previews (mirrors
     * NEXT_PUBLIC_MEDIA_API_URL). Everything now goes to the CDN; the old
     * media host answered slowly and sometimes 502'd.
     */
    const val MEDIA_API_URL = "https://cdn.disband.dev/v1"

    /** Public web origin for shareable links / invites. */
    const val WEB_APP_URL = "https://www.disband.dev"

    /** Invites read disband.dev/server/<code>, matching the web; the bare host redirects to www. */
    const val INVITE_BASE_URL = "https://disband.dev"

    /** STUN only. The relay is fetched per session by TurnService. */
    val baseIceServers = listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
    )

    /** Invite codes in message text: 7-character generated, 3–24 character custom, 32-character older ones. */
    val INVITE_REGEX = Regex("(?:https?://(?:www\\.)?disband\\.dev|(?<![\\w/.:-]))/(?:server|invite)/([a-zA-Z0-9-]{3,32})(?![\\w-])")

    /**
     * The code in a link that opened the app. Looser than [INVITE_REGEX],
     * which finds invites inside message text: a link to /server/CODE is
     * unambiguous, and codes come in more shapes than seven characters —
     * 14, 15 and 32-character generated ones, and vanity codes of up to 24
     * letters, digits and hyphens. The seven-only pattern turned all of
     * those into links that opened the app and did nothing.
     */
    val INVITE_LINK_REGEX = Regex("/(?:server|invite)/([A-Za-z0-9-]{2,64})", RegexOption.IGNORE_CASE)
}