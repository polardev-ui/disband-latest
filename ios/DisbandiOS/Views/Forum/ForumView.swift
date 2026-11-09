import SwiftUI

/// A forum: its posts, newest activity first, with pinned posts on top. Each
/// post is its own thread; tapping one opens it as a chat. "New post" starts
/// one with a title and an opening message.
struct ForumView: View {
    let forum: Channel
    var canModerate: Bool = false

    @State private var posts: [ForumPost] = []
    @State private var loading = true
    @State private var error: String?
    @State private var composing = false
    @State private var search = ""
    @State private var authors: [String: Profile] = [:]

    private var shown: [ForumPost] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        let list = q.isEmpty ? posts : posts.filter {
            $0.title.lowercased().contains(q) || ($0.opening ?? "").lowercased().contains(q)
        }
        return list.sorted {
            if ($0.pinned ?? false) != ($1.pinned ?? false) { return $0.pinned ?? false }
            return ($0.lastMessageAt ?? $0.createdAt ?? "") > ($1.lastMessageAt ?? $1.createdAt ?? "")
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Brand.textMuted)
                    TextField("Search posts", text: $search)
                        .textInputAutocapitalization(.never)
                        .foregroundStyle(Brand.textPrimary)
                }
                .padding(.horizontal, 14)
                .frame(height: 44)
                .background(Brand.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                if loading && posts.isEmpty {
                    ProgressView().padding(.top, 40)
                } else if let error, posts.isEmpty {
                    Text(error).font(.subheadline).foregroundStyle(Brand.textMuted).padding(.top, 40)
                } else if shown.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 34)).foregroundStyle(Brand.textMuted)
                        Text(search.isEmpty ? "No posts yet" : "Nothing matches")
                            .font(.headline).foregroundStyle(Brand.textPrimary)
                        if search.isEmpty {
                            Text("Start the first conversation.").font(.subheadline).foregroundStyle(Brand.textMuted)
                        }
                    }
                    .padding(.top, 48)
                } else {
                    ForEach(shown) { post in
                        RouteLink(value: SpacesRoute.chat(.channel(id: post.id, name: post.title),
                                                          callPeer: nil, canModerate: canModerate)) {
                            postCard(post)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
        }
        .background(Brand.surfaceRaised)
        .refreshable { await load() }
        .navigationTitle(forum.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { composing = true } label: {
                    Label("New post", systemImage: "square.and.pencil")
                }
            }
        }
        .sheet(isPresented: $composing) {
            NewForumPostSheet(forum: forum) { _ in
                composing = false
                Task { await load() }
            }
            .presentationDetents([.large])
        }
        .task { await load() }
    }

    private func postCard(_ post: ForumPost) -> some View {
        let author = post.authorId.flatMap { authors[$0] }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if post.pinned == true {
                    Image(systemName: "pin.fill").font(.caption).foregroundStyle(Brand.accent)
                }
                Text(post.title)
                    .font(.headline)
                    .foregroundStyle(Brand.textPrimary)
                    .lineLimit(2)
            }
            if let opening = post.opening, !opening.isEmpty {
                Text(opening)
                    .font(.subheadline)
                    .foregroundStyle(Brand.textSecondary)
                    .lineLimit(3)
            }
            if let tags = post.tags, !tags.isEmpty {
                HStack(spacing: 6) {
                    ForEach(tags.prefix(4), id: \.self) { tag in
                        Text(tag)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Brand.textSecondary)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Brand.surfaceRaised, in: Capsule())
                    }
                }
            }
            HStack(spacing: 8) {
                AvatarView(url: author?.avatarUrl, name: author?.name ?? "?", size: 18)
                Text(author?.name ?? "Someone").font(.caption.weight(.semibold)).foregroundStyle(Brand.textSecondary)
                Spacer()
                Label("\(max(0, (post.messageCount ?? 1) - 1))", systemImage: "bubble.left")
                    .font(.caption)
                    .foregroundStyle(Brand.textMuted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.06)))
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            posts = try await ForumService.posts(forumId: forum.id)
            error = nil
            let ids = Set(posts.compactMap(\.authorId)).subtracting(authors.keys)
            if !ids.isEmpty, let found = try? await DatabaseService.profiles(ids: Array(ids)) {
                authors.merge(found) { _, new in new }
            }
        } catch {
            self.error = "Couldn't load the posts. Pull to try again."
        }
    }
}

/// Starting a forum post: a title and the first message.
struct NewForumPostSheet: View {
    let forum: Channel
    var onPosted: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var content = ""
    @State private var posting = false
    @State private var error: String?

    private var ready: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("What's it about?", text: $title)
                }
                Section("Message") {
                    TextField("Say more…", text: $content, axis: .vertical)
                        .lineLimit(4...12)
                }
                if let error {
                    Section { Text(error).foregroundStyle(Brand.dnd) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.surfaceRaised)
            .navigationTitle("New post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if posting {
                        ProgressView()
                    } else {
                        Button("Post") { Task { await post() } }.disabled(!ready)
                    }
                }
            }
        }
    }

    private func post() async {
        posting = true
        defer { posting = false }
        do {
            let id = try await ForumService.create(
                forumId: forum.id,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                content: content.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            onPosted(id)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
