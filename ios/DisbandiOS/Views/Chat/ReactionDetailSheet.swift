import SwiftUI

/**
 Who reacted to a message, with a tab per emoji.

 A count alone answers "how many" but never "who", which is usually the more
 interesting question in a busy channel. There is no hover on a phone, so this
 is reached by pressing and holding a reaction — the same gesture the rest of
 the app uses for "tell me more about this".
 */
struct ReactionDetailSheet: View {
    let reactions: [ReactionSummary]
    @State var selected: String

    @Environment(\.dismiss) private var dismiss
    @State private var profiles: [String: Profile] = [:]

    private var current: ReactionSummary? {
        reactions.first { $0.emoji == selected } ?? reactions.first
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if reactions.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(reactions) { reaction in
                                Button { selected = reaction.emoji } label: {
                                    HStack(spacing: 5) {
                                        Text(reaction.emoji).font(.body)
                                        Text("\(reaction.count)")
                                            .font(.footnote.weight(.semibold))
                                    }
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(
                                        reaction.emoji == selected
                                            ? Brand.accent.opacity(0.25) : Brand.elevated,
                                        in: .capsule,
                                    )
                                    .foregroundStyle(Brand.textPrimary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                    Divider().overlay(Brand.elevated)
                }

                List(current?.userIds ?? [], id: \.self) { userId in
                    HStack(spacing: 10) {
                        if let profile = profiles[userId] {
                            AvatarView(url: profile.avatarUrl, name: profile.name, size: 32)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(profile.name)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Brand.textPrimary)
                                Text("@\(profile.handle)")
                                    .font(.caption)
                                    .foregroundStyle(Brand.textMuted)
                            }
                        } else {
                            Circle().fill(Brand.elevated).frame(width: 32, height: 32)
                            Text("Loading…").font(.subheadline).foregroundStyle(Brand.textMuted)
                        }
                    }
                    .listRowBackground(Brand.surface)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
            .background(Brand.background)
            .navigationTitle(current.map { "\($0.count) \($0.count == 1 ? "reaction" : "reactions")" } ?? "Reactions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
        }
        .task(id: selected) {
            // One batched lookup, not one per row.
            let ids = current?.userIds ?? []
            let missing = ids.filter { profiles[$0] == nil }
            guard !missing.isEmpty else { return }
            if let loaded = try? await DatabaseService.profiles(ids: missing) {
                profiles.merge(loaded) { _, new in new }
            }
        }
    }
}
