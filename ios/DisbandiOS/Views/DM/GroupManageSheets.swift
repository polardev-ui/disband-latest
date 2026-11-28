import Supabase
import SwiftUI

/// Group chat management, through the web's functions (`create_group_chat`,
/// `add_group_members`, `rename_group_chat` in `AppContext.tsx`). The
/// database checks every rule (friends only, 3 to 9 others, owner renames);
/// the sheets only reflect them.
enum GroupChatService {
    private struct CreateArgs: Encodable, Sendable { let p_name: String; let p_member_ids: [String] }
    private struct AddArgs: Encodable, Sendable { let p_group_id: String; let p_member_ids: [String] }
    private struct RenameArgs: Encodable, Sendable { let p_group_id: String; let p_name: String }

    /// The new group's id.
    static func create(name: String, memberIds: [String]) async throws -> String {
        try await SupabaseManager.client.rpc("create_group_chat", params: CreateArgs(
            p_name: name.trimmingCharacters(in: .whitespacesAndNewlines), p_member_ids: memberIds
        )).execute().value
    }

    static func addMembers(groupId: String, memberIds: [String]) async throws {
        try await SupabaseManager.client.rpc("add_group_members", params: AddArgs(
            p_group_id: groupId, p_member_ids: memberIds
        )).execute()
    }

    static func rename(groupId: String, name: String) async throws {
        try await SupabaseManager.client.rpc("rename_group_chat", params: RenameArgs(
            p_group_id: groupId, p_name: name.trimmingCharacters(in: .whitespacesAndNewlines)
        )).execute()
    }

    /// The database's sentence, made friendly the way the web does
    /// (`mapGroupChatError`).
    static func message(for error: Error, fallback: String) -> String {
        let text = (error as? PostgrestError)?.message ?? error.localizedDescription
        let lower = text.lowercased()
        if lower.contains("wait 20 seconds before creating") { return "Wait 20 seconds before creating another group chat." }
        if lower.contains("at least 3 friends") { return "Select at least 3 friends to start a group DM." }
        if lower.contains("only add accepted friends") { return "You can only add friends." }
        return text.count < 140 ? text : fallback
    }

    static func friends(of userId: String) async -> [Profile]? {
        guard let rows = try? await DatabaseService.friendships(currentUserId: userId) else { return nil }
        return rows.filter { $0.status == .accepted }
            .compactMap { $0.requesterId == userId ? $0.addressee : $0.requester }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

/// Friends to tick, at most `room` of them.
private struct FriendPicker: View {
    let friends: [Profile]
    @Binding var picked: Set<String>
    let room: Int
    let query: String

    private var shown: [Profile] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return friends }
        return friends.filter { $0.name.lowercased().contains(q) || ($0.username ?? "").lowercased().contains(q) }
    }

    var body: some View {
        ForEach(shown) { friend in
            let checked = picked.contains(friend.id)
            let canPick = checked || picked.count < room
            Button {
                if checked { picked.remove(friend.id) } else if canPick { picked.insert(friend.id) }
                Haptics.select()
            } label: {
                HStack(spacing: 12) {
                    AvatarView(url: friend.avatarUrl, name: friend.name, size: 36)
                    StyledName(friend, size: 15).lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: checked ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 20))
                        .foregroundStyle(checked ? Brand.accent : Brand.textMuted)
                }
                .opacity(canPick ? 1 : 0.45)
            }
            .disabled(!canPick)
            .listRowBackground(Brand.surface)
        }
    }
}

/// Start a group chat with 3 to 9 friends.
struct CreateGroupSheet: View {
    let currentUserId: String
    /// The new group's id and name, once it exists.
    var onCreated: (String, String) -> Void = { _, _ in }

    @Environment(\.dismiss) private var dismiss
    @State private var friends: [Profile]?
    @State private var picked: Set<String> = []
    @State private var name = ""
    @State private var query = ""
    @State private var saving = false
    @State private var error: String?

    private var defaultName: String {
        let names = (friends ?? []).filter { picked.contains($0.id) }.map(\.name).prefix(3)
        return names.joined(separator: ", ")
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField(defaultName.isEmpty ? "Group name" : defaultName, text: $name)
                        .listRowBackground(Brand.surface)
                } footer: {
                    Text("Pick 3 to 9 friends. \(picked.count) selected.")
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Brand.dnd).listRowBackground(Color.clear)
                }
                Section("Friends") {
                    if let friends {
                        if friends.isEmpty {
                            Text("Add some friends first.").foregroundStyle(Brand.textMuted)
                                .listRowBackground(Brand.surface)
                        } else {
                            FriendPicker(friends: friends, picked: $picked, room: 9, query: query)
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .searchable(text: $query, prompt: "Search friends")
            .navigationTitle("New Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button("Create") { Task { await create() } }
                            .disabled(picked.count < 3 || picked.count > 9)
                    }
                }
            }
        }
        .task {
            friends = await GroupChatService.friends(of: currentUserId) ?? []
        }
    }

    private func create() async {
        let chosen = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalName = String((chosen.isEmpty ? defaultName : chosen).prefix(100))
        saving = true
        error = nil
        defer { saving = false }
        do {
            let id = try await GroupChatService.create(name: finalName, memberIds: Array(picked))
            onCreated(id, finalName)
            dismiss()
        } catch {
            self.error = GroupChatService.message(for: error, fallback: "Couldn't create the group. Try again.")
        }
    }
}

/// Add friends who aren't in the group yet (10 members at most).
struct AddGroupMembersSheet: View {
    let currentUserId: String
    let group: GroupChat
    var onAdded: () -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @State private var friends: [Profile]?
    @State private var picked: Set<String> = []
    @State private var query = ""
    @State private var saving = false
    @State private var error: String?

    private var room: Int { max(0, 10 - (group.members?.count ?? 1)) }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Brand.dnd).listRowBackground(Color.clear)
                }
                Section {
                    if let friends {
                        if friends.isEmpty {
                            Text(room == 0 ? "This group is full." : "All your friends are already here.")
                                .foregroundStyle(Brand.textMuted)
                                .listRowBackground(Brand.surface)
                        } else {
                            FriendPicker(friends: friends, picked: $picked, room: room, query: query)
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
                    }
                } footer: {
                    Text(room == 1 ? "Room for 1 more." : "Room for \(room) more.")
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .searchable(text: $query, prompt: "Search friends")
            .navigationTitle("Add to \(group.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button("Add") { Task { await add() } }.disabled(picked.isEmpty)
                    }
                }
            }
        }
        .task {
            let inGroup = Set(group.members?.map(\.id) ?? [])
            friends = (await GroupChatService.friends(of: currentUserId) ?? []).filter { !inGroup.contains($0.id) }
        }
    }

    private func add() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await GroupChatService.addMembers(groupId: group.id, memberIds: Array(picked))
            onAdded()
            dismiss()
        } catch {
            self.error = GroupChatService.message(for: error, fallback: "Couldn't add them. Try again.")
        }
    }
}
