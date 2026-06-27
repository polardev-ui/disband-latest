import SwiftUI

struct AuthView: View {
    @Environment(AppState.self) private var app

    private enum Mode { case signIn, signUp }
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header

                VStack(spacing: 14) {
                    field(icon: "envelope.fill", placeholder: "Email", text: $email,
                          keyboard: .emailAddress, secure: false)
                    field(icon: "lock.fill", placeholder: "Password", text: $password,
                          keyboard: .default, secure: true)
                }

                if let error = app.authError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(error.localizedCaseInsensitiveContains("sent")
                                         ? Brand.online : Brand.dnd)
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
                .disabled(busy || email.isEmpty || password.isEmpty)
                .opacity(busy || email.isEmpty || password.isEmpty ? 0.6 : 1)

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
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 48))
                .foregroundStyle(Brand.accent)
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
                await app.signUp(email: email, password: password)
            }
            busy = false
        }
    }
}
