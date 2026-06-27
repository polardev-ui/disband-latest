import Foundation
import Supabase
import Observation

/// Whether the current session has satisfied any required MFA step.
enum AuthPhase: Equatable {
    case loading
    case signedOut
    case mfaRequired          // signed in at aal1 but an aal2 factor exists
    case signedIn
}

/// Central, observable application state. Owns the auth session and the
/// signed-in user's profile, and is injected into the SwiftUI environment.
@MainActor
@Observable
final class AppState {
    var phase: AuthPhase = .loading
    var session: Session?
    var profile: Profile?
    var authError: String?

    var currentUserId: String? { session?.user.id.uuidString.lowercased() }

    private let client = SupabaseManager.client
    private var authTask: Task<Void, Never>?

    init() {
        observeAuth()
    }

    // MARK: - Bootstrap & auth observation

    private func observeAuth() {
        authTask = Task { [weak self] in
            guard let self else { return }
            for await change in client.auth.authStateChanges {
                switch change.event {
                case .initialSession, .signedIn, .tokenRefreshed, .userUpdated:
                    await self.handleSession(change.session)
                case .signedOut:
                    self.session = nil
                    self.profile = nil
                    self.phase = .signedOut
                default:
                    break
                }
            }
        }
    }

    private func handleSession(_ session: Session?) async {
        guard let session else {
            self.session = nil
            self.profile = nil
            self.phase = .signedOut
            return
        }
        self.session = session

        // If the user has enrolled MFA but is only at aal1, gate behind a challenge.
        if await mfaChallengeRequired() {
            self.phase = .mfaRequired
            return
        }

        await loadProfile()
        self.phase = .signedIn

        // Register for push notifications now that we have an authenticated user.
        PushManager.shared.registerIfAuthorized()
        await PushManager.shared.flushToken()
    }

    private func mfaChallengeRequired() async -> Bool {
        do {
            let levels = try await client.auth.mfa.getAuthenticatorAssuranceLevel()
            return levels.currentLevel == "aal1" && levels.nextLevel == "aal2"
        } catch {
            return false
        }
    }

    func refreshAfterMfa() async {
        await loadProfile()
        phase = .signedIn
    }

    // MARK: - Profile

    func loadProfile() async {
        guard let uid = currentUserId else { return }
        do {
            // Make sure a profile row exists (mirrors ensure_user_profile RPC).
            try? await client.rpc("ensure_user_profile").execute()
            let profile: Profile = try await client
                .from("profiles")
                .select("*")
                .eq("id", value: uid)
                .single()
                .execute()
                .value
            self.profile = profile
        } catch {
            print("loadProfile error: \(error)")
        }
    }

    // MARK: - Auth actions

    func signIn(email: String, password: String) async {
        authError = nil
        do {
            _ = try await client.auth.signIn(email: email, password: password)
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    func signUp(email: String, password: String) async {
        authError = nil
        do {
            _ = try await client.auth.signUp(email: email, password: password)
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    func sendPasswordReset(email: String) async {
        authError = nil
        do {
            try await client.auth.resetPasswordForEmail(email)
            authError = "Password reset email sent."
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    func signOut() async {
        try? await client.auth.signOut()
    }

    /// Permanently deletes the signed-in user's account and all their data
    /// (App Store Guideline 5.1.1(v)). Calls the `delete_my_account` RPC, then
    /// signs out locally. Returns an error message on failure, nil on success.
    func deleteAccount() async -> String? {
        guard currentUserId != nil else { return "You're not signed in." }
        do {
            try await client.rpc("delete_my_account").execute()
            try? await client.auth.signOut()
            session = nil
            profile = nil
            phase = .signedOut
            return nil
        } catch {
            return "Couldn't delete your account. Please try again.\n\(error.localizedDescription)"
        }
    }

    /// Apply a profile patch (display name, bio, avatar/banner, accent, settings)
    /// and refresh the cached profile. Returns an error message on failure.
    @discardableResult
    func saveProfile(_ patch: DatabaseService.ProfilePatch) async -> String? {
        guard let uid = currentUserId else { return "Not signed in" }
        do {
            try await DatabaseService.updateProfile(userId: uid, patch: patch)
            await loadProfile()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func setStatus(_ status: UserStatus) async {
        guard let uid = currentUserId else { return }
        do {
            try await client.from("profiles")
                .update(["preferred_status": status.rawValue, "status": status.rawValue])
                .eq("id", value: uid)
                .execute()
            profile?.status = status
            profile?.preferredStatus = status
        } catch {
            print("setStatus error: \(error)")
        }
    }

    private func friendlyAuthError(_ error: Error) -> String {
        let msg = error.localizedDescription.lowercased()
        if msg.contains("invalid login") || msg.contains("credentials") {
            return "Invalid email or password."
        }
        if msg.contains("already registered") || msg.contains("already been registered") {
            return "That email is already registered."
        }
        if msg.contains("email not confirmed") {
            return "Please confirm your email before signing in."
        }
        return error.localizedDescription
    }
}
