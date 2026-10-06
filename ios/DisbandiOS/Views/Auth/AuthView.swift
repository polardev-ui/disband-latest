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

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header

                VStack(spacing: 14) {
                    if mode == .signUp {
                        field(icon: "person.fill", placeholder: "Username", text: $username,
                              keyboard: .default, secure: false)
                    }
                    field(icon: "envelope.fill", placeholder: "Email", text: $email,
                          keyboard: .emailAddress, secure: false)
                    field(icon: "lock.fill", placeholder: "Password", text: $password,
                          keyboard: .default, secure: true)
                    if mode == .signUp {
                        field(icon: "lock.shield.fill", placeholder: "Confirm password", text: $confirmPassword,
                              keyboard: .default, secure: true)
                    }
                }
                .task(id: username) {
                    // Live availability while choosing a name at sign-up.
                    // Mirrors the ProfileTab editor: empty/short/invalid input
                    // clears the message rather than spamming the RPC.
                    guard mode == .signUp else { usernameProblem = nil; return }
                    let candidate = normalizedUsername
                    guard candidate.count >= 2 else { usernameProblem = nil; return }
                    usernameProblem = await DatabaseService.usernameUnavailableReason(candidate)
                }

                if mode == .signUp, !confirmPassword.isEmpty, password != confirmPassword {
                    Text("Passwords don't match yet.")
                        .font(.footnote)
                        .foregroundStyle(Brand.dnd)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let problem = mode == .signUp ? usernameProblem : nil {
                    Text(problem)
                        .font(.footnote)
                        .foregroundStyle(Brand.dnd)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let notice = app.authNotice {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "envelope.badge.fill")
                        Text(notice)
                    }
                    .font(.footnote)
                    .foregroundStyle(Brand.online)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
                }

                if let error = app.authError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Brand.dnd)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button(action: submit) {
                    HStack {
                        if busy { ProgressView().tint(.white) }
                        Text(mode == .signIn ? "Log In" : "Create Account")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Brand.accent, in: .rect(cornerRadius: 12))
                    .foregroundStyle(.white)
                }
                .disabled(busy || (mode == .signUp ? !signupValid : email.isEmpty || password.isEmpty))
                .opacity(busy || (mode == .signUp ? !signupValid : email.isEmpty || password.isEmpty) ? 0.6 : 1)

                if mode == .signIn {
                    Button("Forgot password?") {
                        Task { await app.sendPasswordReset(email: email) }
                    }
                    .font(.footnote)
                    .foregroundStyle(Brand.accent)
                }

                Divider().overlay(Brand.elevated)

                Button {
                    withAnimation { mode = mode == .signIn ? .signUp : .signIn }
                    app.authError = nil
                    app.authNotice = nil
                    usernameProblem = nil
                    confirmPassword = ""
                } label: {
                    HStack(spacing: 4) {
                        Text(mode == .signIn ? "New to Disband?" : "Already have an account?")
                            .foregroundStyle(Brand.textMuted)
                        Text(mode == .signIn ? "Sign up" : "Log in")
                            .foregroundStyle(Brand.accent).fontWeight(.semibold)
                    }
                    .font(.subheadline)
                }
            }
            .padding(24)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var header: some View {
        VStack(spacing: 10) {
            // The Disband mark, template-rendered so it follows the theme's
            // text colour instead of vanishing on a light background.
            Image("DisbandMark")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 112, height: 112)
                .foregroundStyle(Brand.textPrimary)
            Text("Disband")
                .font(.largeTitle.bold())
                .foregroundStyle(Brand.textPrimary)
            Text(mode == .signIn ? "Welcome back!" : "Create your account")
                .font(.subheadline)
                .foregroundStyle(Brand.textMuted)
        }
        .padding(.top, 48)
    }

    private func field(icon: String, placeholder: String, text: Binding<String>,
                       keyboard: UIKeyboardType, secure: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundStyle(Brand.textMuted).frame(width: 20)
            Group {
                if secure {
                    SecureField(placeholder, text: text)
                } else {
                    TextField(placeholder, text: text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .foregroundStyle(Brand.textPrimary)
        }
        .padding(14)
        .background(Brand.surface, in: .rect(cornerRadius: 12))
    }

    private func submit() {
        busy = true
        Task {
            if mode == .signIn {
                await app.signIn(email: email, password: password)
            } else {
                guard password == confirmPassword else {
                    app.authError = "Passwords don't match. Re-enter them and try again."
                    withAnimation { busy = false }
                    return
                }
                await app.signUp(email: email, password: password, username: username)
            }
            withAnimation { busy = false }
        }
    }
}
