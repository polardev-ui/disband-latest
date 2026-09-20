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
            .navigationTitle("Create Space")
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
            .navigationTitle("Join Space")
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

/// Browse public spaces. Spaces you're already in say Open and take you
/// there; the rest can be joined in one tap.
struct DiscoverServersSheet: View {
    /// Spaces you already belong to, so they never offer "Join".
    var joinedIds: Set<String> = []
    /// Open a space you're in (and close the sheet).
    var onOpen: (String) -> Void = { _ in }
    var onDone: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var items: [DatabaseService.DiscoverableServer] = []
    @State private var loading = true
    @State private var error: String?
    @State private var joiningId: String?
    @State private var newlyJoined: Set<String> = []
    @State private var query = ""

    private func isMember(_ id: String) -> Bool { joinedIds.contains(id) || newlyJoined.contains(id) }

    /// Verified first, then biggest; search matches name or description.
    private var visible: [DatabaseService.DiscoverableServer] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        return items
            .filter { needle.isEmpty
                || $0.name.lowercased().contains(needle)
                || ($0.description ?? "").lowercased().contains(needle) }
            .sorted { lhs, rhs in
                let lv = lhs.verified == true, rv = rhs.verified == true
                if lv != rv { return lv }
                return lhs.memberCount > rhs.memberCount
            }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Discover")
                            .font(.largeTitle.weight(.bold))
                            .foregroundStyle(Brand.textPrimary)
                        Text("Find a space for your people.")
                            .font(.subheadline).foregroundStyle(Brand.textMuted)
                    }
                    .padding(.horizontal, 20)

                    CapsuleSearchField(prompt: "Search spaces", text: $query)

                    content
                }
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .background(Brand.background)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .refreshable { await load() }
        }
        .presentationDetents([.large])
        .presentationCornerRadius(28)
        .task { await load() }
    }

    @ViewBuilder private var content: some View {
        if loading {
            ProgressView().tint(Brand.accent).frame(maxWidth: .infinity).padding(.top, 60)
        } else if let error {
            VStack(spacing: 12) {
                Text(error).font(.subheadline).foregroundStyle(Brand.textMuted)
                Button("Try Again") { Task { await load() } }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Brand.accent)
            }
            .frame(maxWidth: .infinity).padding(.top, 60)
        } else if visible.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "safari").font(.system(size: 34)).foregroundStyle(Brand.textMuted)
                Text(items.isEmpty ? "No public spaces yet" : "No spaces match \u{201C}\(query)\u{201D}")
                    .font(.headline).foregroundStyle(Brand.textPrimary)
            }
            .frame(maxWidth: .infinity).padding(.top, 60)
        } else {
            LazyVStack(spacing: 14) {
                ForEach(visible) { server in card(server) }
            }
            .padding(.horizontal, 16)
        }
    }

    private func card(_ server: DatabaseService.DiscoverableServer) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            BannerImage(url: server.bannerUrl, height: 96) {
                LinearGradient(colors: [Color(seed: server.id), Color(seed: server.id + "·").opacity(0.6)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .bottom) {
                    RemoteImage(url: server.iconUrl, contentMode: .fill) {
                        ZStack {
                            Color(seed: server.id)
                            Text(ServerRail.initials(server.name))
                                .font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                        }
                    }
                    .frame(width: 58, height: 58)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Brand.surface, lineWidth: 4))
                    Spacer()
                    action(for: server)
                }
                .padding(.top, -30)

                HStack(spacing: 6) {
                    Text(server.name)
                        .font(.headline)
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    if server.verified == true {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(Brand.verified)
                            .accessibilityLabel("Verified space")
                    }
                }
                if let desc = server.description, !desc.isEmpty {
                    Text(desc)
                        .font(.subheadline)
                        .foregroundStyle(Brand.textSecondary)
                        .lineLimit(3)
                }
                HStack(spacing: 5) {
                    Circle().fill(Brand.online).frame(width: 7, height: 7)
                    Text("\(server.memberCount) member\(server.memberCount == 1 ? "" : "s")")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Brand.textMuted)
                }
            }
            .padding(14)
        }
        .background(Brand.surface)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    @ViewBuilder private func action(for server: DatabaseService.DiscoverableServer) -> some View {
        if isMember(server.id) {
            Button {
                onOpen(server.id)
                dismiss()
            } label: {
                Label("Open", systemImage: "arrow.right")
                    .labelStyle(.titleAndIcon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.textPrimary)
                    .padding(.horizontal, 16).frame(height: 36)
                    .background(Brand.elevated, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open \(server.name)")
        } else {
            Button { join(server) } label: {
                HStack(spacing: 6) {
                    if joiningId == server.id { ProgressView().controlSize(.small).tint(.white) }
                    Text(joiningId == server.id ? "Joining" : "Join")
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 18).frame(height: 36)
                .background(Brand.online.gradient, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(joiningId != nil)
            .accessibilityLabel("Join \(server.name)")
        }
    }

    private func load() async {
        loading = items.isEmpty
        defer { loading = false }
        do {
            items = try await DatabaseService.discoverableServers()
            error = nil
        } catch {
            self.error = "Couldn't load spaces. Check your connection."
        }
    }

    private func join(_ server: DatabaseService.DiscoverableServer) {
        guard joiningId == nil else { return }
        joiningId = server.id
        Task {
            do {
                try await DatabaseService.joinServerById(serverId: server.id)
                newlyJoined.insert(server.id)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                await onDone()
            } catch {
                self.error = "Couldn't join \(server.name)."
            }
            joiningId = nil
        }
    }
}
