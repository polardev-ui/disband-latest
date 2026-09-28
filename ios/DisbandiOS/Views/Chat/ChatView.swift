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
    @State private var photoItems: [PhotosPickerItem] = []
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
    @State private var showTrayMenu = false
    @State private var trayMenuTarget: DisplayMessage?
    /// The emoji flying from the tray to the message, while the morph plays.
    @State private var flyingReact: FlyingReact?
    @State private var flyPosition: CGPoint = .zero
    /// Height of the software keyboard, so the message list can keep the
    /// newest message above the composer when it opens.
    @State private var keyboardHeight: CGFloat = 0

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
                // Floating, not stacked: the pill must not take layout height
                // or the composer and the last message jump every time
                // somebody starts and stops typing.
                .overlay(alignment: .bottomLeading) {
                    TypingBubble(
                        typers: model.typers,
                        profiles: model.typingProfiles,
                        groupContext: model.isGroupScope
                    )
                    .animation(.spring(response: 0.32, dampingFraction: 0.82),
                               value: model.typers.map(\.userId))
                }
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
        .onReceive(
            NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
        ) { note in
            let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
            keyboardHeight = frame?.height ?? 0
        }
        .onReceive(
            NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
        ) { _ in
            keyboardHeight = 0
        }
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
        // Up to ten, matching the database constraint and the web composer.
        // A video still travels alone: it needs converting and streaming from
        // disk, which does not belong in a batch of photos.
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItems,
                      maxSelectionCount: maxAttachments,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task { await uploadAndSend(items) }
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
                    StateView(kind: .error, title: error, retry: { await model.load() })
                        .frame(height: 300)
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
                                onHoldReactStarted: { frame in holdReactStarted(frame, message: message) }
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
            /*
             Follow the keyboard.

             Opening the keyboard shrinks this list — the composer rides up on
             the keyboard's safe area and takes the bottom of the screen with
             it — but the scroll offset stays where it was, so the newest
             messages slide up behind the composer and you type blind. Every
             other chat app keeps the last message sitting just above the bar,
             and that is all this does: when the keyboard's height changes,
             re-pin to the bottom.

             Only when already at the bottom. Someone who has scrolled up to
             read something older and then taps the composer to reply to it
             should not be yanked back down, losing the thing they were
             replying to.
             */
            .onChange(of: keyboardHeight) { _, height in
                guard height > 0, stickToBottom, let last = model.messages.last else { return }
                // After the keyboard's own animation has laid things out;
                // scrolling into a frame that is still moving lands short.
                withAnimation(.easeOut(duration: 0.25)) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }

    // MARK: - Hold-to-react tray

    /*
     The tray's geometry is arithmetic, not measurement.

     It used to report each cell's frame up through a SwiftUI preference and
     hit-test the finger against whatever arrived. On the first layout pass
     those frames are measured BEFORE `.position()` moves the tray, so for one
     frame every cell claimed to be sitting in the middle of the scroll view —
     which is exactly where the finger that just completed the hold already
     is. A release in that window committed whichever emoji happened to land
     under the touch, and that is the reaction that appeared "automatically"
     while scrolling. Instrumented on device, the very first drag sample
     reported `hit=😂` for a finger 104pt below the tray.

     Computing both the drawn position and the hit frames from the same
     numbers removes the window entirely: there is no first-frame state to be
     wrong, and the two can never drift apart.
     */
    private static let trayCellW: CGFloat = 34
    private static let trayGap: CGFloat = 2
    private static let trayPadH: CGFloat = 6
    /// How far above the held row the tray floats, so emoji clear the finger.
    private static let trayRise: CGFloat = 50

    private var trayKeys: [String] { quickReactions + [trayMoreKey] }

    private var trayWidth: CGFloat {
        CGFloat(trayKeys.count) * Self.trayCellW
            + CGFloat(trayKeys.count - 1) * Self.trayGap
            + Self.trayPadH * 2
    }

    /// Centre of the tray in `chatScroll` space, clamped to stay on screen.
    ///
    /// The anchor is the held row's frame, and rows are full-bleed, so its
    /// width is the viewport width — the value the clamp needs.
    private func trayCentre(for anchor: CGRect) -> CGPoint {
        let viewport = anchor.width > 0 ? anchor.width : UIScreen.main.bounds.width
        return CGPoint(
            x: min(max(anchor.midX, trayWidth / 2 + 6), viewport - trayWidth / 2 - 6),
            y: max(anchor.minY - Self.trayRise, 10)
        )
    }

    /**
     The reaction tray: a row of emoji pinned above the message that was held.

     Tappable, and sitting on a backdrop that covers the list. Both matter.
     The tray is raised by a press that has already ended, so there is no
     finger left holding it — it has to be able to take a tap of its own, and
     there has to be somewhere to tap to get rid of it.

     The backdrop also swallows drags. The tray is anchored to where the row
     was when the hold completed, so a list scrolling underneath would slide
     the message away from its own tray. Absorbing the pan here holds the list
     still WITHOUT a `scrollDisabled` flag — which is what broke scrolling
     outright, because the flag outlived a gesture that did not always report
     its own end. A backdrop cannot get stuck: it exists exactly as long as
     the tray does, and tapping it dismisses both.
     */
    @ViewBuilder private var reactionTray: some View {
        if let target = reactingMessage {
            ZStack(alignment: .topLeading) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { dismissTray() }
                    .gesture(DragGesture(minimumDistance: 0))

                HStack(spacing: Self.trayGap) {
                    ForEach(quickReactions, id: \.self) { emoji in
                        trayCell(emoji: emoji) {
                            flyReaction(emoji: emoji, to: target,
                                        from: trayCentre(for: reactTrayAnchor))
                            dismissTray()
                        }
                    }
                    trayCell(emoji: "⋯") {
                        trayMenuTarget = target
                        showTrayMenu = true
                        dismissTray()
                    }
                }
                .padding(.horizontal, Self.trayPadH)
                .padding(.vertical, 10)
                .background(Brand.elevated, in: .capsule)
                .shadow(color: .black.opacity(0.35), radius: 12, y: 4)
                .position(
                    x: trayCentre(for: reactTrayAnchor).x,
                    y: trayCentre(for: reactTrayAnchor).y
                )
            }
            .transition(.opacity)
        }
    }

    /// One reaction, or the "⋯" cell. A plain button: the tray is tapped, not
    /// dragged across, so there is no hover state to track.
    private func trayCell(emoji: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(emoji)
                .font(.system(size: 20))
                .frame(width: Self.trayCellW, height: Self.trayCellW)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
        withAnimation(.easeOut(duration: 0.12)) { reactingMessage = message }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    private func dismissTray() {
        withAnimation(.easeOut(duration: 0.15)) {
            reactingMessage = nil
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

    private func uploadAndSend(_ items: [PhotosPickerItem]) async {
        guard let uid = app.currentUserId else { return }
        let reply = replyingTo?.id
        defer { photoItems = [] }
        withAnimation { replyingTo = nil }

        // Videos travel as files, never as one big `Data`: see `PickedMovie`.
        // Each is its own message — a video and a photo grid are different
        // things to look at, and the mosaic has no cell shape that keeps a
        // play control.
        let videos = items.filter { item in
            item.supportedContentTypes.contains { $0.conforms(to: .movie) }
        }
        for video in videos {
            guard let movie = try? await video.loadTransferable(type: PickedMovie.self) else {
                model.loadError = "Couldn't open that video."
                continue
            }
            await model.uploadAndSendVideo(source: movie.url, replyToId: reply, authorId: uid)
        }

        let photos = items.filter { !videos.contains($0) }
        guard !photos.isEmpty else { return }

        var payloads: [(data: Data, filename: String, mimeType: String, type: AttachmentType)] = []
        for (index, photo) in photos.enumerated() {
            guard let data = try? await photo.loadTransferable(type: Data.self) else { continue }
            // Numbered so a set does not arrive as ten files all called
            // "image.jpg", which is what the file card would show.
            payloads.append((data, photos.count == 1 ? "image.jpg" : "image-\(index + 1).jpg",
                             "image/jpeg", .image))
        }
        guard !payloads.isEmpty else { return }

        // The progress row lives in the conversation, so the composer stays
        // usable while it uploads.
        await model.uploadAndSendAttachments(
            items: payloads, replyToId: reply, authorId: uid)
    }
}
