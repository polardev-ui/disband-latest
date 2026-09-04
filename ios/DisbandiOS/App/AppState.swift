import Foundation
import Supabase
import Observation

enum AuthPhase: Equatable {
    case loading
    case signedOut
    case mfaRequired
    case signedIn
}

@MainActor
@Observable
final class AppState {
    var phase: AuthPhase = .loading
    var session: Session?
    var profile: Profile?
    var authError: String?
    var authNotice: String?
    var profileError: String?

    /// Live presence publisher — set by the app shell so status changes here are
    /// reflected to every other device that is watching the presence channel.
    weak var presence: PresenceService?

    private var recovering = false

    var currentUserId: String? { session?.user.id.uuidString.lowercased() }

    private let client = SupabaseManager.client
    private var authTask: Task<Void, Never>?
    private var loadingWatchdog: Task<Void, Never>?

    init() {
        observeAuth()
        startLoadingWatchdog()
    }

    /// `phase` starts at `.loading` and only advances when `authStateChanges`
    /// emits. If that stream never produces an event — a Keychain read that
    /// fails outright, or the stream finishing early — the app used to sit on
    /// the launch spinner forever with no way out. After a short grace period,
    /// fall back to the sign-in screen: worst case the user signs in again,
    /// which is strictly better than a dead launch.
    private func startLoadingWatchdog() {
        loadingWatchdog = Task { [weak self] in
            try? await Task.sleep(for: .seconds(8))
            guard let self, !Task.isCancelled, self.phase == .loading else { return }
            self.phase = .signedOut
        }
    }


    private func observeAuth() {
        authTask = Task { [weak self] in
            guard let self else { return }
            for await change in client.auth.authStateChanges {
                self.loadingWatchdog?.cancel()
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

        if await mfaChallengeRequired() {
            self.phase = .mfaRequired
            return
        }

        await loadProfile()
        self.phase = .signedIn

        PushManager.shared.registerIfAuthorized()
        await PushManager.shared.flushToken()
        await VoipPushService.shared.flushToken()
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


    func loadProfile() async {
        guard let uid = currentUserId else {
            profileError = "Not signed in."
            return
        }
        do {
            try? await client.rpc("ensure_user_profile").execute()
            let profile: Profile = try await client
                .from("profiles")
                .select("*")
                .eq("id", value: uid)
                .single()
                .execute()
                .value
            self.profile = profile
            profileError = nil
        } catch {
            if isNoRows(error), !recovering {
                await recoverSession(originalError: error)
                return
            }
            profileError = String(describing: error)
            print("loadProfile error: \(error)")
        }
    }

    private func isNoRows(_ error: Error) -> Bool {
        String(describing: error).contains("PGRST116")
    }

    private func recoverSession(originalError: Error) async {
        recovering = true
        defer { recovering = false }

        if (try? await client.auth.user()) != nil {
            try? await client.rpc("ensure_user_profile").execute()
            if let uid = currentUserId,
               let profile: Profile = try? await client
                    .from("profiles").select("*").eq("id", value: uid)
                    .single().execute().value {
                self.profile = profile
                profileError = nil
                return
            }
            profileError = "Your account has no profile yet. Pull to retry, or contact support."
            return
        }

        if (try? await client.auth.refreshSession()) != nil {
            await loadProfile()
            return
        }

        profileError = nil
        authError = "Your session expired and couldn't be renewed. Please sign in again."
        try? await client.auth.signOut()
        session = nil
        profile = nil
        phase = .signedOut
        print("loadProfile: unrecoverable session — \(originalError)")
    }


    /// Keyboard autocomplete and paste routinely add a trailing space or an
    /// uppercase first letter. Sent as-is, both come back as "Invalid login
    /// credentials" for a perfectly correct password.
    private func normalise(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    func signIn(email: String, password: String) async {
        authError = nil
        authNotice = nil
        do {
            _ = try await client.auth.signIn(email: normalise(email), password: password)
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    func signUp(email: String, password: String) async {
        authError = nil
        authNotice = nil
        do {
            let response = try await client.auth.signUp(email: normalise(email), password: password)

            // With user-enumeration protection on, signing up with an address
            // that already exists is NOT an error: Supabase returns a stub user
            // with no identities and no session. Telling that user to check
            // their email is a dead end — no email is ever sent — which is how
            // "I created the account but nothing happened" happened.
            if response.user.identities?.isEmpty == true {
                authError = "That email is already registered. Log in instead, or reset your password."
                return
            }

            if response.session == nil {
                authNotice = "Check \(email) for a confirmation link to finish setting up your account."
            }
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    func sendPasswordReset(email: String) async {
        authError = nil
        authNotice = nil
        do {
            try await client.auth.resetPasswordForEmail(normalise(email))
            authNotice = "Password reset email sent."
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    func signOut() async {
        try? await client.auth.signOut()
    }

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
            // Broadcast the change on the live presence channel so friends on web
            // and iOS see it immediately rather than after a poll of profiles.status.
            await presence?.update(status)
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
        if msg.contains("only request this after") || msg.contains("rate limit") {
            return "We just sent that email. Please wait a moment before trying again."
        }
        return error.localizedDescription
    }
}
