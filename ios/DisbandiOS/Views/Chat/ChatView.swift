import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Shared conversation screen used for channels, DMs, and group chats.
struct ChatContentBottomKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// Position of the history sentinel, in scroll-view coordinates. Negative
/// means it is above the visible area; close to zero means the reader has
/// reached the top and the next page should be requested.
struct ChatContentTopKey: PreferenceKey {
    static var defaultValue: CGFloat = -.greatestFiniteMagnitude
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
    @Environment(PresenceService.self) private var presence
    @State private var model: ChatViewModel
    /// The channel's space and how many of its members are online, for the
    /// line under the title. Nil until known.
    @State private var channelServerId: String?
    @State private var onlineCount: Int?
    @State private var draft = ""
    @State private var stickToBottom = true
    /// The first page has painted and the initial scroll-to-bottom has had a
    /// chance to land. Until then the lazy stack can report the history
    /// sentinel at the top of the viewport, which must not trigger paging.
    @State private var initialScrollSettled = false
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
                                onPhoto: { showPhotoPicker = true },
                                placeholder: composerPlaceholder)
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
            ToolbarItem(placement: .principal) { headerTitle }
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
                // Opening the chat always brings its row back, even if the
                // user closed it from the list earlier.
                directMessages.unhideThread(threadId)
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
        // Re-counted whenever someone comes online or drops off.
        .task(id: presence.statuses.count) { await refreshOnlineCount() }
        .onChange(of: model.loading) { _, loading in
            guard !loading, !initialScrollSettled else { return }
            // Let `.defaultScrollAnchor(.bottom)` and the first layout pass
            // finish before the top sentinel is allowed to page history.
            Task {
                try? await Task.sleep(for: .milliseconds(250))
                initialScrollSettled = true
            }
        }
    }

    // MARK: - Header

    private var composerPlaceholder: String {
        switch model.source {
        case .channel(_, let name): return "Message #\(name)"
        case .dm(_, let title): return "Message @\(title)"
        case .group(_, let name): return "Message \(name)"
        }
    }

    /// Title and a status line, centred the way iOS conversation screens are:
    /// "#general / ● 16 Online", "Riley / Online", "Weekend plans / 4 members".
    private var headerTitle: some View {
        Button {
            if case .dm = model.source, let peer = callPeer { openProfile = peer }
        } label: {
            VStack(spacing: 1) {
                HStack(spacing: 4) {
                    Text(model.source.title)
                        .font(.headline)
                        .foregroundStyle(Brand.textPrimary)
                        .lineLimit(1)
                    if case .dm = model.source, callPeer != nil {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(Brand.textMuted)
                    }
                }
                if let subtitle = headerSubtitle {
                    HStack(spacing: 4) {
                        if let dot = subtitle.dot {
                            Circle().fill(dot).frame(width: 7, height: 7)
                        }
                        Text(subtitle.text)
                            .font(.caption)
                            .foregroundStyle(Brand.textMuted)
                            .contentTransition(.numericText())
                    }
                    .transition(.opacity)
                }
            }
            .animation(.snappy, value: onlineCount)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private var headerSubtitle: (text: String, dot: Color?)? {
        switch model.source {
        case .channel:
            guard let onlineCount else { return nil }
            return ("\(onlineCount) Online", Brand.online)
        case .dm:
            guard let peer = callPeer else { return nil }
            let status = presence.status(for: peer.id)
            let color: Color = switch status {
            case .online: Brand.online
            case .idle: Brand.idle
            case .dnd: Brand.dnd
            case .offline: Brand.textMuted
            }
            return (status == .offline ? "Offline" : status.label, color)
        case .group(let id, _):
            guard let count = directMessages.groups.first(where: { $0.id == id })?.members?.count else { return nil }
            return ("\(count) member\(count == 1 ? "" : "s")", nil)
        }
    }

    private func refreshOnlineCount() async {
        guard case .channel(let id, _) = model.source else { return }
        if channelServerId == nil { channelServerId = await ServerOnlineCount.serverId(forChannel: id) }
        guard let serverId = channelServerId else { return }
        let online = presence.statuses.filter { $0.value != .offline }.map(\.key)
        onlineCount = await ServerOnlineCount.count(serverId: serverId, online: online)
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
        // Reply lookup used to be a linear scan per row. With history now
        // growing past one page, build a single index for the whole list.
        let messagesById = Dictionary(model.messages.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        return GeometryReader { viewport in
            ScrollViewReader { proxy in
                ScrollView {
                    if model.loading && model.messages.isEmpty {
                        StateView(kind: .loading)
                            .frame(maxWidth: .infinity, minHeight: viewport.size.height)
                    } else if let error = model.loadError, model.messages.isEmpty {
                        StateView(kind: .error, title: error, retry: { await model.load() })
                            .frame(maxWidth: .infinity, minHeight: viewport.size.height)
                    } else if model.messages.isEmpty {
                        StateView(kind: .empty, title: "No messages yet.\nSay hello! 👋",
                                  systemImage: "bubble.left")
                            .frame(maxWidth: .infinity, minHeight: viewport.size.height)
                    } else {
                        LazyVStack(alignment: .leading, spacing: 2) {
                            if model.hasMoreHistory {
                                olderHistoryLoader
                            }

                            ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, message in
                                if startsNewDay(at: index) {
                                    ChatDayDivider(timestamp: message.createdAt)
                                }

                                MessageRow(
                                    message: message,
                                    isOwn: message.authorId == app.currentUserId,
                                    grouped: isGrouped(at: index),
                                    reactions: model.reactions[message.id] ?? [],
                                    replyTo: message.replyToId.flatMap { messagesById[$0] },
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
                        .padding(.top, 8)
                        .padding(.bottom, 12)
                        // A short conversation belongs against the composer,
                        // not floating at the top of an otherwise empty
                        // screen. Filling the viewport and aligning the stack
                        // to its bottom makes the newest message the anchor
                        // even before there is enough history to scroll.
                        .frame(maxWidth: .infinity, minHeight: viewport.size.height, alignment: .bottom)
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
                .defaultScrollAnchor(.bottom)
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .overlay(alignment: .bottomTrailing) {
                    if !stickToBottom, let last = model.messages.last {
                        Button {
                            stickToBottom = true
                            withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(Brand.textPrimary)
                                .frame(width: 38, height: 38)
                                .background(.ultraThinMaterial, in: Circle())
                                .overlay(Circle().strokeBorder(Brand.divider, lineWidth: 1))
                                .shadow(color: .black.opacity(0.28), radius: 10, y: 4)
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 16)
                        .padding(.bottom, 10)
                        .transition(.scale(scale: 0.8).combined(with: .opacity))
                        .accessibilityLabel("Jump to latest messages")
                    }
                }
                .overlay { reactionTray }
                .overlay { flyingReactLayer }
                .onPreferenceChange(ChatContentBottomKey.self) { maxY in
                    let nearBottom = maxY - viewport.size.height < 48
                    // Before the first page has settled the lazy stack can
                    // measure the content at y=0 even though the default
                    // anchor is about to scroll to the newest message. Keep
                    // the "follow the bottom" state on until that happens;
                    // otherwise the top sentinel sees `!stickToBottom` and
                    // starts paging history on open.
                    if initialScrollSettled {
                        if stickToBottom != nearBottom { stickToBottom = nearBottom }
                    } else if nearBottom {
                        stickToBottom = true
                    }
                    if stickToBottom, let last = model.messages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
                .onPreferenceChange(ChatContentTopKey.self) { minY in
                    // The sentinel is measured even when the lazy stack has
                    // only prefetched it far above the viewport. Do not pull
                    // a page there; wait until the reader is actually near
                    // the top (or the conversation is shorter than one
                    // screen, where filling the view is the right move).
                    //
                    // Also require that the reader has scrolled away from the
                    // bottom. On a large channel the first layout pass can
                    // report the sentinel at y=0 before the initial
                    // scroll-to-bottom lands; without this gate a busy
                    // #general would pull page after page of history and
                    // appear to load forever.
                    guard initialScrollSettled, !stickToBottom, minY > -140,
                          model.hasMoreHistory, !model.loadingOlder else { return }
                    Task { await loadOlder(using: proxy) }
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
    }

    /// The first-screen sentinel. It sits above the oldest row and requests
    /// the page before it as soon as the reader reaches the top.
    private var olderHistoryLoader: some View {
        HStack(spacing: 8) {
            if model.loadingOlder {
                ProgressView()
                    .controlSize(.small)
                    .tint(Brand.textMuted)
                Text("Loading earlier messages")
                    .font(.caption)
                    .foregroundStyle(Brand.textMuted)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 34)
        .background(
            GeometryReader { geo in
                Color.clear.preference(
                    key: ChatContentTopKey.self,
                    value: geo.frame(in: .named("chatScroll")).minY
                )
            }
        )
        .accessibilityHidden(true)
    }

    /// Keep the reader's place when a page is inserted above them.
    ///
    /// Prepending rows changes the content height, and a plain SwiftUI
    /// ScrollView holds the absolute offset — so the sentence being read
    /// would be shoved down by a full page. Pin the previous first row to the
    /// top after the new rows have laid out instead.
    private func loadOlder(using proxy: ScrollViewProxy) async {
        guard !model.loadingOlder, model.hasMoreHistory,
              let anchor = model.messages.first?.id else { return }
        let inserted = await model.loadOlder()
        guard inserted else { return }
        // The state change above is synchronous on the main actor; give the
        // lazy stack one layout pass to insert the new rows before scrolling.
        await Task.yield()
        try? await Task.sleep(for: .milliseconds(30))
        withAnimation(nil) { proxy.scrollTo(anchor, anchor: .top) }
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

    private func startsNewDay(at index: Int) -> Bool {
        guard index > 0 else { return true }
        guard let previous = RelativeTime.date(from: model.messages[index - 1].createdAt),
              let current = RelativeTime.date(from: model.messages[index].createdAt) else {
            return false
        }
        return !Calendar.current.isDate(previous, inSameDayAs: current)
    }

    private func isGrouped(at index: Int) -> Bool {
        guard index > 0, !startsNewDay(at: index) else { return false }
        let prev = model.messages[index - 1]
        let cur = model.messages[index]
        guard prev.authorId == cur.authorId, cur.replyToId == nil else { return false }
        // One webhook can post as several names; each name is its own speaker.
        guard prev.webhook?.name == cur.webhook?.name,
              prev.webhook?.avatarUrl == cur.webhook?.avatarUrl else { return false }
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
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
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

/// A quiet date break between days of conversation. Discord-style rows are
/// flat on purpose, but without a day marker a long thread reads as one
/// undifferentiated wall — and the native apps the rest of iOS trains people
/// on always tell them when "today" starts.
private struct ChatDayDivider: View {
    let timestamp: String

    private var label: String {
        guard let date = RelativeTime.date(from: timestamp) else { return "Earlier" }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
    }

    var body: some View {
        HStack(spacing: 10) {
            Rectangle()
                .fill(Brand.divider)
                .frame(height: 0.5)
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Brand.textMuted)
                .fixedSize()
            Rectangle()
                .fill(Brand.divider)
                .frame(height: 0.5)
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Messages from \(label)")
    }
}
