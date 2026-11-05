import SwiftUI
import Supabase
import Realtime

/// A poll in a message: tap an option to vote, see the counts live. The author
/// can close it. Matches the web's PollCard.
struct PollCardView: View {
    let pollId: String

    @Environment(AppState.self) private var app
    @State private var poll: Poll?
    @State private var error: String?
    @State private var busy = false
    @State private var channel: RealtimeChannelV2?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let poll {
                HStack(alignment: .top) {
                    Label(poll.question, systemImage: "chart.bar.xaxis")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Brand.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    if poll.authorId == app.currentUserId, !poll.closed {
                        Button("Close") { Task { await close() } }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Brand.textMuted)
                            .disabled(busy)
                    }
                }
                ForEach(Array(poll.options.enumerated()), id: \.offset) { index, label in
                    option(poll, index: index, label: label)
                }
                Text(footer(poll))
                    .font(.caption)
                    .foregroundStyle(Brand.textMuted)
            } else if error == nil {
                ProgressView().frame(maxWidth: .infinity, minHeight: 60)
            }
            if let error {
                Text(error).font(.caption).foregroundStyle(Brand.dnd)
            }
        }
        .padding(12)
        .frame(maxWidth: 320, alignment: .leading)
        .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.top, 4)
        .task(id: pollId) { await start() }
        .onDisappear {
            if let channel { Task { await SupabaseManager.client.removeChannel(channel) } }
            channel = nil
        }
    }

    private func option(_ poll: Poll, index: Int, label: String) -> some View {
        let votes = poll.counts[index]
        let total = poll.totalVotes
        let share = total > 0 ? Double(votes) / Double(total) : 0
        let mine = poll.myVote == index
        let leading = poll.counts.max() ?? 0
        let winning = poll.closed && votes == leading && votes > 0
        return Button { Task { await vote(index) } } label: {
            HStack(spacing: 8) {
                Image(systemName: mine ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(mine ? Brand.accent : Brand.textMuted)
                Text(label)
                    .font(.subheadline.weight(winning ? .bold : .regular))
                    .foregroundStyle(Brand.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                Text("\(Int((share * 100).rounded()))%")
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(Brand.textMuted)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(alignment: .leading) {
                GeometryReader { geo in
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill((mine ? Brand.accent : Brand.textMuted).opacity(0.18))
                        .frame(width: geo.size.width * share)
                }
            }
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(mine ? Brand.accent : .clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(poll.closed || busy)
        .accessibilityLabel("\(label), \(votes) \(votes == 1 ? "vote" : "votes")\(mine ? ", your vote" : "")")
    }

    private func footer(_ poll: Poll) -> String {
        let total = poll.totalVotes
        let votes = "\(total) \(total == 1 ? "vote" : "votes")"
        return poll.closed ? "\(votes) · Poll closed" : votes
    }

    private func start() async {
        await load()
        let channel = SupabaseManager.client.channel(PollService.topic(pollId))
        let changes = channel.broadcastStream(event: "changed")
        await channel.subscribe()
        self.channel = channel
        for await _ in changes where !busy {
            await load()
        }
    }

    private func load() async {
        do {
            poll = try await PollService.get(pollId)
            error = nil
        } catch {
            if poll == nil { self.error = "This poll couldn't be loaded." }
        }
    }

    private func announce() async {
        try? await channel?.broadcast(event: "changed", message: [String: String]())
    }

    private func vote(_ index: Int) async {
        guard let current = poll, !current.closed, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            poll = try await PollService.vote(pollId, option: index)
            error = nil
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            await announce()
        } catch {
            self.error = "Couldn't record your vote."
        }
    }

    private func close() async {
        busy = true
        defer { busy = false }
        do {
            poll = try await PollService.close(pollId)
            error = nil
            await announce()
        } catch {
            self.error = "Couldn't close the poll."
        }
    }
}

/// Ask a question with 2–10 answers. Sent as a message, as on the web.
struct PollCreateSheet: View {
    var onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var question = ""
    @State private var options = ["", ""]
    @State private var creating = false
    @State private var error: String?

    private var answers: [String] {
        options.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
    private var canCreate: Bool {
        !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && answers.count >= 2 && !creating
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Question") {
                    TextField("What do you want to ask?", text: $question, axis: .vertical)
                        .onChange(of: question) { if question.count > 200 { question = String(question.prefix(200)) } }
                }
                .listRowBackground(Brand.surface)
                Section {
                    ForEach(options.indices, id: \.self) { index in
                        HStack {
                            TextField("Answer \(index + 1)", text: $options[index])
                                .onChange(of: options[index]) {
                                    if options[index].count > 100 { options[index] = String(options[index].prefix(100)) }
                                }
                            if options.count > 2 {
                                Button {
                                    options.remove(at: index)
                                } label: {
                                    Image(systemName: "minus.circle.fill").foregroundStyle(Brand.dnd)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Remove answer \(index + 1)")
                            }
                        }
                    }
                    if options.count < PollService.maxOptions {
                        Button { options.append("") } label: {
                            Label("Add an answer", systemImage: "plus")
                        }
                    }
                } header: {
                    Text("Answers")
                }
                .listRowBackground(Brand.surface)
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Brand.dnd)
                        .listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background)
            .navigationTitle("Create a poll")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(creating ? "Posting…" : "Post") { Task { await create() } }
                        .disabled(!canCreate)
                }
            }
        }
    }

    private func create() async {
        creating = true
        defer { creating = false }
        do {
            let poll = try await PollService.create(
                question: question.trimmingCharacters(in: .whitespacesAndNewlines),
                options: answers,
            )
            onCreated(poll.id)
            dismiss()
        } catch {
            self.error = "Couldn't create the poll. Try again."
        }
    }
}
