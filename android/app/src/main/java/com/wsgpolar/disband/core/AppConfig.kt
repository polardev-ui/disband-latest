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

    /** Custom media API for all image/video/file uploads (mirrors NEXT_PUBLIC_MEDIA_API_URL). */
    const val MEDIA_API_URL = "https://api.wsgpolar.me/v1"

    /** Public web origin for shareable links / invites. */
    const val WEB_APP_URL = "https://www.disband.dev"

    /** STUN only. The relay is fetched per session by TurnService. */
    val baseIceServers = listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
    )

    /** 7-character invite codes on /server/CODE and /invite/CODE links. */
    val INVITE_REGEX = Regex("(?:https?://[^\\s]+)?(?:/server/|/invite/)([a-zA-Z0-9]{7})\\b")
}