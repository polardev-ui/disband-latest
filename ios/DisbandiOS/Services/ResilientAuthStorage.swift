import Foundation
import Supabase

/// Session storage that keeps working when the Keychain does not.
///
/// supabase-swift stores the session in the Keychain, and every Keychain item
/// is scoped by the app's `application-identifier` entitlement. A build without
/// that entitlement — an unsigned local build, or an install signed in a way
/// the device will not vend a keychain to — fails every read *and* write with
/// OSStatus `-34018` (`errSecMissingEntitlement`).
///
/// The failure mode is nasty out of proportion to its cause. The sign-in
/// request itself succeeds, so the UI advances; but the session is never
/// persisted, so the very next request goes out unauthenticated. Every RLS
/// policy is scoped to the `authenticated` role, so those requests return
/// *empty results rather than errors*, and the app reports a session that
/// expired seconds after it was issued while showing an account with no data
/// in it.
///
/// Auth is too important to leave resting on an entitlement. This tries the
/// Keychain first and falls back to a file in the app's own container, which is
/// sandboxed to this app and excluded from backups. The fallback is chosen once,
/// on the first failure, and used for every subsequent operation so a session is
/// never split across two backends.
final class ResilientAuthStorage: AuthLocalStorage, @unchecked Sendable {
    /// True once the Keychain has failed and the file fallback is in use.
    /// Read by diagnostics; not used to make decisions about auth itself.
    private(set) var usingFallback = false

    private let keychain = KeychainLocalStorage()
    private let lock = NSLock()
    private let directory: URL

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        directory = base.appendingPathComponent("DisbandAuth", isDirectory: true)
    }

    func store(key: String, value: Data) throws {
        lock.lock()
        defer { lock.unlock() }

        if !usingFallback {
            do {
                try keychain.store(key: key, value: value)
                return
            } catch {
                // Migrate to the fallback rather than losing the session.
                fallBack(because: error, while: "storing")
            }
        }
        try writeFile(key: key, value: value)
    }

    func retrieve(key: String) throws -> Data? {
        lock.lock()
        defer { lock.unlock() }

        if !usingFallback {
            do {
                if let data = try keychain.retrieve(key: key) { return data }
            } catch {
                fallBack(because: error, while: "reading")
                return try readFile(key: key)
            }
            // The Keychain is working and simply has nothing under this key.
            // Still check the fallback: an earlier launch may have written
            // there before the entitlement was in place.
            return try readFile(key: key)
        }
        return try readFile(key: key)
    }

    func remove(key: String) throws {
        lock.lock()
        defer { lock.unlock() }

        if !usingFallback {
            try? keychain.remove(key: key)
        }
        // Always clear the fallback too, so signing out cannot leave a stale
        // session behind in the other backend.
        try? FileManager.default.removeItem(at: fileURL(for: key))
    }

    // MARK: - File backend

    private func fallBack(because error: Error, while action: String) {
        usingFallback = true
        print("""
        Auth storage: the Keychain rejected \(action) (\(error)). \
        Falling back to the app container so the session still persists. \
        This usually means the build is missing its application-identifier \
        entitlement.
        """)
    }

    private func fileURL(for key: String) -> URL {
        // Keys are library-controlled ("supabase.auth.token"), but a path
        // separator in one would escape the directory, so encode defensively.
        let safe = key.replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "..", with: "_")
        return directory.appendingPathComponent(safe)
    }

    private func writeFile(key: String, value: Data) throws {
        let fm = FileManager.default
        if !fm.fileExists(atPath: directory.path) {
            try fm.createDirectory(at: directory, withIntermediateDirectories: true,
                                   attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        }
        try value.write(to: fileURL(for: key), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])

        // A session token has no business in iCloud or an iTunes backup.
        var url = fileURL(for: key)
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try? url.setResourceValues(resourceValues)
    }

    private func readFile(key: String) throws -> Data? {
        let url = fileURL(for: key)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }
}
