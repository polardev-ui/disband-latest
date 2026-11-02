import Foundation

/// What someone is listening to, as `profiles.listening` stores it.
/// Mirrors `Listening` in src/lib/spotify.ts. Every field the web might leave
/// out is optional, and strings stay strings, so an odd row can never make
/// the whole profile fail to decode.
struct Listening: Codable, Hashable, Sendable {
    var source: String?
    var track: String?
    var artists: String?
    var artwork: String?
    var trackUrl: String?
    var album: String?
    var durationMs: Double?
    var startedAt: String?

    enum CodingKeys: String, CodingKey {
        case source, track, artists, artwork, album
        case trackUrl = "track_url"
        case durationMs = "duration_ms"
        case startedAt = "started_at"
    }

    var startedDate: Date? { RelativeTime.date(from: startedAt) }

    /// Whether this is still plausibly playing. The row is only rewritten while
    /// one of the person's Disband apps is open, so a song whose length has run
    /// out (plus a little slack for pauses) belongs to a session that ended.
    /// Without a length, fall back to the web's six-hour rule.
    func isCurrent(now: Date = Date()) -> Bool {
        guard let track, !track.isEmpty, let started = startedDate else { return false }
        if let durationMs, durationMs > 0 {
            return now.timeIntervalSince(started) < durationMs / 1000 + 90
        }
        return now.timeIntervalSince(started) < 6 * 60 * 60
    }

    /// Same track, ignoring the position, for deciding whether to republish.
    var identity: String { "\(source ?? "")|\(track ?? "")|\(artists ?? "")|\(album ?? "")" }
}

/// A game (or other app) in progress, as `profiles.activity` stores it.
/// Mirrors `Activity` in src/lib/activity.ts.
struct ProfileActivity: Codable, Hashable, Sendable {
    struct Button: Codable, Hashable, Sendable {
        var label: String?
        var url: String?
    }

    var kind: String?
    var name: String?
    var details: String?
    var state: String?
    var startedAt: String?
    var endsAt: String?
    var largeImage: String?
    var largeText: String?
    var smallImage: String?
    var smallText: String?
    var buttons: [Button]?
    var source: String?
    var expiresAt: String?

    enum CodingKeys: String, CodingKey {
        case kind, name, details, state, buttons, source
        case startedAt = "started_at"
        case endsAt = "ends_at"
        case largeImage = "large_image"
        case largeText = "large_text"
        case smallImage = "small_image"
        case smallText = "small_text"
        case expiresAt = "expires_at"
    }

    /// Every activity carries an expiry the desktop app keeps pushing forward
    /// while the game runs, so an expired one is a game that stopped.
    func isLive(now: Date = Date()) -> Bool {
        guard let name, !name.isEmpty, let expires = RelativeTime.date(from: expiresAt) else { return false }
        return expires > now
    }

    /// "Playing", "Listening to", and so on, as the web labels them.
    var verb: String {
        switch kind {
        case "streaming": return "Streaming"
        case "listening": return "Listening to"
        case "watching": return "Watching"
        case "competing": return "Competing in"
        default: return "Playing"
        }
    }
}
