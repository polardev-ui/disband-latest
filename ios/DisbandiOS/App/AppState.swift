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
    /// Set while the Turnstile sheet should be showing ("login" or "signup").
    var captchaAction: String?
    @ObservationIgnored private var captchaContinuation: CheckedContinuation<String?, Never>?
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
        // A tap that launched the app from cold arrives before any session
        // exists, and the lookup that turns it into a destination needs one.
        await NotificationRouter.shared.resolvePending()
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

        do {
            _ = try await client.auth.refreshSession()
            await loadProfile()
            return
        } catch AuthError.sessionMissing {
            // The server no longer recognises this session: signed out
            // elsewhere, revoked, or the account is gone. Only this is a
            // reason to sign out here.
        } catch {
            // No signal, a timeout or a server hiccup says nothing about
            // whether the session is still good. Signing out on these is what
            // logged people out at random. Keep the session and let them retry;
            // the SDK refreshes again by itself once the network is back.
            profileError = "Couldn't reach Disband. Check your connection and pull to retry."
            print("loadProfile: refresh failed, keeping the session — \(error)")
            return
        }

        profileError = nil
        authError = "Your session expired and couldn't be renewed. Please sign in again."
        await PushManager.shared.unregisterCurrentDevice()
        await VoipPushService.shared.unregisterCurrentDevice()
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
        // The sign-in gate the web app runs first: rate limits, bans, network
        // restrictions held on this device, and Cloudflare Turnstile.
        if let refusal = await loginCheck(email: normalise(email)) {
            authError = refusal
            return
        }
        // From a new IP address the right password waits for the owner to
        // authorise it from an email (the same check the web app runs).
        if let refusal = await newIpCheck(email: normalise(email), password: password) {
            authError = refusal
            return
        }
        do {
            _ = try await client.auth.signIn(email: normalise(email), password: password)
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    func signUp(email: String, password: String, username: String) async {
        authError = nil
        authNotice = nil
        // Mirror web: lowercase, strip to letters/numbers/underscores, min 2.
        let normalized = username.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }
        let display = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalized.count >= 2 else {
            authError = "Username must be at least 2 characters (letters, numbers, and underscores)."
            return
        }
        // The server's sign-up checks (rate limits, bans, username rules) also
        // issue the one-time ticket Supabase now needs to create the account.
        if let refusal = await signupCheck(email: normalise(email), username: normalized) {
            authError = refusal
            return
        }
        do {
            let response = try await client.auth.signUp(
                email: normalise(email),
                password: password,
                data: [
                    "username": .string(normalized),
                    "display_name": .string(display),
                ]
            )

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
                // No session: email confirmation required. The handle_new_user
                // trigger applies the metadata username when the profile row
                // is created, so nothing more to do here.
                authNotice = "Check \(email) for a confirmation link to finish setting up your account."
            } else {
                // Immediate session: apply the username now, like web does.
                do {
                    try await DatabaseService.updateUsername(normalized, displayName: display)
                } catch {
                    authError = friendlyAuthError(error)
                    return
                }
            }
        } catch {
            authError = friendlyAuthError(error)
        }
    }

    /// Runs the web's sign-up gate. Returns a message to show, or nil to go on.
    /// nil to go ahead; otherwise what to show. Network trouble goes ahead,
    /// as the web app does.
    private func newIpCheck(email: String, password: String) async -> String? {
        struct Body: Encodable { let email: String; let password: String }
        struct Reply: Decodable { let ok: Bool?; let error: String? }
        var req = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/auth/ip-check"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(Body(email: email, password: password))
        guard let (data, response) = try? await URLSession.shared.data(for: req) else { return nil }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) { return nil }
        return (try? JSONDecoder().decode(Reply.self, from: data))?.error
            ?? "Sign-in is temporarily blocked. Try again later."
    }

    // MARK: Turnstile

    /// Shows the Turnstile sheet and waits for it: the token, or nil if it
    /// was cancelled.
    func requestCaptcha(_ action: String) async -> String? {
        captchaContinuation?.resume(returning: nil)
        return await withCheckedContinuation { continuation in
            captchaContinuation = continuation
            captchaAction = action
        }
    }

    func finishCaptcha(_ token: String?) {
        captchaAction = nil
        let continuation = captchaContinuation
        captchaContinuation = nil
        continuation?.resume(returning: token)
    }

    private struct GateReply: Decodable { let allowed: Bool?; let error: String?; let code: String? }

    /// Posts to a gate (login-check or signup-check) with this device's
    /// restriction marker, keeps any new marker, and when the gate asks for
    /// Turnstile shows it and asks again. Returns the final status and reply.
    private func gate(_ path: String, action: String, body: [String: String]) async -> (Int, GateReply?)? {
        var token: String?
        for _ in 0..<3 {
            var payload = body
            if let held = NetworkRestriction.current() { payload["nr"] = held }
            if let token { payload["turnstileToken"] = token }
            var req = URLRequest(url: AppConfig.webAppURL.appendingPathComponent(path))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONEncoder().encode(payload)
            guard let (data, response) = try? await URLSession.shared.data(for: req) else { return nil }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            NetworkRestriction.remember(from: data)
            let reply = try? JSONDecoder().decode(GateReply.self, from: data)
            if reply?.code == "TURNSTILE_REQUIRED" || reply?.code == "TURNSTILE_INVALID" {
                guard let solved = await requestCaptcha(action) else {
                    return (status, GateReply(allowed: false, error: "Complete the check to continue.", code: reply?.code))
                }
                token = solved
                continue
            }
            return (status, reply)
        }
        return nil
    }

    /// nil to go ahead; otherwise what to show.
    private func loginCheck(email: String) async -> String? {
        guard let (status, reply) = await gate("api/auth/login-check", action: "login", body: ["email": email]) else {
            return "We couldn't reach Disband. Check your connection and try again."
        }
        if (200..<300).contains(status), reply?.allowed != false { return nil }
        return reply?.error ?? "Sign-in is temporarily blocked. Try again later."
    }

    private func signupCheck(email: String, username: String) async -> String? {
        do {
            guard let (status, reply) = await gate(
                "api/auth/signup-check", action: "signup",
                body: ["email": email, "username": username, "platform": "ios"]
            ) else { throw URLError(.cannotConnectToHost) }
            if (200..<300).contains(status), reply?.allowed != false { return nil }
            if let message = reply?.error { return message }
            if status == 429 { return "Too many sign-up attempts from your network. Try again later." }
            return "Sign-up is temporarily unavailable. Please try again in a few minutes."
        } catch {
            return "We couldn't reach Disband to check this sign-up. Check your connection and try again."
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
        // Do this before auth.signOut(): RLS only lets the current user delete
        // their own token rows. Otherwise the old account keeps pushing to
        // this phone and the next account is never registered.
        await PushManager.shared.unregisterCurrentDevice()
        await VoipPushService.shared.unregisterCurrentDevice()
        InboxCache.clear()
        ChatCache.shared.clearAll()
        try? await client.auth.signOut()
    }

    func deleteAccount() async -> String? {
        guard currentUserId != nil else { return "You're not signed in." }
        do {
            try await client.rpc("delete_my_account").execute()
            InboxCache.clear()
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
