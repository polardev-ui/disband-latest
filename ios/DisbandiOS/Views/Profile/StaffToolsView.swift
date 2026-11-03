import SwiftUI
import Supabase

/// Disband Staff on iOS: the web's Team Support and Management tools for
/// moderating from a phone. Staff and moderators get reports, strikes,
/// platform bans and ban appeals; managers also get the team and space
/// suspensions. Every action goes through the same RPCs and `/api/moderation`
/// routes as the web, which check the role again on the server.
struct StaffToolsView: View {
    let isManager: Bool

    var body: some View {
        List {
            Section {
                NavigationLink { StaffReportsView() } label: {
                    Label("Reports", systemImage: "flag.fill")
                }
                NavigationLink { StaffStrikeView() } label: {
                    Label("Issue a strike", systemImage: "exclamationmark.triangle.fill")
                }
                NavigationLink { StaffBanView() } label: {
                    Label("Platform bans", systemImage: "hand.raised.fill")
                }
                NavigationLink { StaffAppealsView() } label: {
                    Label("Ban appeals", systemImage: "envelope.open.fill")
                }
            } header: {
                Text("Moderation")
            }
            .listRowBackground(Brand.surface)

            if isManager {
                Section {
                    NavigationLink { StaffTeamView() } label: {
                        Label("Team", systemImage: "person.3.fill")
                    }
                    NavigationLink { StaffSuspendView() } label: {
                        Label("Suspend a space", systemImage: "pause.circle.fill")
                    }
                } header: {
                    Text("Management")
                }
                .listRowBackground(Brand.surface)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Disband Staff")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Access and API

enum StaffAPI {
    struct Access { let isStaff: Bool; let isManager: Bool }

    static func access(for userId: String) async -> Access {
        let client = SupabaseManager.client
        let staff: Bool = (try? await client.rpc("is_platform_staff", params: ["p_user": userId]).execute().value) ?? false
        let manager: Bool = (try? await client.rpc("is_platform_manager", params: ["p_user": userId]).execute().value) ?? false
        return Access(isStaff: staff || manager, isManager: manager)
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// A web `/api/...` route, signed in as you.
    static func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> Data {
        let token = try await SupabaseManager.client.auth.session.accessToken
        guard let url = URL(string: path, relativeTo: AppConfig.webAppURL) else { throw Failure(message: "Bad address.") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            struct ErrorBody: Decodable { let error: String? }
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw Failure(message: message ?? "That didn't work. Try again.")
        }
        return data
    }

    static func userId(forUsername raw: String) async -> String? {
        struct Row: Decodable { let id: String }
        let name = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "")
        guard !name.isEmpty else { return nil }
        let rows: [Row] = (try? await SupabaseManager.client.from("profiles").select("id")
            .ilike("username", pattern: name).limit(1).execute().value) ?? []
        return rows.first?.id
    }
}

struct StaffPerson: Decodable, Hashable {
    let username: String?
    let displayName: String?
    enum CodingKeys: String, CodingKey { case username; case displayName = "display_name" }
    var label: String { displayName ?? username.map { "@\($0)" } ?? "Unknown" }
}

private struct Notice: View {
    let text: String
    let ok: Bool
    var body: some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(ok ? Brand.online : Brand.dnd)
            .listRowBackground(Color.clear)
    }
}

// MARK: - Reports

struct StaffReport: Decodable, Identifiable, Hashable {
    struct Snapshot: Decodable, Hashable {
        struct Field: Decodable, Hashable { let field: String?; let value: String? }
        let textFields: [Field]?
        enum CodingKeys: String, CodingKey { case textFields = "text_fields" }
    }
    let id: String
    let targetType: String?
    let targetSurface: String?
    let reason: String?
    let details: String?
    let status: String
    let reportedUserId: String?
    let reporterId: String?
    let createdAt: String
    let snapshot: Snapshot?
    let reporter: StaffPerson?
    let reported: StaffPerson?

    enum CodingKeys: String, CodingKey {
        case id, reason, details, status, snapshot, reporter, reported
        case targetType = "target_type", targetSurface = "target_surface"
        case reportedUserId = "reported_user_id", reporterId = "reporter_id"
        case createdAt = "created_at"
    }

    /// Only the text that was reported. Media is never loaded here.
    var reportedText: String? {
        let text = (snapshot?.textFields ?? []).compactMap(\.value)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
        return text.isEmpty ? nil : text
    }
}

struct StaffReportsView: View {
    @State private var reports: [StaffReport] = []
    @State private var loading = true
    @State private var notice: (String, Bool)?
    @State private var acting: StaffReport?
    @State private var note = ""

    var body: some View {
        List {
            if let notice { Notice(text: notice.0, ok: notice.1) }
            if loading {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if reports.isEmpty {
                Text("No open reports.").foregroundStyle(Brand.textMuted).listRowBackground(Brand.surface)
            }
            ForEach(reports) { report in
                VStack(alignment: .leading, spacing: 6) {
                    Text([report.targetType, report.targetSurface, report.reason].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                    Text("\(report.reporterId == nil ? "Found by Sentinel" : "Reported by \(report.reporter?.label ?? "someone")") · \(Self.date(report.createdAt))")
                        .font(.caption).foregroundStyle(Brand.textMuted)
                    if let reported = report.reported {
                        Text("Reported user: \(reported.label)").font(.caption).foregroundStyle(Brand.textMuted)
                    }
                    if let details = report.details, !details.isEmpty {
                        Text(details).font(.footnote).foregroundStyle(Brand.textSecondary)
                    }
                    if let text = report.reportedText {
                        Text(text)
                            .font(.footnote)
                            .foregroundStyle(Brand.textPrimary)
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 8))
                    }
                    HStack {
                        Button("Dismiss") { Task { await resolve(report, action: "dismiss", decision: "Dismissed by staff.") } }
                            .buttonStyle(.bordered)
                        Button("Take action") { note = ""; acting = report }
                            .buttonStyle(.borderedProminent)
                            .tint(Brand.dnd)
                    }
                    .font(.footnote.weight(.semibold))
                    .padding(.top, 2)
                }
                .padding(.vertical, 4)
                .listRowBackground(Brand.surface)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Reports")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .alert("Take action on this report", isPresented: Binding(get: { acting != nil }, set: { if !$0 { acting = nil } })) {
            TextField("What was done and why", text: $note)
            Button("Cancel", role: .cancel) { acting = nil }
            Button("Confirm", role: .destructive) {
                if let report = acting {
                    let decision = note.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task { await resolve(report, action: "actioned", decision: decision.isEmpty ? "Actioned by staff." : decision) }
                }
                acting = nil
            }
        } message: {
            Text("Remove the content or restrict the account first, then record what you did here.")
        }
    }

    static func date(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let parsed = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        return parsed.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? ""
    }

    private func load() async {
        do {
            let data = try await StaffAPI.request("/api/moderation/message-reports")
            struct Response: Decodable { let reports: [StaffReport] }
            reports = try JSONDecoder().decode(Response.self, from: data).reports
        } catch {
            notice = (error.localizedDescription, false)
        }
        loading = false
    }

    private func resolve(_ report: StaffReport, action: String, decision: String) async {
        do {
            _ = try await StaffAPI.request("/api/moderation/message-reports/\(report.id)/resolve", method: "POST",
                                           body: ["action": action, "decision": decision])
            reports.removeAll { $0.id == report.id }
            notice = (action == "dismiss" ? "Report dismissed." : "Report marked as actioned.", true)
        } catch {
            notice = (error.localizedDescription, false)
        }
    }
}

// MARK: - Strikes

struct StaffStrikeView: View {
    private static let restrictions: [(String, String)] = [
        ("send_messages", "Sending messages"), ("send_reactions", "Reacting"), ("join_servers", "Joining spaces"),
        ("send_friend_requests", "Friend requests"), ("create_groups", "Group chats"),
    ]

    @State private var username = ""
    @State private var severity = 1
    @State private var reason = ""
    @State private var restrict: Set<String> = []
    @State private var restrictDays = 7
    @State private var busy = false
    @State private var notice: (String, Bool)?

    var body: some View {
        Form {
            Section {
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Picker("Severity", selection: $severity) {
                    Text("Minor (1)").tag(1); Text("Serious (2)").tag(2); Text("Severe (3)").tag(3)
                }
                TextField("Reason the person will read", text: $reason, axis: .vertical)
            } footer: {
                Text("Strikes last 90 days and move the person's Account Standing.")
            }
            .listRowBackground(Brand.surface)
            Section("Also restrict") {
                ForEach(Self.restrictions, id: \.0) { id, label in
                    Toggle(label, isOn: Binding(
                        get: { restrict.contains(id) },
                        set: { if $0 { restrict.insert(id) } else { restrict.remove(id) } }
                    ))
                }
                if !restrict.isEmpty {
                    Stepper("For \(restrictDays) \(restrictDays == 1 ? "day" : "days")", value: $restrictDays, in: 1...365)
                }
            }
            .listRowBackground(Brand.surface)
            Section {
                Button(busy ? "Issuing…" : "Issue strike", role: .destructive) { Task { await strike() } }
                    .disabled(busy || username.trimmingCharacters(in: .whitespaces).isEmpty
                              || reason.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .listRowBackground(Brand.surface)
            if let notice { Notice(text: notice.0, ok: notice.1) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Issue a strike")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func strike() async {
        busy = true
        defer { busy = false }
        guard let id = await StaffAPI.userId(forUsername: username) else {
            notice = ("No one has that username.", false)
            return
        }
        struct Params: Encodable {
            let p_user: String; let p_severity: Int; let p_reason: String; let p_category: String?
            let p_strike_days: Int; let p_restrictions: [String]; let p_restrict_days: Int?
        }
        do {
            try await SupabaseManager.client.rpc("staff_issue_strike", params: Params(
                p_user: id, p_severity: severity, p_reason: reason.trimmingCharacters(in: .whitespacesAndNewlines),
                p_category: nil, p_strike_days: 90, p_restrictions: Array(restrict),
                p_restrict_days: restrict.isEmpty ? nil : restrictDays,
            )).execute()
            notice = ("Strike issued.", true)
            username = ""; reason = ""; restrict = []
        } catch {
            notice = (error.localizedDescription, false)
        }
    }
}

// MARK: - Platform bans

struct StaffBanView: View {
    struct Ban: Decodable, Identifiable, Hashable {
        let userId: String
        let reason: String?
        let createdAt: String
        let profile: StaffPerson?
        var id: String { userId }
        enum CodingKeys: String, CodingKey {
            case reason, profile
            case userId = "user_id", createdAt = "created_at"
        }
    }

    @State private var username = ""
    @State private var reason = ""
    @State private var bans: [Ban] = []
    @State private var busy = false
    @State private var confirmBan = false
    @State private var notice: (String, Bool)?

    var body: some View {
        Form {
            Section {
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("Reason", text: $reason, axis: .vertical)
                Button("Ban from Disband", role: .destructive) { confirmBan = true }
                    .disabled(busy || username.trimmingCharacters(in: .whitespaces).isEmpty)
            } footer: {
                Text("A banned account can't sign in to Disband anywhere. They can appeal.")
            }
            .listRowBackground(Brand.surface)
            if let notice { Notice(text: notice.0, ok: notice.1) }
            Section("Banned") {
                if bans.isEmpty { Text("No one is banned.").foregroundStyle(Brand.textMuted) }
                ForEach(bans) { ban in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ban.profile?.label ?? ban.userId).font(.subheadline.weight(.semibold))
                            Text(ban.reason ?? "No reason given").font(.caption).foregroundStyle(Brand.textMuted)
                        }
                        Spacer()
                        Button("Unban") { Task { await unban(ban) } }
                            .font(.footnote.weight(.semibold))
                            .disabled(busy)
                    }
                }
            }
            .listRowBackground(Brand.surface)
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Platform bans")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Ban @\(username.replacingOccurrences(of: "@", with: "")) from Disband?",
                            isPresented: $confirmBan, titleVisibility: .visible) {
            Button("Ban", role: .destructive) { Task { await ban() } }
        }
    }

    private func load() async {
        do {
            let data = try await StaffAPI.request("/api/moderation/platform-ban")
            struct Response: Decodable { let bans: [Ban] }
            bans = try JSONDecoder().decode(Response.self, from: data).bans
        } catch {
            notice = (error.localizedDescription, false)
        }
    }

    private func ban() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await StaffAPI.request("/api/moderation/platform-ban", method: "POST", body: [
                "username": username.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: ""),
                "reason": reason,
            ])
            notice = ("Banned.", true)
            username = ""; reason = ""
            await load()
        } catch {
            notice = (error.localizedDescription, false)
        }
    }

    private func unban(_ ban: Ban) async {
        busy = true
        defer { busy = false }
        do {
            _ = try await StaffAPI.request("/api/moderation/platform-ban", method: "POST",
                                           body: ["action": "unban", "userId": ban.userId])
            notice = ("Ban lifted.", true)
            await load()
        } catch {
            notice = (error.localizedDescription, false)
        }
    }
}

// MARK: - Ban appeals

struct StaffAppealsView: View {
    struct Appeal: Decodable, Identifiable, Hashable {
        let id: String
        let reason: String?
        let createdAt: String
        let profile: StaffPerson?
        enum CodingKeys: String, CodingKey { case id, reason, profile; case createdAt = "created_at" }
    }

    @State private var appeals: [Appeal] = []
    @State private var loading = true
    @State private var notice: (String, Bool)?

    var body: some View {
        List {
            if let notice { Notice(text: notice.0, ok: notice.1) }
            if loading {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if appeals.isEmpty {
                Text("No appeals waiting.").foregroundStyle(Brand.textMuted).listRowBackground(Brand.surface)
            }
            ForEach(appeals) { appeal in
                VStack(alignment: .leading, spacing: 6) {
                    Text(appeal.profile?.label ?? "Unknown").font(.subheadline.weight(.semibold))
                    Text(StaffReportsView.date(appeal.createdAt)).font(.caption).foregroundStyle(Brand.textMuted)
                    Text(appeal.reason ?? "").font(.footnote).foregroundStyle(Brand.textSecondary)
                    HStack {
                        Button("Deny") { Task { await decide(appeal, approve: false) } }.buttonStyle(.bordered)
                        Button("Lift the ban") { Task { await decide(appeal, approve: true) } }.buttonStyle(.borderedProminent)
                    }
                    .font(.footnote.weight(.semibold))
                }
                .padding(.vertical, 4)
                .listRowBackground(Brand.surface)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Ban appeals")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let data = try await StaffAPI.request("/api/moderation/ban-appeals")
            struct Response: Decodable { let appeals: [Appeal] }
            appeals = try JSONDecoder().decode(Response.self, from: data).appeals
        } catch {
            notice = (error.localizedDescription, false)
        }
        loading = false
    }

    private func decide(_ appeal: Appeal, approve: Bool) async {
        do {
            _ = try await StaffAPI.request("/api/moderation/ban-appeals/\(appeal.id)/decide", method: "POST",
                                           body: ["approve": approve])
            appeals.removeAll { $0.id == appeal.id }
            notice = (approve ? "Ban lifted." : "Appeal denied.", true)
        } catch {
            notice = (error.localizedDescription, false)
        }
    }
}

// MARK: - Team (managers)

struct StaffTeamView: View {
    struct Member: Decodable, Identifiable, Hashable {
        let userId: String
        let username: String?
        let displayName: String?
        let roles: [String]
        var id: String { userId }
        enum CodingKeys: String, CodingKey {
            case username, roles
            case userId = "user_id", displayName = "display_name"
        }
    }

    @Environment(AppState.self) private var app
    @State private var team: [Member] = []
    @State private var username = ""
    @State private var role = "staff"
    @State private var isOwner = false
    @State private var notice: (String, Bool)?

    private static let labels = ["owner": "Owner", "manager": "Manager", "staff": "Staff", "moderator": "Moderator"]

    var body: some View {
        Form {
            Section {
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Picker("Role", selection: $role) {
                    if isOwner { Text("Manager").tag("manager") }
                    Text("Staff").tag("staff")
                    Text("Moderator").tag("moderator")
                }
                Button("Grant") { Task { await grant() } }
                    .disabled(username.trimmingCharacters(in: .whitespaces).isEmpty)
            } footer: {
                Text(isOwner ? "Appoint managers, staff and moderators." : "Appoint staff and moderators. Only the owner appoints managers.")
            }
            .listRowBackground(Brand.surface)
            if let notice { Notice(text: notice.0, ok: notice.1) }
            Section("Team") {
                ForEach(team) { member in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(member.displayName ?? member.username ?? "Unknown").font(.subheadline.weight(.semibold))
                        + Text(member.username.map { "  @\($0)" } ?? "").font(.caption).foregroundColor(Brand.textMuted)
                        HStack(spacing: 6) {
                            ForEach(member.roles, id: \.self) { r in
                                let removable = r != "owner" && (r != "manager" || isOwner)
                                Button {
                                    Task { await setRole(member.userId, r, grant: false) }
                                } label: {
                                    HStack(spacing: 4) {
                                        Text(Self.labels[r] ?? r)
                                        if removable { Image(systemName: "xmark").font(.caption2.weight(.bold)) }
                                    }
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(Brand.elevated, in: Capsule())
                                }
                                .buttonStyle(.plain)
                                .disabled(!removable)
                                .accessibilityLabel(removable ? "Remove \(Self.labels[r] ?? r)" : (Self.labels[r] ?? r))
                            }
                        }
                    }
                }
            }
            .listRowBackground(Brand.surface)
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Team")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let uid = app.currentUserId {
                isOwner = (try? await SupabaseManager.client.rpc("is_platform_owner", params: ["p_user": uid]).execute().value) ?? false
            }
            await load()
        }
    }

    private func load() async {
        do {
            team = try await SupabaseManager.client.rpc("list_platform_team").execute().value
        } catch {
            notice = (error.localizedDescription, false)
        }
    }

    private func setRole(_ userId: String, _ role: String, grant: Bool) async {
        struct Params: Encodable { let p_user: String; let p_role: String; let p_grant: Bool }
        do {
            try await SupabaseManager.client.rpc("manager_set_role", params: Params(p_user: userId, p_role: role, p_grant: grant)).execute()
            notice = ("\(grant ? "Granted" : "Removed") \(Self.labels[role] ?? role).", true)
            await load()
        } catch {
            notice = (error.localizedDescription, false)
        }
    }

    private func grant() async {
        guard let id = await StaffAPI.userId(forUsername: username) else {
            notice = ("No one has that username.", false)
            return
        }
        await setRole(id, role, grant: true)
        username = ""
    }
}

// MARK: - Suspend a space (managers)

struct StaffSuspendView: View {
    @State private var space = ""
    @State private var reason = ""
    @State private var busy = false
    @State private var confirm = false
    @State private var notice: (String, Bool)?

    var body: some View {
        Form {
            Section {
                TextField("Space ID or invite link", text: $space)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("Reason (required to suspend)", text: $reason, axis: .vertical)
            } footer: {
                Text("A suspended space is read-only, hidden from Discover and closed to new members. To have Sentinel review everyone who spoke there, suspend it from the web.")
            }
            .listRowBackground(Brand.surface)
            Section {
                Button("Suspend space", role: .destructive) { confirm = true }
                    .disabled(busy || space.trimmingCharacters(in: .whitespaces).isEmpty
                              || reason.trimmingCharacters(in: .whitespaces).isEmpty)
                Button("Lift suspension") { Task { await suspend(false) } }
                    .disabled(busy || space.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .listRowBackground(Brand.surface)
            if let notice { Notice(text: notice.0, ok: notice.1) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background)
        .navigationTitle("Suspend a space")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Suspend this space?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Suspend", role: .destructive) { Task { await suspend(true) } }
        } message: {
            Text("It becomes read-only and closed to new members.")
        }
    }

    private func resolveSpace() async -> String? {
        var value = space.trimmingCharacters(in: .whitespaces)
        if let range = value.range(of: "/server/") { value = String(value[range.upperBound...]) }
        if value.range(of: "^[0-9a-fA-F-]{36}$", options: .regularExpression) != nil { return value }
        struct Row: Decodable { let id: String }
        let rows: [Row] = (try? await SupabaseManager.client.rpc("get_server_by_invite", params: ["p_code": value])
            .execute().value) ?? []
        return rows.first?.id
    }

    private func suspend(_ suspendIt: Bool) async {
        busy = true
        defer { busy = false }
        guard let id = await resolveSpace() else {
            notice = ("Couldn't find that space. Use its ID or an invite link.", false)
            return
        }
        struct Params: Encodable { let p_server: String; let p_suspend: Bool; let p_reason: String? }
        do {
            let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
            try await SupabaseManager.client.rpc("manager_suspend_server", params: Params(
                p_server: id, p_suspend: suspendIt, p_reason: trimmed.isEmpty ? nil : trimmed,
            )).execute()
            notice = (suspendIt ? "Space suspended." : "Suspension lifted.", true)
        } catch {
            notice = (error.localizedDescription, false)
        }
    }
}
