import SwiftUI

/**
 The in-app notification inbox.

 The rows had been in the database and fetchable all along — `notifications`
 has been queried since the badge was added — but nothing on iOS ever showed
 them. A push you swiped away was gone, and there was no way to find out what
 you had missed while the app was closed.

 Tapping one routes exactly like tapping the push does, through
 [NotificationRouter], so there is one answer to "where does this take me"
 rather than two that can drift apart.
 */
struct NotificationsSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var items: [AppNotification] = []
    @State private var loading = true
    @State private var clearing = false

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    StateView(kind: .loading)
                } else if items.isEmpty {
                    StateView(
                        kind: .empty,
                        title: "Nothing new.\nMentions and requests land here.",
                        systemImage: "bell"
                    )
                } else {
                    List {
                        ForEach(items) { item in
                            Button { open(item) } label: { row(item) }
                                .listRowBackground(Brand.surface)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Brand.surface)
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    // Only offered when there is something to clear, so the
                    // button is never a no-op that looks broken.
                    if items.contains(where: { !$0.read }) {
                        Button(clearing ? "Clearing…" : "Clear") { clearAll() }
                            .disabled(clearing)
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func row(_ item: AppNotification) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // An unread marker rather than a different background: the row is
            // already tinted by the list, and two signals for one state reads
            // as noise.
            Circle()
                .fill(item.read ? Color.clear : Brand.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.subheadline.weight(item.read ? .regular : .semibold))
                    .foregroundStyle(Brand.textPrimary)
                if let body = item.body, !body.isEmpty {
                    Text(body)
                        .font(.footnote)
                        .foregroundStyle(Brand.textSecondary)
                        .lineLimit(3)
                }
                if let created = item.createdAt {
                    Text(RelativeTime.short(created))
                        .font(.caption2)
                        .foregroundStyle(Brand.textMuted)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private func load() async {
        guard let uid = app.currentUserId else { loading = false; return }
        items = (try? await DatabaseService.notifications(currentUserId: uid)) ?? []
        loading = false
    }

    private func clearAll() {
        guard let uid = app.currentUserId else { return }
        clearing = true
        // Marked locally first: a list that sits unchanged for a round trip
        // after you press Clear reads as a button that did nothing.
        items = items.map { var copy = $0; copy.read = true; return copy }
        Task {
            try? await DatabaseService.markAllNotificationsRead(currentUserId: uid)
            clearing = false
        }
    }

    private func open(_ item: AppNotification) {
        guard let uid = app.currentUserId else { return }
        if !item.read {
            items = items.map { row in
                guard row.id == item.id else { return row }
                var copy = row
                copy.read = true
                return copy
            }
            Task {
                try? await DatabaseService.markNotificationRead(id: item.id, currentUserId: uid)
            }
        }
        // `link` is the same source id a push carries, so this lands in the
        // same place tapping the push would.
        if let link = item.link, !link.isEmpty {
            NotificationRouter.shared.handleTap(source: link)
            dismiss()
        }
    }
}
