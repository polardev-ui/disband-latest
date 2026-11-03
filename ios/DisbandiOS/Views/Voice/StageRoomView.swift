import SwiftUI

/// The inside of a stage channel: the topic, who's speaking, who's asking to,
/// and the audience. Moderators (owner, admins, Manage Channels) run it from
/// here; everyone else listens and can raise a hand. Mirrors the web's
/// StagePanel, and every action is checked again by the database.
struct StageRoomView: View {
    @Environment(AppState.self) private var app
    @Environment(VoiceSession.self) private var voice

    @State private var editingTopic = false
    @State private var topicDraft = ""

    private var stage: StageInfo { voice.stage ?? StageInfo() }
    private var meId: String? { app.currentUserId }

    /// Everyone present, with you included even before presence reloads.
    private var everyone: [VoiceMember] {
        var people = voice.members
        if let meId, !people.contains(where: { $0.userId == meId }), let profile = app.profile {
            people.insert(VoiceMember(userId: meId, profile: profile, muted: true), at: 0)
        }
        return people
    }

    private var speakers: [VoiceMember] { everyone.filter(\.stageSpeaker) }
    private var audience: [VoiceMember] { everyone.filter { !$0.stageSpeaker } }
    private var raisedHands: [VoiceMember] {
        audience.filter(\.handRaised).sorted { ($0.handRaisedAt ?? "") < ($1.handRaisedAt ?? "") }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                topicCard
                if voice.stageInvited { inviteCard }

                section(speakers.isEmpty ? "Speakers" : "Speakers — \(speakers.count)") {
                    if speakers.isEmpty {
                        Text("Nobody is on stage yet.")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.6))
                    } else {
                        grid(speakers, size: 76)
                    }
                }

                if stage.isModerator && !raisedHands.isEmpty {
                    section("Requests — \(raisedHands.count)") {
                        VStack(spacing: 8) {
                            ForEach(raisedHands) { requestRow($0) }
                        }
                    }
                }

                if !audience.isEmpty {
                    section("Audience — \(audience.count)") {
                        grid(audience, size: 54)
                    }
                }
            }
            .padding(.vertical, 8)
        }
        .alert(stage.isLive ? "Edit Topic" : "Start the Stage", isPresented: $editingTopic) {
            TextField("What will you be talking about today?", text: $topicDraft)
            Button("Cancel", role: .cancel) {}
            Button(stage.isLive ? "Save" : "Start") {
                let topic = topicDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !topic.isEmpty else { return }
                Task { await voice.startStage(topic: String(topic.prefix(120))) }
            }
        } message: {
            Text("Up to 120 characters.")
        }
    }

    // MARK: - Topic

    private var topicCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if stage.isLive {
                    Text("LIVE")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).frame(height: 20)
                        .background(Brand.online, in: Capsule())
                }
                Text("\(speakers.count) speaking · \(audience.count) listening")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.7))
                Spacer()
                if stage.isModerator { moderatorMenu }
            }

            if stage.isLive, let topic = stage.topic {
                Text(topic)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(stage.isModerator ? "This stage hasn't started yet." : "Waiting for the Stage to start.")
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.85))
                if stage.isModerator {
                    Button {
                        topicDraft = ""
                        editingTopic = true
                    } label: {
                        Label("Start the Stage", systemImage: "dot.radiowaves.left.and.right")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16).frame(height: 40)
                            .background(Brand.online, in: Capsule())
                    }
                    .padding(.top, 2)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var moderatorMenu: some View {
        Menu {
            if stage.isLive {
                Button {
                    topicDraft = stage.topic ?? ""
                    editingTopic = true
                } label: { Label("Edit Topic", systemImage: "pencil") }
            }
            Toggle(isOn: Binding(
                get: { stage.requestsEnabled },
                set: { on in Task { await voice.setStageRequests(on) } }
            )) {
                Label("Allow requests to speak", systemImage: "hand.raised")
            }
            if stage.isLive {
                Button(role: .destructive) {
                    Task { await voice.endStage() }
                } label: { Label("End Stage", systemImage: "stop.circle") }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(.white.opacity(0.14), in: Circle())
        }
        .accessibilityLabel("Stage settings")
    }

    private var inviteCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("You've been invited to speak.", systemImage: "mic.badge.plus")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
            HStack(spacing: 10) {
                Button {
                    Task { await voice.respondToInvite(accept: false) }
                } label: {
                    Text("Decline")
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(.white.opacity(0.14), in: Capsule())
                }
                Button {
                    Task { await voice.respondToInvite(accept: true) }
                } label: {
                    Text("Accept")
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(Brand.online, in: Capsule())
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
        }
        .padding(16)
        .background(Brand.accent.opacity(0.35), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Brand.accent, lineWidth: 1))
    }

    // MARK: - People

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.6))
            content()
        }
    }

    private func grid(_ people: [VoiceMember], size: CGFloat) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: size + 24), spacing: 12)], spacing: 16) {
            ForEach(people) { member in
                person(member, size: size)
                    .contextMenu { actions(for: member) }
            }
        }
        .animation(.snappy(duration: 0.3), value: people.map(\.id))
    }

    private func person(_ member: VoiceMember, size: CGFloat) -> some View {
        let isMe = member.userId == meId
        let speaking = member.stageSpeaker && voice.speaking.contains(member.userId)
        let muted = isMe ? voice.micMuted : member.muted
        return VStack(spacing: 6) {
            AvatarView(url: member.profile?.avatarUrl, name: member.name, size: size)
                .overlay(Circle().stroke(Brand.online, lineWidth: speaking ? 3 : 0).padding(-4))
                .overlay(alignment: .bottomTrailing) {
                    if member.stageSpeaker && muted {
                        badge("mic.slash.fill", Brand.dnd)
                    } else if member.handRaised {
                        badge("hand.raised.fill", Brand.accent)
                    }
                }
            Text(isMe ? "\(member.name) (you)" : member.name)
                .font(.caption.weight(.medium))
                .foregroundStyle(.white.opacity(0.9))
                .lineLimit(1)
        }
        .animation(.snappy(duration: 0.2), value: speaking)
    }

    private func badge(_ symbol: String, _ color: Color) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(color, in: Circle())
            .overlay(Circle().stroke(.black.opacity(0.4), lineWidth: 2))
    }

    private func requestRow(_ member: VoiceMember) -> some View {
        HStack(spacing: 10) {
            AvatarView(url: member.profile?.avatarUrl, name: member.name, size: 34)
            Text(member.name)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .lineLimit(1)
            Spacer()
            Button("Dismiss") { Task { await voice.moveToAudience(member.userId) } }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.8))
            Button {
                Task { await voice.inviteToSpeak(member.userId) }
            } label: {
                Text("Invite")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12).frame(height: 30)
                    .background(Brand.online, in: Capsule())
            }
        }
        .padding(10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder private func actions(for member: VoiceMember) -> some View {
        let isMe = member.userId == meId
        if stage.isModerator {
            if member.stageSpeaker {
                Button { Task { await voice.moveToAudience(member.userId) } } label: {
                    Label("Move to Audience", systemImage: "arrow.down.circle")
                }
            } else if !member.stageInvited {
                Button { Task { await voice.inviteToSpeak(member.userId) } } label: {
                    Label(isMe ? "Become a Speaker" : "Invite to Speak", systemImage: "mic.badge.plus")
                }
            }
            if !isMe {
                Button(role: .destructive) { Task { await voice.disconnectFromStage(member.userId) } } label: {
                    Label("Disconnect from Stage", systemImage: "phone.down")
                }
            }
        } else if isMe && member.stageSpeaker {
            Button { Task { await voice.moveToAudience(member.userId) } } label: {
                Label("Move to Audience", systemImage: "arrow.down.circle")
            }
        }
    }
}
