import SwiftUI

/// Presence and a custom status line in one place — what the web's clickable
/// status bubble does. The line shows on your profile and beside your name in
/// friends lists, and can clear itself after a while.
struct StatusSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var note = ""
    @State private var duration: StatusDuration = .oneDay
    @State private var presence: UserStatus = .online
    @State private var saving = false
    @State private var error: String?
    @FocusState private var editing: Bool

    private let suggestions = ["🎮 Gaming", "📚 Studying", "💼 Working", "🎧 Listening to music", "😴 Away for a bit"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    noteField
                    suggestionChips
                    durationPicker
                    presencePicker
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(Brand.dnd)
                    }
                }
                .padding(16)
            }
            .scrollIndicators(.hidden)
            .background(Brand.background)
            .navigationTitle("Set a status")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save", action: save).disabled(saving).fontWeight(.semibold)
                }
            }
            .onAppear(perform: seed)
        }
        .presentationDetents([.large])
        .presentationCornerRadius(28)
    }

    private var noteField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("What's up?").font(.headline).foregroundStyle(Brand.textPrimary)
            HStack(spacing: 10) {
                TextField("e.g. low-key lurking", text: $note)
                    .focused($editing)
                    .foregroundStyle(Brand.textPrimary)
                    .onChange(of: note) { _, value in
                        if value.count > 60 { note = String(value.prefix(60)) }
                    }
                if !note.isEmpty {
                    Button { note = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.textMuted)
                    }
                    .accessibilityLabel("Clear status")
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 50)
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            HStack {
                Spacer()
                Text("\(note.count)/60").font(.caption.monospacedDigit()).foregroundStyle(Brand.textMuted)
            }
        }
    }

    private var suggestionChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button { note = suggestion } label: {
                        Text(suggestion)
                            .font(.subheadline)
                            .foregroundStyle(Brand.textPrimary)
                            .padding(.horizontal, 12).frame(height: 34)
                            .background(Brand.surface, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var durationPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Clear after").font(.headline).foregroundStyle(Brand.textPrimary)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
                ForEach(StatusDuration.allCases) { option in
                    Button { duration = option } label: {
                        Text(option.label)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(duration == option ? Color.white : Brand.textSecondary)
                            .frame(maxWidth: .infinity, minHeight: 38)
                            .background(duration == option ? Brand.accent : Brand.surface,
                                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .disabled(note.trimmingCharacters(in: .whitespaces).isEmpty)
            .opacity(note.trimmingCharacters(in: .whitespaces).isEmpty ? 0.45 : 1)
        }
    }

    private var presencePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Online status").font(.headline).foregroundStyle(Brand.textPrimary)
            VStack(spacing: 0) {
                ForEach(Array(UserStatus.allCases.enumerated()), id: \.element) { index, status in
                    if index > 0 { Rectangle().fill(Brand.divider).frame(height: 1).padding(.leading, 48) }
                    Button { presence = status } label: {
                        HStack(spacing: 12) {
                            Circle().fill(status.color).frame(width: 14, height: 14)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(status.label).foregroundStyle(Brand.textPrimary)
                                Text(detail(for: status)).font(.caption).foregroundStyle(Brand.textMuted)
                            }
                            Spacer()
                            if presence == status {
                                Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Brand.accent)
                            }
                        }
                        .padding(.horizontal, 14)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func detail(for status: UserStatus) -> String {
        switch status {
        case .online: return "You're around"
        case .idle: return "Stepped away"
        case .dnd: return "Mutes notifications"
        case .offline: return "Appear offline to everyone"
        }
    }

    private func seed() {
        note = app.profile?.activeStatusNote ?? ""
        presence = app.profile?.preferredStatus ?? app.profile?.status ?? .online
        if let expires = RelativeTime.date(from: app.profile?.statusExpiresAt) {
            let remaining = expires.timeIntervalSinceNow
            duration = StatusDuration.allCases.first { ($0.seconds ?? .infinity) >= remaining } ?? .never
        } else if app.profile?.activeStatusNote != nil {
            duration = .never
        }
    }

    private func save() {
        saving = true
        error = nil
        Task {
            do {
                try await ProfileService.updateStatusNote(note, expiresAt: duration.expiry())
                let current = app.profile?.preferredStatus ?? app.profile?.status
                if presence != current { await app.setStatus(presence) }
                await app.loadProfile()
                dismiss()
            } catch {
                self.error = "Couldn't save your status. Check your connection and try again."
            }
            saving = false
        }
    }
}
