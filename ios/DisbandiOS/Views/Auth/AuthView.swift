import SwiftUI

struct AuthView: View {
    @Environment(AppState.self) private var app

    private enum Mode { case signIn, signUp }
    @State private var mode: Mode = .signIn
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var usernameProblem: String?
    @State private var busy = false

    private var normalizedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }
    }

    private var signupValid: Bool {
        mode == .signIn
            || (!username.isEmpty && normalizedUsername.count >= 2
                && !email.isEmpty && password.count >= 6
                && password == confirmPassword && usernameProblem == nil)
    }

    private var submitDisabled: Bool {
        mode == .signUp ? !signupValid : email.isEmpty || password.isEmpty
    }

    var body: some View {
        GeometryReader { screen in
            ScrollView {
                VStack(spacing: 22) {
                    // The wordmark sits above the card, as on desktop.
                    HStack(spacing: 10) {
                        Image("DisbandMark")
                            .renderingMode(.template)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 34, height: 34)
                            .foregroundStyle(.white)
                        Text("Disband")
                            .font(.system(size: 24, weight: .heavy))
                            .tracking(-0.3)
                            .foregroundStyle(.white)
                    }
                    .riseIn()

                    DSCard(padding: 26) {
                        VStack(spacing: 18) {
                            header
                            fields
                            messages
                            DSPrimaryButton(title: mode == .signIn ? "Log In" : "Create account",
                                            busy: busy, disabled: submitDisabled, action: submit)
                            switcher
                        }
                    }
                    .riseIn(delay: 0.08)

                    Text("By continuing you agree to Disband's Terms and Privacy Policy.")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.65))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .riseIn(delay: 0.16)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .frame(maxWidth: 480)
                // Centred on the screen when it fits, scrolling when it doesn't.
                .frame(maxWidth: .infinity, minHeight: screen.size.height)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
        }
        .background { AeroBackground() }
        .preferredColorScheme(.dark)
        .animation(Motion.settle, value: mode)
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text(mode == .signIn ? "Welcome back!" : "Create your account")
                .font(.system(size: 26, weight: .bold))
                .tracking(-0.3)
                .foregroundStyle(Brand.textPrimary)
                .contentTransition(.opacity)
            Text(mode == .signIn ? "We're so excited to see you again!" : "Free to join. No card required.")
                .font(.system(size: 15))
                .foregroundStyle(Brand.textSecondary)
                .contentTransition(.opacity)
        }
        .multilineTextAlignment(.center)
        .padding(.bottom, 4)
    }

    private var fields: some View {
        VStack(spacing: 16) {
            if mode == .signUp {
                VStack(alignment: .leading, spacing: 6) {
                    DSField(label: "Username", placeholder: "your_name", text: $username, contentType: .username)
                    if !username.isEmpty {
                        Text("Will be saved as @\(normalizedUsername.isEmpty ? "…" : normalizedUsername)")
                            .font(.caption)
                            .foregroundStyle(Brand.textMuted)
                    }
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
            DSField(label: "Email", placeholder: "you@example.com", text: $email,
                    keyboard: .emailAddress, contentType: .emailAddress)
            DSField(label: "Password", placeholder: mode == .signUp ? "At least 6 characters" : "Password",
                    text: $password, secure: true,
                    contentType: mode == .signUp ? .newPassword : .password,
                    trailing: mode == .signIn ? AnyView(
                        Button("Forgot?") {
                            Haptics.tap()
                            Task { await app.sendPasswordReset(email: email) }
                        }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x6CCFF9))
                    ) : nil)
            if mode == .signUp {
                DSField(label: "Confirm password", placeholder: "Type it again", text: $confirmPassword,
                        secure: true, contentType: .newPassword)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .task(id: username) {
            // Live availability while choosing a name at sign-up.
            guard mode == .signUp else { usernameProblem = nil; return }
            let candidate = normalizedUsername
            guard candidate.count >= 2 else { usernameProblem = nil; return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            usernameProblem = await DatabaseService.usernameUnavailableReason(candidate)
        }
    }

    @ViewBuilder private var messages: some View {
        if mode == .signUp, !confirmPassword.isEmpty, password != confirmPassword {
            notice("Passwords don't match yet.", icon: "exclamationmark.circle.fill", color: Brand.dnd)
        }
        if mode == .signUp, let problem = usernameProblem {
            notice(problem, icon: "exclamationmark.circle.fill", color: Brand.dnd)
        }
        if let notice = app.authNotice {
            self.notice(notice, icon: "envelope.badge.fill", color: Brand.online)
        }
        if let error = app.authError {
            notice(error, icon: "exclamationmark.triangle.fill", color: Brand.dnd)
        }
    }

    private func notice(_ text: String, icon: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
            Text(text).fixedSize(horizontal: false, vertical: true)
        }
        .font(.system(size: 14))
        .foregroundStyle(color)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.1), in: .rect(cornerRadius: 10))
        .transition(.opacity.combined(with: .scale(scale: 0.98)))
    }

    private var switcher: some View {
        Button {
            Haptics.select()
            withAnimation(Motion.settle) { mode = mode == .signIn ? .signUp : .signIn }
            app.authError = nil
            app.authNotice = nil
            usernameProblem = nil
            confirmPassword = ""
        } label: {
            HStack(spacing: 4) {
                Text(mode == .signIn ? "Need an account?" : "Already have an account?")
                    .foregroundStyle(Brand.textMuted)
                Text(mode == .signIn ? "Register" : "Log in")
                    .foregroundStyle(Color(hex: 0x6CCFF9)).fontWeight(.semibold)
            }
            .font(.system(size: 14))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func submit() {
        busy = true
        Task {
            if mode == .signIn {
                await app.signIn(email: email, password: password)
            } else {
                guard password == confirmPassword else {
                    app.authError = "Passwords don't match. Re-enter them and try again."
                    Haptics.warning()
                    withAnimation { busy = false }
                    return
                }
                await app.signUp(email: email, password: password, username: username)
            }
            withAnimation { busy = false }
        }
    }
}
