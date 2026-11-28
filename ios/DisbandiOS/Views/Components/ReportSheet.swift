import Supabase
import SwiftUI

/**
 Report a message, a person or a space, through the web's `/api/reports`
 (the same route, reasons and ids as `ReportModal.tsx` / `lib/reports.ts`),
 so a report from the phone lands in the same queue as one from the desktop.
 */
struct ReportSheet: View {
    enum Target: Hashable {
        /// `surface`: "channel", "dm" or "group".
        case message(id: String, surface: String, preview: String)
        case profile(id: String, name: String)
        case server(id: String, name: String)

        var heading: String {
            switch self {
            case .message: return "Report Message"
            case .profile(_, let name): return "Report \(name)"
            case .server(_, let name): return "Report \(name)"
            }
        }
    }

    struct Reason: Identifiable, Hashable {
        let id: String
        let label: String
        let detail: String
    }

    static let messageReasons = [
        Reason(id: "harassment", label: "Harassment or bullying", detail: "Targeted insults, threats, or repeated unwanted contact."),
        Reason(id: "hate_speech", label: "Hate speech", detail: "Slurs or attacks against a protected group."),
        Reason(id: "sexual_content", label: "Sexual content", detail: "Explicit nudity, pornography, or sexual imagery."),
        Reason(id: "violence_gore", label: "Violence or gore", detail: "Graphic violence, serious injury, or animal cruelty."),
        Reason(id: "illegal_content", label: "Illegal content", detail: "Content that may break the law, including sexual content involving minors."),
        Reason(id: "spam", label: "Spam or a scam", detail: "Repeated advertising, phishing, or fraudulent links."),
        Reason(id: "self_harm", label: "Self-harm or suicide", detail: "Content that encourages or depicts self-harm."),
        Reason(id: "other", label: "Something else", detail: "Tell us what is wrong and we will take a look."),
    ]

    static let profileReasons = [
        Reason(id: "sexual_content", label: "Pornographic profile", detail: "An avatar, banner, or bio that is sexually explicit."),
        Reason(id: "hate_speech", label: "Hate speech in a profile", detail: "A name, bio, or image that attacks a protected group."),
        Reason(id: "harassment", label: "Harassment in a profile", detail: "A profile used to target or intimidate someone."),
        Reason(id: "violence_gore", label: "Violence or gore", detail: "Graphic violence or serious injury in a profile image."),
        Reason(id: "impersonation", label: "Impersonation", detail: "Pretending to be another person, creator, or Disband staff."),
        Reason(id: "other", label: "Something else", detail: "Tell us what is wrong and we will take a look."),
    ]

    static let serverReasons = [
        Reason(id: "illegal_content", label: "Child safety or illegal content", detail: "Sexual content involving minors, or a space trading illegal material."),
        Reason(id: "sexual_content", label: "Sexual content", detail: "A space built around pornography or explicit imagery."),
        Reason(id: "hate_speech", label: "Hate or extremism", detail: "A space organised around attacking a protected group."),
        Reason(id: "violence_gore", label: "Violence or gore", detail: "Graphic violence, threats, or a space planning harm."),
        Reason(id: "spam", label: "Spam or scams", detail: "Phishing, fake giveaways, or selling stolen accounts."),
        Reason(id: "other", label: "Something else", detail: "Tell us what is wrong and we will take a look."),
    ]

    let target: Target

    @Environment(\.dismiss) private var dismiss
    @State private var reason: String?
    @State private var details = ""
    @State private var sending = false
    @State private var sent = false
    @State private var error: String?

    static let maxDetails = 1000

    private var reasons: [Reason] {
        switch target {
        case .profile: return Self.profileReasons
        case .server: return Self.serverReasons
        case .message: return Self.messageReasons
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if sent {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.system(size: 44)).foregroundStyle(Brand.online)
                        Text("Thanks for telling us").font(.headline).foregroundStyle(Brand.textPrimary)
                        Text("Our safety team will take a look. You won't be told who reviewed it.")
                            .font(.subheadline).foregroundStyle(Brand.textMuted)
                            .multilineTextAlignment(.center)
                        Button("Done") { dismiss() }.buttonStyle(.borderedProminent).padding(.top, 6)
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    form
                }
            }
            .background(Brand.background)
            .navigationTitle(target.heading)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !sent {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        if sending { ProgressView() } else {
                            Button("Send") { Task { await submit() } }.disabled(reason == nil)
                        }
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    private var form: some View {
        List {
            if case .message(_, _, let preview) = target, !preview.isEmpty {
                Section("Message") {
                    Text(preview).font(.subheadline).foregroundStyle(Brand.textSecondary).lineLimit(4)
                        .listRowBackground(Brand.surface)
                }
            }
            Section("What's wrong?") {
                ForEach(reasons) { option in
                    Button { reason = option.id } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: reason == option.id ? "largecircle.fill.circle" : "circle")
                                .foregroundStyle(reason == option.id ? Brand.accent : Brand.textMuted)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(option.label).foregroundStyle(Brand.textPrimary)
                                Text(option.detail).font(.caption).foregroundStyle(Brand.textMuted)
                            }
                        }
                    }
                    .listRowBackground(Brand.surface)
                }
            }
            Section {
                TextField("Anything else we should know? (optional)", text: $details, axis: .vertical)
                    .lineLimit(3...6)
                    .onChange(of: details) { _, value in
                        if value.count > Self.maxDetails { details = String(value.prefix(Self.maxDetails)) }
                    }
                    .listRowBackground(Brand.surface)
            } footer: {
                Text("Reports are private. The person you report isn't told who sent it.")
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(Brand.dnd).listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private func submit() async {
        guard let reason else { return }
        sending = true
        error = nil
        defer { sending = false }
        let body: [String: String]
        switch target {
        case .message(let id, let surface, _):
            body = ["targetType": "message", "surface": surface, "targetId": id]
        case .profile(let id, _):
            body = ["targetType": "profile", "surface": "profile", "targetId": id]
        case .server(let id, _):
            body = ["targetType": "server", "surface": "server", "targetId": id]
        }
        var payload = body
        payload["reason"] = reason
        payload["details"] = details.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let token = try? await SupabaseManager.client.auth.session.accessToken else {
            error = "Sign in again to send a report."
            return
        }
        var request = URLRequest(url: AppConfig.webAppURL.appendingPathComponent("api/reports"))
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONEncoder().encode(payload)
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<300).contains(status) {
                withAnimation(Motion.quick) { sent = true }
                return
            }
            struct Reply: Decodable { let error: String? }
            if status == 429 {
                error = "You've sent a lot of reports. Try again in a minute."
            } else {
                error = (try? JSONDecoder().decode(Reply.self, from: data))?.error
                    ?? "Could not send the report. Try again."
            }
        } catch {
            self.error = "Couldn't reach Disband. Check your connection and try again."
        }
    }
}
