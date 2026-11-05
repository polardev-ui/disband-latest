import SwiftUI

/// Only plain https links are drawn or opened, like the web's `safeImageUrl`:
/// Rich Presence sends asset keys and other schemes too.
private func safeURL(_ string: String?) -> URL? {
    guard let string, let url = URL(string: string), url.scheme == "https", url.host != nil else { return nil }
    return url
}

/// "Listening to Spotify": artwork, track, artist and a progress bar, as on the
/// web's `ListeningCard`. Opens the track in Spotify when tapped.
struct ListeningCard: View {
    let listening: Listening

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            card(now: context.date)
        }
    }

    private func card(now: Date) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "music.note")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color(hex: 0x1DB954))
                Text(listening.source == "spotify" ? "Listening to Spotify" : "Listening to music")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.textMuted)
            }
            HStack(spacing: 12) {
                RemoteImage(url: safeURL(listening.artwork)?.absoluteString) {
                    ZStack {
                        Brand.elevated
                        Image(systemName: "music.note").foregroundStyle(Brand.textMuted)
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(listening.track ?? "")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    if let artists = listening.artists, !artists.isEmpty {
                        Text("by \(artists)")
                            .font(.caption)
                            .foregroundStyle(Brand.textSecondary)
                            .lineLimit(1)
                    }
                    if let album = listening.album, !album.isEmpty {
                        Text("on \(album)")
                            .font(.caption)
                            .foregroundStyle(Brand.textMuted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            if let progress = progress(now: now) {
                VStack(spacing: 4) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Brand.elevated)
                            Capsule().fill(Brand.textPrimary).frame(width: geo.size.width * progress.fraction)
                        }
                    }
                    .frame(height: 4)
                    HStack {
                        Text(clock(progress.elapsed))
                        Spacer()
                        Text(clock(progress.total))
                    }
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Brand.textMuted)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture {
            if let url = safeURL(listening.trackUrl) { UIApplication.shared.open(url) }
        }
        .accessibilityElement(children: .combine)
    }

    private func progress(now: Date) -> (fraction: Double, elapsed: Double, total: Double)? {
        guard let started = listening.startedDate, let ms = listening.durationMs, ms > 0 else { return nil }
        let total = ms / 1000
        let elapsed = min(max(now.timeIntervalSince(started), 0), total)
        return (elapsed / total, elapsed, total)
    }

    private func clock(_ seconds: Double) -> String {
        let s = Int(seconds)
        return "\(s / 60):\(String(format: "%02d", s % 60))"
    }
}

/// A game in progress, like the web's `ActivityCard`: the game's art large, its
/// own logo as a small badge, the Rich Presence lines, a running clock, and
/// any buttons the game offers.
struct GameActivityCard: View {
    let activity: ProfileActivity
    /// Art found by name when the player's client sent none (`/api/game-art`).
    @State private var foundArt: String?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            card(now: context.date)
        }
        .task(id: activity.name) {
            guard activity.largeImage == nil, (activity.kind ?? "playing") == "playing",
                  let name = activity.name, !name.isEmpty else { return }
            foundArt = await GameArt.lookup(name: name, appId: activity.applicationId)
        }
    }

    private func card(now: Date) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(activity.verb)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Brand.textMuted)
            HStack(spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    RemoteImage(url: safeURL(activity.largeImage ?? foundArt)?.absoluteString) {
                        ZStack {
                            Brand.elevated
                            Image(systemName: "gamecontroller.fill")
                                .font(.title2)
                                .foregroundStyle(Brand.textMuted)
                        }
                    }
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    if let small = safeURL(activity.smallImage) {
                        RemoteImage(url: small.absoluteString) { Brand.elevated }
                            .frame(width: 24, height: 24)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Brand.surface, lineWidth: 3))
                            .offset(x: 6, y: 6)
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(activity.name ?? "")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    if let details = activity.details, !details.isEmpty {
                        Text(details).font(.caption).foregroundStyle(Brand.textSecondary).lineLimit(1)
                    }
                    if let state = activity.state, !state.isEmpty {
                        Text(state).font(.caption).foregroundStyle(Brand.textSecondary).lineLimit(1)
                    }
                    if let clock = clock(now: now) {
                        Text(clock)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(Color(hex: 0x3BA55C))
                    }
                }
                Spacer(minLength: 0)
            }

            let buttons = (activity.buttons ?? []).compactMap { b -> (String, URL)? in
                guard let label = b.label, !label.isEmpty, let url = safeURL(b.url) else { return nil }
                return (label, url)
            }
            if !buttons.isEmpty {
                VStack(spacing: 6) {
                    ForEach(buttons.prefix(2), id: \.1) { label, url in
                        Link(destination: url) {
                            Text(label)
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .frame(height: 36)
                                .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .foregroundStyle(Brand.textPrimary)
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// "1:04 left" for a countdown, otherwise "12:04 elapsed".
    private func clock(now: Date) -> String? {
        if let ends = RelativeTime.date(from: activity.endsAt), ends > now {
            let left = Int(ends.timeIntervalSince(now).rounded(.up))
            return "\(left / 60):\(String(format: "%02d", left % 60)) left"
        }
        guard let started = RelativeTime.date(from: activity.startedAt) else { return nil }
        let s = max(0, Int(now.timeIntervalSince(started)))
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0
            ? "\(h):\(String(format: "%02d", m)):\(String(format: "%02d", sec)) elapsed"
            : "\(m):\(String(format: "%02d", sec)) elapsed"
    }
}

/// Looks up a game's art by name on the web's `/api/game-art` (Discord,
/// SteamGridDB, Steam), so every viewer sees a picture even when the player's
/// client sent none. Cached for the session, misses included.
actor GameArt {
    static let shared = GameArt()
    private var cache: [String: String?] = [:]

    static func lookup(name: String, appId: String?) async -> String? {
        await shared.find(name: name, appId: appId)
    }

    private func find(name: String, appId: String?) async -> String? {
        let key = "\(appId ?? "")|\(name.lowercased())"
        if let hit = cache[key] { return hit }
        var parts = URLComponents(url: AppConfig.webAppURL.appendingPathComponent("api/game-art"), resolvingAgainstBaseURL: false)
        var items = [URLQueryItem(name: "name", value: name)]
        if let appId, appId.range(of: "^\\d{15,22}$", options: .regularExpression) != nil {
            items.append(URLQueryItem(name: "app", value: appId))
        }
        parts?.queryItems = items
        guard let url = parts?.url else { return nil }
        struct Reply: Decodable { let url: String? }
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
        let found = (try? JSONDecoder().decode(Reply.self, from: data))?.url
        cache[key] = found
        return found
    }
}
