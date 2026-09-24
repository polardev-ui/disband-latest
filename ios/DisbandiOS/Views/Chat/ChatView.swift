import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Shared conversation screen used for channels, DMs, and group chats.
struct ChatContentBottomKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

struct ChatViewportKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// Frames of the hold-to-react tray's cells, in `chatScroll` space, so the
/// dragging finger can be hit-tested against them as it moves across the tray.
struct ChatTrayEmojiKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { _, new in new }
    }
}

/// A reaction emoji mid-flight from the tray to the message it commits on.
struct FlyingReact: Equatable {
    var emoji: String
    var from: CGPoint
    var to: CGPoint
}

struct ChatView: View {
    @Environment(AppState.self) private var app
    @Environment(CallManager.self) private var call
    @Environment(DmUnreadStore.self) private var unreadStore
    @Environment(VoiceSession.self) private var voice
    @Environment(DirectMessagesViewModel.self) private var directMessages
    @State private var model: ChatViewModel
    @State private var draft = ""
    @State private var stickToBottom = true
    @State private var contentBottom: CGFloat = 0
    @State private var viewportHeight: CGFloat = 0

    private func updateStick() {
        stickToBottom = contentBottom - viewportHeight < 100
    }
    @State private var showGifPicker = false
    @State private var showPhotoPicker = false
    @State private var photoItem: PhotosPickerItem?
    @State private var openProfile: Profile?
    /// Set while a tapped mention is being looked up, so the sheet can show
    /// something immediately rather than after a round trip.
    @State private var mentionLookup: String?
    @State private var reactingMessage: DisplayMessage?
    @State private var replyingTo: DisplayMessage?

    private let quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀"]

    /// The trailing "⋯" cell of the hold-to-react tray; its string is also the
    /// frame-key sentinel that tells it apart from the quick reactions.
    private let trayMoreKey = "⋯"

    // Hold-to-react tray state, all in the `chatScroll` coordinate space.
    @State private var reactTrayAnchor: CGRect = .zero
    @State private var reactTrayEmojiFrames: [String: CGRect] = [:]
    @State private var reactHoverEmoji: String?
    @State private var showTrayMenu = false
    @State private var trayMenuTarget: DisplayMessage?
    /// The emoji flying from the tray to the message, while the morph plays.
    @State private var flyingReact: FlyingReact?
    @State private var flyPosition: CGPoint = .zero
    /// True once the finger has lifted without picking an emoji: the tray
    /// stays up and reacts to plain taps until dismissed.
    @State private var trayPersistent = false

    /// The DM peer, when `source` is `.dm`. Enables the header call button.
    var callPeer: Profile?
    /// True when the reader may remove other people's messages here — the
    /// server owner, or a role with manage_messages. Only meaningful for a
    /// server channel; nobody moderates a DM or a group chat.
    var canModerate: Bool = false
    /// Set when you can't post here (read-only, no permission, timed out);
    /// the composer is replaced by this explanation, as on the web.
    var composerLockedReason: String?

    init(source: ChatSource, callPeer: Profile? = nil, canModerate: Bool = false,
         composerLockedReason: String? = nil) {
        _model = State(initialValue: ChatViewModel(source: source))
        self.canModerate = canModerate
        self.callPeer = callPeer
        self.composerLockedReason = composerLockedReason
    }

    var body: some View {
        VStack(spacing: 0) {
            messageList
            TypingBubble(
                typers: model.typers,
                profiles: model.typingProfiles,
                groupContext: model.isGroupScope
            )
            .animation(.easeOut(duration: 0.2), value: model.typers.map(\.userId))
            if let error = model.sendError { sendErrorBanner(error) }
            if let composerLockedReason {
                lockedComposer(composerLockedReason)
            } else {
                if let replyingTo { replyBanner(replyingTo) }
                // Progress shows on the message itself, so the composer stays usable.
                MessageComposer(text: $draft, uploading: false, onSend: sendDraft,
                                onGif: { showGifPicker = true },
                                onPhoto: { showPhotoPicker = true })
                                .onChange(of: draft) {
                                    if let name = app.profile?.name, !draft.isEmpty {
                                        model.notifyTyping(displayName: name)
                                    }
                                }
            }
        }
        .background(Brand.surfaceRaised)
        .navigationTitle(model.source.title)
        .navigationBarTitleDisplayMode(.inline)
        .solidNavigationBar()
        .toolbar {
            if case .group(let groupId, let name) = model.source {
                ToolbarItem(placement: .topBarTrailing) {
                    groupCallButton(groupId: groupId, name: name)
                }
            }
            if case .dm = model.source {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        guard let peer = callPeer else { return }
                        Task { await call.startCall(peer: peer) }
                    } label: {
                        Image(systemName: "phone.fill")
                            .foregroundStyle(call.phase == .idle ? Brand.online : Brand.textMuted)
                    }
                    .disabled(call.phase != .idle || callPeer == nil)
                }
            }
        }
        .hidesDock()
        .confirmationDialog(
            "Message actions",
            isPresented: $showTrayMenu,
            titleVisibility: .visible
        ) {
            if let target = trayMenuTarget {
                Button { withAnimation { replyingTo = target } } label: {
                    Label("Reply", systemImage: "arrowshape.turn.up.left")
                }
                Button { Speaker.shared.speak(target.content) } label: {
                    Label("Speak Message", systemImage: "speaker.wave.2.fill")
                }
                Button { UIPasteboard.general.string = target.content } label: {
                    Label("Copy Text", systemImage: "doc.on.doc")
                }
                if target.authorId == app.currentUserId || canModerate {
                    Button(role: .destructive) {
                        Task { await model.deleteMessage(target) }
                    } label: {
                        Label(target.authorId == app.currentUserId ? "Delete" : "Delete Message",
                              systemImage: "trash")
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(trayMenuTarget?.author?.name ?? "This message")
        }
        .task {
            switch model.source {
            case .dm(let threadId, _):
                unreadStore.markActive(threadId: threadId)
                // Persist the read cursor so the state syncs across devices and
                // survives relaunch.
                Task { try? await DatabaseService.markDmRead(threadId: threadId) }
            case .group(let groupId, _):
                unreadStore.markGroupActive(groupId: groupId)
                Task { try? await DatabaseService.markGroupRead(groupId: groupId) }
            default:
                break
            }
            // Silences push banners for this conversation while it is open.
            ActiveChat.shared.open(model.source.notificationSourceId)
            await model.start(currentUserId: app.currentUserId, profile: app.profile)
        }
        .onDisappear {
            switch model.source {
            case .dm:
                unreadStore.clearActive()
            case .group:
                unreadStore.clearGroupActive()
            default:
                break
            }
            ActiveChat.shared.close(model.source.notificationSourceId)
            model.stop()
        }
        .sheet(isPresented: $showGifPicker) { GifPickerView { sendGif($0) } }
        .sheet(item: $openProfile) {
            ProfileDetailView(profile: $0)
                // A glance, not a destination: it opens part-height and is
                // dragged up only if you want the whole profile.
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await uploadAndSend(item) }
        }
    }

    private func lockedComposer(_ reason: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "lock.fill").foregroundStyle(Brand.textMuted)
            Text(reason)
                .font(.subheadline)
                .foregroundStyle(Brand.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Brand.divider, lineWidth: 1))
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .padding(.bottom, 8)
    }

    private func sendErrorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Brand.dnd)
            Text(message).font(.subheadline).foregroundStyle(Brand.textPrimary)
            Spacer(minLength: 0)
            Button { withAnimation { model.sendError = nil } } label: {
                Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(Brand.textMuted)
            }
            .accessibilityLabel("Dismiss")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Brand.dnd.opacity(0.15), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .task(id: message) {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            withAnimation { if model.sendError == message { model.sendError = nil } }
        }
    }

    /// Joins the group's call if one is running, otherwise starts one and
    /// rings everyone — the same behaviour as the web.
    private func groupCallButton(groupId: String, name: String) -> some View {
        let inThisCall = voice.isIn(groupId)
        return Button {
            if inThisCall {
                voice.minimized = false
                return
            }
            let group = directMessages.groups.first { $0.id == groupId }
            Task {
                await voice.startGroupCall(groupId: groupId, name: name,
                                           iconUrl: group?.iconUrl,
                                           memberIds: group?.members?.map(\.id) ?? [])
            }
        } label: {
            Image(systemName: inThisCall ? "phone.connection.fill" : "phone.fill")
                .foregroundStyle(call.phase == .idle ? Brand.online : Brand.textMuted)
        }
        .disabled(call.phase != .idle)
        .accessibilityLabel(inThisCall ? "Return to call" : "Start group call")
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if model.loading && model.messages.isEmpty {
                    StateView(kind: .loading).frame(height: 300)
                } else if let error = model.loadError, model.messages.isEmpty {
                    StateView(kind: .error, title: error).frame(height: 300)
                } else if model.messages.isEmpty {
                    StateView(kind: .empty, title: "No messages yet.\nSay hello! 👋",
                              systemImage: "bubble.left").frame(height: 300)
                } else {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, message in
                            MessageRow(
                                message: message,
                                isOwn: message.authorId == app.currentUserId,
                                grouped: isGrouped(at: index),
                                reactions: model.reactions[message.id] ?? [],
                                replyTo: model.repliedMessage(for: message),
                                currentUserId: app.currentUserId,
                                onTapMention: { openMention($0) },
                                canModerate: canModerate,
                                onTapAuthor: { openProfile = $0 },
                                onReply: { withAnimation { replyingTo = message } },
                                onSpeak: { Speaker.shared.speak(message.content) },
                                onDelete: { Task { await model.deleteMessage(message) } },
                                onToggleReaction: { emoji in
                                    Task { await model.toggleReaction(messageId: message.id, emoji: emoji) }
                                },
                                onHoldReactStarted: { frame in holdReactStarted(frame, message: message) },
                                onHoldReactDrag: { point in holdReactDrag(point) },
                                onHoldReactEnded: { point in holdReactEnded(point) }
                            )
                            .id(message.id)
                        }
                    }
                    .padding(.vertical, 12)
                    .background(
                        GeometryReader { geo in
                            Color.clear.preference(
                                key: ChatContentBottomKey.self,
                                value: geo.frame(in: .named("chatScroll")).maxY
                            )
                        }
                    )
                }
            }
            .coordinateSpace(name: "chatScroll")
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: ChatViewportKey.self, value: geo.size.height)
                }
            )
            .overlay { reactionTray }
            .overlay { flyingReactLayer }
            .onPreferenceChange(ChatContentBottomKey.self) { maxY in
                contentBottom = maxY
                updateStick()
                if stickToBottom, let last = model.messages.last {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
            .onPreferenceChange(ChatViewportKey.self) { height in
                viewportHeight = height
                updateStick()
            }
            .onChange(of: model.messages.count) {
                if stickToBottom, let last = model.messages.last {
                    withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    // MARK: - Hold-to-react tray

    /// The reaction tray: pinned dead-centre above the spot the row was held,
/// always in the same place no matter where the finger wanders afterwards.
/// Only the hovered emoji responds, popping up out of the tray. It floats in
/// the message list's `chatScroll` space — the same space the row's frame and
/// the drag points are reported in — so hit-testing is exact.
    @ViewBuilder private var reactionTray: some View {
        if reactingMessage != nil {
            GeometryReader { geo in
                let width = geo.size.width
                let cellW: CGFloat = 34
                let trayW = CGFloat(quickReactions.count + 1) * cellW
                    + CGFloat(quickReactions.count) * 2 + 12
                // Centred on the held message's horizontal middle, a little
                // above it so the emoji clears the finger.
                let x = min(max(reactTrayAnchor.midX, trayW / 2 + 6), width - trayW / 2 - 6)
                let y = max(reactTrayAnchor.minY - 50, 10)
                if trayPersistent {
                    // Lift without an emoji: the tray stays for a plain tap.
                    // Touches anywhere else dismiss it first.
                    Color.clear.contentShape(Rectangle())
                        .onTapGesture { dismissTray() }
                }
                HStack(spacing: 2) {
                    ForEach(quickReactions, id: \.self) { emoji in
                        trayCell(key: emoji, emoji: emoji, hovered: reactHoverEmoji == emoji)
                    }
                    trayCell(key: trayMoreKey, emoji: "⋯", hovered: reactHoverEmoji == trayMoreKey)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 10)
                .background(Brand.elevated, in: .capsule)
                .shadow(color: .black.opacity(0.35), radius: 12, y: 4)
                .position(x: x, y: y)
                .onPreferenceChange(ChatTrayEmojiKey.self) { frames in
                    reactTrayEmojiFrames = frames
                }
            }
            // While the finger is still down the tray is inert and the drag
            // gesture on the row owns the touch; once persistent it becomes
            // interactive for taps.
            .allowsHitTesting(trayPersistent)
            .transition(.scale(scale: 0.7, anchor: .bottom).combined(with: .opacity))
        }
    }

    /// One reaction (or the "⋯" more-actions button) in the tray, reporting
    /// its `chatScroll` frame up to the tray for hit-testing. During a drag it
    /// is purely visual; once the tray is persistent it is a plain tap target.
    /// The hovered cell "genies" — scales up and lifts clear of the tray so it
    /// reads above the finger with a soft shadow.
    private func trayCell(key: String, emoji: String, hovered: Bool) -> some View {
        let target = reactingMessage
        return Button {
            guard let target else { return }
            if key == trayMoreKey {
                trayMenuTarget = target
                showTrayMenu = true
                dismissTray()
            } else if let frame = reactTrayEmojiFrames[key] {
                flyReaction(emoji: emoji, to: target, from: CGPoint(x: frame.midX, y: frame.midY))
                dismissTray()
            }
        } label: {
            Text(emoji)
                .font(.system(size: 20))
                .frame(width: 34, height: 34)
                .background(hovered ? Brand.accent.opacity(0.3) : Color.clear, in: .circle)
                .scaleEffect(hovered ? 1.6 : 1, anchor: .center)
                .offset(y: hovered ? -18 : 0)
                .shadow(color: .black.opacity(hovered ? 0.35 : 0), radius: 8, y: 6)
                .zIndex(hovered ? 10 : 0)
                .animation(.spring(response: 0.22, dampingFraction: 0.6), value: hovered)
        }
        .buttonStyle(.plain)
        .background(
            GeometryReader { g in
                let base = g.frame(in: .named("chatScroll"))
                // Aim the selection area where the emoji actually renders: a
                // hovered emoji pops up and scales out of the tray, so its hit
                // frame rides up with it instead of staying below the banner.
                let hit = hovered
                    ? base.insetBy(dx: -9, dy: -9).offsetBy(dx: 0, dy: -20)
                    : base.insetBy(dx: -9, dy: -9)
                Color.clear.preference(
                    key: ChatTrayEmojiKey.self,
                    value: [key: hit]
                )
            }
        )
    }

    /// The committed emoji flying from the tray to the message row while the
    /// morph plays; the reaction itself lands when the animation is nearly done.
    @ViewBuilder private var flyingReactLayer: some View {
        if let fly = flyingReact {
            Text(fly.emoji)
                .font(.system(size: 30))
                .position(flyPosition)
                .allowsHitTesting(false)
                .onAppear {
                    flyPosition = fly.from
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.7)) {
                        flyPosition = fly.to
                    }
                    Task {
                        try? await Task.sleep(for: .seconds(0.38))
                        withAnimation { flyingReact = nil }
                    }
                }
        }
    }

    /// The hold completed: anchor the tray above the row and show it.
    private func holdReactStarted(_ frame: CGRect, message: DisplayMessage) {
        reactTrayAnchor = frame
        reactTrayEmojiFrames = [:]
        reactHoverEmoji = nil
        trayPersistent = false
        withAnimation(.easeOut(duration: 0.12)) { reactingMessage = message }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    /// The finger moved: highlight the cell under it, ticking haptics
    /// whenever the hovered emoji changes. Cells report generously-sized
    /// (and, when hovered, popped-up) frames, so a small grace inset suffices.
    private func holdReactDrag(_ point: CGPoint) {
        let hit = reactTrayEmojiFrames
            .first { $0.value.insetBy(dx: -4, dy: -4).contains(point) }?
            .key
        if hit != reactHoverEmoji {
            reactHoverEmoji = hit
            if hit != nil { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        }
    }

    /// The finger lifted: commit the hovered reaction (morph + toggle) or the
    /// ⋯ menu; anything else leaves the tray up for a plain tap instead of
    /// fading it away.
    private func holdReactEnded(_ point: CGPoint?) {
        let target = reactingMessage
        guard let target, let point else {
            holdReactPersisted()
            return
        }

        if let frame = reactTrayEmojiFrames[trayMoreKey],
           frame.insetBy(dx: -4, dy: -4).contains(point) {
            trayMenuTarget = target
            showTrayMenu = true
            dismissTray()
            return
        }
        guard let (emoji, frame) = reactTrayEmojiFrames.first(where: {
            $0.key != trayMoreKey && $0.value.insetBy(dx: -4, dy: -4).contains(point)
        }) else {
            holdReactPersisted()
            return
        }

        flyReaction(emoji: emoji, to: target, from: CGPoint(x: frame.midX, y: frame.midY))
        dismissTray()
    }

    /// The finger lifted somewhere that wasn't an emoji: keep the tray visible
    /// so it can be tapped. The row's drag session is over, so the tray takes
    /// over hit-testing for plain taps.
    private func holdReactPersisted() {
        guard trayPersistent == false else { return }
        trayPersistent = true
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    private func dismissTray() {
        withAnimation(.easeOut(duration: 0.15)) {
            reactingMessage = nil
            reactHoverEmoji = nil
            trayPersistent = false
        }
    }

    /// Plays the flying-emoji morph from the tray cell to the row, then lands
    /// the reaction with a commit tick.
    private func flyReaction(emoji: String, to message: DisplayMessage, from: CGPoint) {
        let to = CGPoint(x: reactTrayAnchor.midX, y: reactTrayAnchor.midY)
        flyingReact = FlyingReact(emoji: emoji, from: from, to: to)
        flyPosition = from
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let messageID = message.id
        Task {
            try? await Task.sleep(for: .seconds(0.32))
            await model.toggleReaction(messageId: messageID, emoji: emoji)
        }
    }

    private func replyBanner(_ message: DisplayMessage) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "arrowshape.turn.up.left.fill").foregroundStyle(Brand.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text("Replying to \(message.author?.name ?? "Unknown")")
                    .font(.caption.weight(.semibold)).foregroundStyle(Brand.textSecondary)
                Text(message.content.isEmpty ? "attachment" : message.content)
                    .font(.caption2).foregroundStyle(Brand.textMuted).lineLimit(1)
            }
            Spacer()
            Button { withAnimation { replyingTo = nil } } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.textMuted)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Brand.surface)
    }

    /// Resolve a tapped @mention to a profile and show it.
    ///
    /// Anything shaped like a mention is tappable, so a name that belongs to
    /// nobody simply does nothing rather than opening an empty card. The
    /// author of a message already on screen is used when it matches, which
    /// covers the common case without a request.
    private func openMention(_ username: String) {
        guard mentionLookup == nil else { return }
        let wanted = username.lowercased()

        if let known = model.messages.compactMap({ $0.author })
            .first(where: { ($0.username ?? "").lowercased() == wanted }) {
            openProfile = known
            return
        }

        mentionLookup = username
        Task {
            defer { mentionLookup = nil }
            if let found = try? await DatabaseService.profile(username: username) {
                openProfile = found
            }
        }
    }

    private func isGrouped(at index: Int) -> Bool {
        guard index > 0 else { return false }
        let prev = model.messages[index - 1]
        let cur = model.messages[index]
        guard prev.authorId == cur.authorId, cur.replyToId == nil else { return false }
        guard let a = RelativeTime.date(from: prev.createdAt),
              let b = RelativeTime.date(from: cur.createdAt) else { return false }
        return b.timeIntervalSince(a) < 300
    }

    private func sendDraft() {
        let content = draft
        let reply = replyingTo?.id
        draft = ""
        withAnimation { replyingTo = nil }
        guard let uid = app.currentUserId else { return }
        Task { await model.send(content: content, authorId: uid, replyToId: reply) }
    }

    private func sendGif(_ gif: GiphyGif) {
        guard let uid = app.currentUserId, let url = gif.fullUrl else { return }
        let reply = replyingTo?.id
        withAnimation { replyingTo = nil }
        Task { await model.sendAttachment(OutgoingAttachment(url: url, type: "gif", key: nil),
                                          replyToId: reply, authorId: uid) }
    }

    private func uploadAndSend(_ item: PhotosPickerItem) async {
        guard let uid = app.currentUserId else { return }
        let reply = replyingTo?.id
        defer { photoItem = nil }
        withAnimation { replyingTo = nil }

        // Videos travel as files, never as one big `Data`: see `PickedMovie`.
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            guard let movie = try? await item.loadTransferable(type: PickedMovie.self) else {
                model.loadError = "Couldn't open that video."
                return
            }
            await model.uploadAndSendVideo(source: movie.url, replyToId: reply, authorId: uid)
            return
        }

        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        // The progress row lives in the conversation, so the composer stays
        // usable while it uploads.
        await model.uploadAndSendAttachment(
            data: data,
            filename: "image.jpg",
            mimeType: "image/jpeg",
            type: .image,
            replyToId: reply,
            authorId: uid,
        )
    }
}
