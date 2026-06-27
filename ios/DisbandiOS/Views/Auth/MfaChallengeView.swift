import SwiftUI
import Supabase

/// Two-factor (TOTP) challenge shown when a signed-in session is still at aal1
/// but the account has an enrolled aal2 factor.
struct MfaChallengeView: View {
    @Environment(AppState.self) private var app
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false

    private var client: SupabaseClient { SupabaseManager.client }

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 48))
                .foregroundStyle(Brand.accent)
            Text("Two-Factor Authentication")
                .font(.title2.bold())
                .foregroundStyle(Brand.textPrimary)
            Text("Enter the 6-digit code from your authenticator app.")
                .font(.subheadline)
                .foregroundStyle(Brand.textMuted)
                .multilineTextAlignment(.center)

            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 28, weight: .bold, design: .monospaced))
                .foregroundStyle(Brand.textPrimary)
                .padding()
                .background(Brand.surface, in: .rect(cornerRadius: 12))
                .onChange(of: code) { _, new in
                    code = String(new.filter(\.isNumber).prefix(6))
                }

            if let error {
                Text(error).font(.footnote).foregroundStyle(Brand.dnd)
            }

            Button(action: verify) {
                HStack {
                    if busy { ProgressView().tint(.white) }
                    Text("Verify").fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(Brand.accent, in: .rect(cornerRadius: 12))
                .foregroundStyle(.white)
            }
            .disabled(busy || code.count != 6)
            .opacity(code.count == 6 ? 1 : 0.6)

            Button("Sign out") { Task { await app.signOut() } }
                .font(.footnote).foregroundStyle(Brand.textMuted)
        }
        .padding(24)
        .frame(maxWidth: 420)
    }

    private func verify() {
        busy = true
        error = nil
        Task {
            do {
                let factors = try await client.auth.mfa.listFactors()
                guard let totp = factors.totp.first else {
                    error = "No authenticator factor found."
                    busy = false
                    return
                }
                let challenge = try await client.auth.mfa.challenge(
                    params: MFAChallengeParams(factorId: totp.id)
                )
                _ = try await client.auth.mfa.verify(
                    params: MFAVerifyParams(factorId: totp.id, challengeId: challenge.id, code: code)
                )
                await app.refreshAfterMfa()
            } catch {
                self.error = "Invalid code. Please try again."
            }
            busy = false
        }
    }
}
