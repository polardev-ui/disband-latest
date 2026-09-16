import SwiftUI

struct CreateServerSheet: View {
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Server name") {
                    TextField("My awesome server", text: $name)
                }
                if let error { Text(error).foregroundStyle(Brand.dnd) }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Create Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create", action: create)
                        .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func create() {
        busy = true
        Task {
            do {
                _ = try await DatabaseService.createServer(name: name.trimmingCharacters(in: .whitespaces))
                await onDone()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

struct JoinServerSheet: View {
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Invite code") {
                    TextField("e.g. aB3xY9", text: $code)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                if let error { Text(error).foregroundStyle(Brand.dnd) }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Join Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Join", action: join)
                        .disabled(busy || code.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func join() {
        busy = true
        Task {
            do {
                _ = try await DatabaseService.joinServer(invite: code.trimmingCharacters(in: .whitespaces))
                await onDone()
                dismiss()
            } catch {
                self.error = "Couldn't join — check the invite code."
            }
            busy = false
        }
    }
}

struct DiscoverServersSheet: View {
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var items: [DatabaseService.DiscoverableServer] = []
    @State private var loading = true
    @State private var error: String?
    @State private var joiningId: String?
    @State private var joinedIds: Set<String> = []

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    StateView(kind: .loading)
                } else if let error {
                    VStack(spacing: 16) {
                        StateView(kind: .error, title: error)
                        Button("Try Again") { Task { await load() } }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Brand.accent)
                    }
                } else if items.isEmpty {
                    StateView(kind: .empty, title: "No public servers yet.\nCreate one and make it discoverable.",
                              systemImage: "safari")
                } else {
                    List(items) { server in
                        HStack(spacing: 12) {
                            AvatarView(url: server.iconUrl, name: server.name, size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    Text(server.name)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Brand.textPrimary)
                                        .lineLimit(1)
                                    if server.verified == true {
                                        Image(systemName: "checkmark.seal.fill")
                                            .font(.footnote)
                                            .foregroundStyle(Brand.verified)
                                            .accessibilityLabel("Verified server")
                                    }
                                }
                                Text("\(server.memberCount) member\(server.memberCount == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundStyle(Brand.textMuted)
                                if let desc = server.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundStyle(Brand.textMuted)
                                        .lineLimit(2)
                                }
                            }
                            Spacer(minLength: 8)
                            if joinedIds.contains(server.id) {
                                Image(systemName: "checkmark")
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(Brand.online)
                            } else {
                                Button { join(server) } label: {
                                    Text(joiningId == server.id ? "Joining…" : "Join")
                                        .font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 7)
                                        .background(joiningId == server.id ? Brand.elevated : Brand.accent,
                                                    in: .capsule)
                                        .foregroundStyle(joiningId == server.id ? Brand.textMuted : .white)
                                }
                                .buttonStyle(.plain)
                                .disabled(joiningId == server.id)
                            }
                        }
                        .listRowBackground(Brand.surface)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Brand.background)
            .navigationTitle("Discover")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.large])
        .task { await load() }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            items = try await DatabaseService.discoverableServers()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func join(_ server: DatabaseService.DiscoverableServer) {
        guard joiningId == nil else { return }
        joiningId = server.id
        Task {
            do {
                try await DatabaseService.joinServerById(serverId: server.id)
                joinedIds.insert(server.id)
                await onDone()
            } catch {
                self.error = "Couldn't join that server."
            }
            joiningId = nil
        }
    }
}
