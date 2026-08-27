import Foundation
import Supabase
import WebRTC

/// Backend configuration. These mirror the public client-side values used by the
/// web/desktop app (`src/lib/public-env.ts`) — the anon key is intentionally
/// client-visible and is gated by Supabase Row Level Security.
enum AppConfig {
    static let supabaseURL = URL(string: "https://mjqbrcabargylrimlafw.supabase.co")!

    static let supabaseAnonKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcWJyY2FiYXJneWxyaW1sYWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDU2MzQsImV4cCI6MjA5NzU4MTYzNH0.wPZ49DaEv_NDyXovBwLcgyeoHxnvuSEa693zOmGMBbM"

    /// Custom media API used for all image/video/file uploads (mirrors NEXT_PUBLIC_MEDIA_API_URL).
    static let mediaAPIURL = URL(string: "https://api.wsgpolar.me/v1")!

    /// Public web origin for shareable links / invites.
    static let webAppURL = URL(string: "https://www.disband.dev")!

    // MARK: - Calls

    /// TURN relay, mirroring NEXT_PUBLIC_TURN_* on the web.
    ///
    /// STUN alone cannot carry media. A phone is usually behind carrier-grade
    /// NAT, so a mobile-to-desktop call often has no direct candidate pair and
    /// connects with no audio in either direction. Leave empty to run without a
    /// relay; calls between a phone and a desktop will be unreliable until it
    /// is filled in.
    static let turnURLs: [String] = []
    static let turnUsername = ""
    static let turnCredential = ""

    /// STUN plus TURN when configured. Must match the web app's list, or the
    /// two ends can gather candidates that never pair up.
    static var iceServers: [RTCIceServer] {
        var servers = [
            RTCIceServer(urlStrings: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
            ])
        ]
        if !turnURLs.isEmpty {
            servers.append(
                RTCIceServer(
                    urlStrings: turnURLs,
                    username: turnUsername,
                    credential: turnCredential
                )
            )
        }
        return servers
    }
}

/// Process-wide shared Supabase client. Auth tokens are persisted in the
/// Keychain automatically by the SDK, so sessions survive app relaunches.
enum SupabaseManager {
    static let client: SupabaseClient = {
        SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabaseAnonKey
        )
    }()
}
