import StoreKit
import SwiftUI

/// The pre-prompt behind the automatic review popup.
///
/// StoreKit gives no callback and no verdict, so this asks the only question
/// whose answer matters: unhappy users dismiss into permanent silence (plus
/// a pointer at bug reports), happy users get the system review sheet. No
/// rewards, no streaks, no third attempt — Apple's guidelines and basic
/// manners agree on this shape.
struct ReviewPromptSheet: View {
    @Environment(\.requestReview) private var requestReview
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "star.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(Brand.accent)
                .padding(.top, 26)

            Text("Enjoying Disband?")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(Brand.textPrimary)

            Text("If Disband's been good to you, a quick rating helps us enormously — it takes about ten seconds.")
                .font(.subheadline)
                .foregroundStyle(Brand.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)

            Button {
                ReviewPrompter.shared.markPrompted()
                dismiss()
                // Small beat so the sheet is gone before the system sheet
                // arrives; stacking them looks broken.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    requestReview()
                }
            } label: {
                Text("Rate Disband")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Brand.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 13))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            .padding(.top, 8)

            Button {
                ReviewPrompter.shared.markPrompted()
                dismiss()
            } label: {
                Text("Remind me later")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textSecondary)
            }
            .buttonStyle(.plain)

            Button {
                ReviewPrompter.shared.markDeclined()
                dismiss()
            } label: {
                Text("Not really")
                    .font(.subheadline)
                    .foregroundStyle(Brand.textSecondary)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 26)
        }
        .background(Brand.background)
    }
}
