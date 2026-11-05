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
    @State private var sort: Sort = .popular

    /// The web's two Discover tabs: most members, or most recently created.
    enum Sort: String, CaseIterable, Identifiable {
        case popular, new
        var id: String { rawValue }
        var label: String { self == .popular ? "Popular" : "New" }
    }

    private func isMember(_ id: String) -> Bool { joinedIds.contains(id) || newlyJoined.contains(id) }

    /// Search matches name, description or owner, as on the web.
    private var visible: [DatabaseService.DiscoverableServer] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        let matches = items.filter { needle.isEmpty
            || $0.name.lowercased().contains(needle)
            || ($0.description ?? "").lowercased().contains(needle)
            || ($0.ownerName ?? "").lowercased().contains(needle) }
        switch sort {
        case .popular:
            return matches.sorted { lhs, rhs in
                if lhs.memberCount != rhs.memberCount { return lhs.memberCount > rhs.memberCount }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
        case .new:
            // ISO timestamps from Postgres sort correctly as strings.
            return matches.sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
        }
    }

    private var heading: String {
        let q = query.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty {
            return "\(visible.count) \(visible.count == 1 ? "result" : "results") for \u{201C}\(q)\u{201D}"
        }
        return sort == .popular ? "Popular spaces" : "New spaces"
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

                    Picker("Sort", selection: $sort.animation(.snappy)) {
                        ForEach(Sort.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 20)

                    if !loading && error == nil && !visible.isEmpty {
                        Text(heading)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Brand.textMuted)
                            .padding(.horizontal, 20)
                            .padding(.top, 2)
                    }

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
                    } else if server.partner == true {
                        PartnerBadge()
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
                    Text("\(server.memberCount.formatted()) member\(server.memberCount == 1 ? "" : "s")")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Brand.textMuted)
                    if sort == .new, let created = RelativeTime.date(from: server.createdAt) {
                        Text("· Created \(created.formatted(.relative(presentation: .named)))")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Brand.textMuted)
                    }
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

/// The web's "Disband Partner" mark: a blurple seal with a link through it.
struct PartnerBadge: View {
    var size: CGFloat = 17

    var body: some View {
        ServerBadgeView(kind: .partner, size: size)
    }
}

/// Which seal a space wears beside its name. Verified beats Partner, Partner
/// beats the Catalyst levels, as on the web (`serverBadgeFor`).
enum ServerBadgeKind {
    case verified, partner, level1, level2, level3

    static func of(verified: Bool?, partner: Bool?, catalysts: Int) -> ServerBadgeKind? {
        if verified == true { return .verified }
        if partner == true { return .partner }
        if catalysts >= 6 { return .level3 }
        if catalysts >= 3 { return .level2 }
        if catalysts >= 1 { return .level1 }
        return nil
    }

    var label: String {
        switch self {
        case .verified: return "Verified by Disband"
        case .partner: return "Disband Partner"
        case .level1: return "Catalyst Level 1"
        case .level2: return "Catalyst Level 2"
        case .level3: return "Catalyst Level 3"
        }
    }
}

/// The scalloped space seal, drawn from the same 24-unit artwork as the web's
/// `ServerBadge` so a space reads the same on every client.
struct ServerBadgeView: View {
    let kind: ServerBadgeKind
    var size: CGFloat = 16

    private static let scallop: [CGPoint] = [
        (12.00, 1.00), (14.48, 2.73), (17.50, 2.47), (18.79, 5.21), (21.53, 6.50), (21.27, 9.52),
        (23.00, 12.00), (21.27, 14.48), (21.53, 17.50), (18.79, 18.79), (17.50, 21.53), (14.48, 21.27),
        (12.00, 23.00), (9.52, 21.27), (6.50, 21.53), (5.21, 18.79), (2.47, 17.50), (2.73, 14.48),
        (1.00, 12.00), (2.73, 9.52), (2.47, 6.50), (5.21, 5.21), (6.50, 2.47), (9.52, 2.73),
    ].map { CGPoint(x: $0.0, y: $0.1) }

    var body: some View {
        Canvas { ctx, box in
            let s = box.width / 24
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            func poly(_ pts: [CGPoint], closed: Bool) -> Path {
                var path = Path()
                path.addLines(pts.map { p($0.x, $0.y) })
                if closed { path.closeSubpath() }
                return path
            }

            let bg: Color = kind == .verified ? Color(hex: 0x23A55A) : kind == .partner ? Color(hex: 0x5865F2) : .white
            let seal = poly(Self.scallop, closed: true)
            ctx.fill(seal, with: .color(bg))
            ctx.stroke(seal, with: .color(bg), style: StrokeStyle(lineWidth: 1.2 * s, lineJoin: .round))

            switch kind {
            case .verified:
                ctx.stroke(poly([CGPoint(x: 7.5, y: 12.3), CGPoint(x: 10.5, y: 15.3), CGPoint(x: 16.5, y: 9)], closed: false),
                           with: .color(.white), style: StrokeStyle(lineWidth: 2.4 * s, lineCap: .round, lineJoin: .round))
            case .partner:
                // The handshake glyph, placed as the web's translate(4.4) scale(0.63).
                func t(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: 4.4 + 0.63 * x, y: 4.4 + 0.63 * y) }
                let left = poly([t(10, 7), t(7, 6), t(3, 10), t(7, 14), t(10, 13)], closed: false)
                let right = poly([t(14, 11), t(17, 10), t(21, 14), t(17, 18), t(14, 17)], closed: false)
                let bar = poly([t(8, 15), t(16, 9)], closed: false)
                let hands = StrokeStyle(lineWidth: 4 * 0.63 * s, lineCap: .round, lineJoin: .round)
                ctx.stroke(left, with: .color(.white), style: hands)
                ctx.stroke(right, with: .color(.white), style: hands)
                ctx.stroke(bar, with: .color(.white), style: StrokeStyle(lineWidth: 3 * 0.63 * s, lineCap: .round))
            case .level1, .level2, .level3:
                let gem = poly([CGPoint(x: 12, y: 6.2), CGPoint(x: 15.6, y: 8.6), CGPoint(x: 15.6, y: 15.4),
                                CGPoint(x: 12, y: 17.8), CGPoint(x: 8.4, y: 15.4), CGPoint(x: 8.4, y: 8.6)], closed: true)
                let ink: Color = kind == .level1 ? Color(hex: 0xF47FFF) : kind == .level2 ? Color(hex: 0x060607) : Color(hex: 0x80848E)
                if kind == .level1 { ctx.fill(gem, with: .color(ink)) }
                ctx.stroke(gem, with: .color(ink), style: StrokeStyle(lineWidth: 1.8 * s, lineJoin: .round))
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement()
        .accessibilityLabel(kind.label)
    }
}
