import SwiftUI

struct AddFriendSheet: View {
    var onChange: () async -> Void
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var results: [Profile] = []
    @State private var searching = false
    @State private var sentTo: Set<String> = []

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Brand.textMuted)
                    TextField("Search by username", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .foregroundStyle(Brand.textPrimary)
                        .onSubmit { Task { await search() } }
                }
                .padding(12)
                .background(Brand.surface, in: .rect(cornerRadius: 12))
                .padding()

                if searching {
                    StateView(kind: .loading)
                } else if results.isEmpty && !query.isEmpty {
                    StateView(kind: .empty, title: "No users found", systemImage: "magnifyingglass")
                } else {
                    List(results) { profile in
                        HStack {
                            FriendRow(profile: profile)
                            Spacer()
                            if profile.id == app.currentUserId {
                                Text("You").font(.caption).foregroundStyle(Brand.textMuted)
                            } else if sentTo.contains(profile.id) {
                                Text("Sent").font(.caption).foregroundStyle(Brand.online)
                            } else {
                                Button("Add") { sendRequest(to: profile) }
                                    .buttonStyle(.borderedProminent)
                                    .tint(Brand.accent)
                                    .controlSize(.small)
                            }
                        }
                        .listRowBackground(Brand.surface)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Brand.background)
            .navigationTitle("Add Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private func search() async {
        searching = true
        results = (try? await DatabaseService.searchProfiles(query: query.trimmingCharacters(in: .whitespaces))) ?? []
        searching = false
    }

    private func sendRequest(to profile: Profile) {
        guard let uid = app.currentUserId else { return }
        Task {
            do {
                try await DatabaseService.sendFriendRequest(from: uid, to: profile.id)
                sentTo.insert(profile.id)
                await onChange()
            } catch {
                // Likely already exists / blocked — silently ignore for now.
            }
        }
    }
}
