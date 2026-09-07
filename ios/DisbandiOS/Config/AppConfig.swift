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

    /// Giphy search and link previews — the CDN serves these too now.
    ///
    /// They were the last two things still going to the old media host, which
    /// answered slowly and sometimes 502'd, so every link in a chat waited on
    /// it. Kept as its own value rather than folded into `cdnURL` so one
    /// endpoint can be moved without taking image storage with it.
    static let mediaAPIURL = URL(string: "https://cdn.disband.dev/v1")!

    /// Where uploads go and where images are served from.
    static let cdnURL = URL(string: "https://cdn.disband.dev/v1")!

    /// Public web origin for shareable links / invites.
    static let webAppURL = URL(string: "https://www.disband.dev")!

    /// Where confirmation and recovery emails land. A real page, so a user who
    /// taps the link in their mail app sees that it worked instead of a blank
    /// redirect.
    static let emailVerificationURL = URL(string: "https://www.disband.dev/verification")!

    // MARK: - Calls

    /// STUN only. The relay is fetched per session by ``TurnService`` because
    /// its credentials are time-limited and cannot be compiled in; these stay
    /// as the direct-connection path, which is always cheaper and lower latency
    /// than relaying, and as the fallback when no relay is available.
    ///
    /// Must match the web app's list, or the two ends can gather candidates
    /// that never pair up.
    static let baseIceServers = [
        RTCIceServer(urlStrings: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
        ])
    ]
}

/// Process-wide shared Supabase client.
///
/// Session storage goes through ``ResilientAuthStorage`` rather than the SDK's
/// Keychain default: a Keychain that refuses to vend items (a build missing its
/// `application-identifier` entitlement) otherwise leaves the app signed in
/// with a token it can never read back, which surfaces as an account with no
/// data in it and a session that "expired" immediately.
enum SupabaseManager {
    static let authStorage = ResilientAuthStorage()

    static let client: SupabaseClient = {
        SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabaseAnonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    storage: authStorage,
                    redirectToURL: AppConfig.emailVerificationURL
                )
            )
        )
    }()
}
