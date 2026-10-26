import Foundation
import Observation

/// Cached guild tags for names on screen.
///
/// A badge can appear next to every message author, member and friend, so a
/// request per row would be the same mistake as one profile query per row.
/// Views ask for an id; missing ids are batched for a moment and fetched in
/// one `profile_guild_tags` query, then the empty results are cached too.
@MainActor
@Observable
final class GuildTagStore {
    static let shared = GuildTagStore()

    private var cache: [String: GuildTag] = [:]
    private var loaded: Set<String> = []
    private var pending: Set<String> = []
    @ObservationIgnored private var flushTask: Task<Void, Never>?

    private init() {}

    func tag(for userId: String?) -> GuildTag? {
        guard let userId else { return nil }
        return cache[userId]
    }

    func ensureLoaded(_ userId: String?) {
        guard let userId, !userId.isEmpty else { return }
        ensureLoaded([userId])
    }

    func ensureLoaded(_ userIds: [String]) {
        let missing = userIds.filter { !$0.isEmpty && !loaded.contains($0) && !pending.contains($0) }
        guard !missing.isEmpty else { return }
        pending.formUnion(missing)
        scheduleFlush()
    }

    /// Put a freshly equipped tag in the cache without another round-trip.
    func set(_ tag: GuildTag, for userId: String) {
        cache[userId] = tag
        loaded.insert(userId)
        pending.remove(userId)
    }

    func clear(for userId: String) {
        cache.removeValue(forKey: userId)
        loaded.insert(userId)
        pending.remove(userId)
    }

    /// A space tag changed or was removed. Every worn copy is now stale — the
    /// database clears wearers on edit — so the next badge should re-read.
    func invalidateAll() {
        cache.removeAll()
        loaded.removeAll()
        pending.removeAll()
        flushTask?.cancel()
        flushTask = nil
    }

    /// Called when the account changes. Avoid showing the previous person's
    /// tags for a frame while the new session loads.
    func reset() {
        invalidateAll()
    }

    private func scheduleFlush() {
        guard flushTask == nil else { return }
        flushTask = Task { [weak self] in
            // Let a list of rows finish appearing before spending a request.
            try? await Task.sleep(for: .milliseconds(40))
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    private func flush() async {
        flushTask = nil
        let ids = Array(pending)
        pending.removeAll()
        guard !ids.isEmpty else { return }

        var fetched: [String: GuildTag] = [:]
        do {
            for chunk in ids.chunked(into: 100) {
                let rows = try await DatabaseService.guildTags(userIds: chunk)
                for row in rows { fetched[row.userId] = row.guildTag }
            }
        } catch {
            // Leave these ids unloaded so a later appearance can retry. A tag
            // is decoration; a failed request must not break the name row.
            return
        }

        for id in ids {
            if let tag = fetched[id] {
                cache[id] = tag
            } else {
                cache.removeValue(forKey: id)
            }
            loaded.insert(id)
        }

        if !pending.isEmpty { scheduleFlush() }
    }
}

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        guard size > 0, !isEmpty else { return [] }
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}
