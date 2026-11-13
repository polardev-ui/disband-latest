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
    /// The bots' slash commands in this space, loaded when "/" is typed.
    @State private var botCommands: [BotCommand] = []
    @State private var runningCommand: BotCommand?
    @State private var onlineCount: Int?
    @State private var draft = ""
    @State private var stickToBottom = true
    /// When the reader last had a finger on the list. Only their own
    /// scrolling may stop "follow the bottom": a picture or embed growing
    /// the content also moves the bottom away, and that used to switch
    /// following off, so the chat stopped short of the newest message.
    @State private var lastUserScroll = Date.distantPast
    /// A finger is on the list, or it is still coasting from a flick. Comes
    /// from the scroll view itself (iOS 18+), so it is right however the
    /// touch got there; the drag gesture below is the fallback before that.
    @State private var userIsScrolling = false
    /// The first page has painted and the initial scroll-to-bottom has had a
    /// chance to land. Until then the lazy stack can report the history
    /// sentinel at the top of the viewport, which must not trigger paging.
    @State private var initialScrollSettled = false
    @State private var showGifPicker = false
    @State private var showPollSheet = false
    @State private var showGiftPicker = false
    @State private var showPhotoPicker = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var openProfile: Profile?
    /// Set while a tapped mention is being looked up, so the sheet can show
    /// something immediately rather than after a round trip.
    @State private var mentionLookup: String?
    @State private var reactingMessage: DisplayMessage?
    @State private var replyingTo: DisplayMessage?
    /// My message being edited: the composer holds its text until saved.
    @State private var editingMessage: DisplayMessage?
    /// What was in the composer before editing began, given back afterwards.
    @State private var draftBeforeEdit = ""
    /// Photos and videos picked for the next message, as on desktop: they
    /// wait above the composer (up to ten) until you send.
    @State private var staged: [StagedAttachment] = []
    /// Who an "@" being typed could mean.
    @State private var mentions: MentionSearch
    /// The last text sent and when, to catch the keyboard re-inserting it.
    @State private var lastSent: (text: String, at: Date) = ("", .distantPast)

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
    /// Unread messages waiting when the chat was opened (DMs and groups).
    @State private var unreadAtOpen = 0
    /// The first of those: the "NEW" line is drawn above it.
    @State private var unreadAnchorId: String?
    /// Messages that arrived while the reader was scrolled up.
    @State private var missedCount = 0
    /// A message lit for a moment after jumping to it from a reply.
    @State private var highlightedId: String?

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
        _mentions = State(initialValue: MentionSearch(source: source))
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
                .overlay(alignment: .bottomTrailing) {
                    TypingBubble(
                        typers: model.typers,
                        profiles: model.typingProfiles,
                        groupContext: model.isGroupScope
                    )
                    .animation(.spring(response: 0.32, dampingFraction: 0.82),
                               value: model.typers.map(\.userId))
                }
            if let error = model.sendError { sendErrorBanner(error) }
            if case .dm(let threadId, _) = model.source {
                MessageRequestBar(threadId: threadId, peer: callPeer)
            }
            if let composerLockedReason {
                lockedComposer(composerLockedReason)
            } else {
                if let editingMessage { editBanner(editingMessage) }
                else if let replyingTo { replyBanner(replyingTo) }
                if case .channel = model.source,
                   let matches = BotCommandSuggestionList.matching(draft, in: botCommands) {
                    BotCommandSuggestionList(commands: matches) { cmd in
                        draft = ""
                        runningCommand = cmd
                    }
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
                                if mentionQuery != nil, !mentions.results.isEmpty {
                    MentionSuggestionList(results: mentions.results) { pick in
                        draft = MentionSearch.applying(pick, to: draft)
                        mentions.clear()
                    }
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
                if !staged.isEmpty { stagedStrip }
                // Progress shows on the message itself, so the composer stays usable.
                MessageComposer(text: $draft, uploading: false, onSend: sendDraft,
                                onGif: { showGifPicker = true },
                                onPhoto: { if staged.count < maxAttachments { showPhotoPicker = true } },
                                onPoll: editingMessage == nil ? { showPollSheet = true } : nil,
                                onGift: editingMessage == nil ? { showGiftPicker = true } : nil,
                                placeholder: composerPlaceholder,
                                hasAttachments: !staged.isEmpty,
                                onPasteImages: editingMessage == nil ? { stagePasted($0) } : nil)
                                // With the keyboard closed, sit down into the
                                // home-indicator strip as Discord and Messages
                                // do. Above the full 34pt safe area plus its
                                // own padding, the box floated over a band of
                                // empty space. With the keyboard up it keeps
                                // its normal gap above the keys.
                                .padding(.bottom, keyboardHeight > 0 ? 0 : -6)
                                .animation(.easeOut(duration: 0.25), value: keyboardHeight > 0)
                                .onChange(of: draft) {
                                    if let name = app.profile?.name, !draft.isEmpty, !draft.hasPrefix("/") {
                                        model.notifyTyping(displayName: name)
                                    }
                                    if draft.hasPrefix("/") { Task { await loadBotCommands() } }
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
        .sheet(item: $runningCommand) { cmd in
            if case .channel(let id, _) = model.source, let serverId = channelServerId {
                BotCommandSheet(command: cmd, channelId: id, serverId: serverId) {}
                    .presentationDetents([.medium, .large])
            }
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
                if target.authorId == app.currentUserId, !target.pending, target.webhook == nil {
                    Button { startEditing(target) } label: {
                        Label("Edit Message", systemImage: "pencil")
                    }
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
                unreadAtOpen = unreadStore.count(for: threadId)
                unreadStore.markActive(threadId: threadId)
                // Opening the chat always brings its row back, even if the
                // user closed it from the list earlier.
                directMessages.unhideThread(threadId)
                // Persist the read cursor so the state syncs across devices and
                // survives relaunch.
                Task { try? await DatabaseService.markDmRead(threadId: threadId) }
            case .group(let groupId, _):
                unreadAtOpen = unreadStore.countGroup(for: groupId)
                unreadStore.markGroupActive(groupId: groupId)
                Task { try? await DatabaseService.markGroupRead(groupId: groupId) }
            case .channel(let channelId, _):
                // Clears the channel's dot here and, through channel_reads,
                // on every other device.
                ChannelUnreadStore.shared.open(channelId: channelId)
            }
            // Silences push banners for this conversation while it is open.
            ActiveChat.shared.open(model.source.notificationSourceId)
            await model.start(currentUserId: app.currentUserId, profile: app.profile)
            placeUnreadLine()
        }
        .onDisappear {
            switch model.source {
            case .dm:
                unreadStore.clearActive()
            case .group:
                unreadStore.clearGroupActive()
            case .channel(let channelId, _):
                ChannelUnreadStore.shared.close(channelId: channelId)
            }
            ActiveChat.shared.close(model.source.notificationSourceId)
            model.stop()
        }
        .sheet(isPresented: $showGifPicker) { GifPickerView { sendGif($0) } }
        .sheet(isPresented: $showGiftPicker) {
            GiftPickerSheet { link in
                let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                draft = trimmed.isEmpty ? link : "\(trimmed) \(link)"
            }
        }
        .sheet(isPresented: $showPollSheet) { PollCreateSheet { sendPoll($0) } }
        .sheet(item: $openProfile) {
            // Re-inject the services at the sheet's root: SwiftUI on Mac
            // (Designed for iPad) does not carry the presenter's environment
            // into a sheet (FB16112395), and the chat opened by "Message"
            // needs all of these. The profile itself takes its viewer values
            // directly for the same reason.
            ProfileDetailView(profile: $0, viewerId: app.currentUserId, presence: presence,
                              onCall: call.phase == .idle ? { peer in Task { await call.startCall(peer: peer) } } : nil)
                .environment(app)
                .environment(call)
                .environment(unreadStore)
                .environment(voice)
                .environment(directMessages)
                .environment(presence)
                // A glance, not a destination: it opens part-height and is
                // dragged up only if you want the whole profile.
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        // Up to ten, matching the database constraint and the web composer.
        // A video still travels alone: it needs converting and streaming from
        // disk, which does not belong in a batch of photos.
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItems,
                      maxSelectionCount: max(1, maxAttachments - staged.count),
                      matching: .any(of: [.images, .videos]))
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task { await stage(items) }
        }
        .task(id: mentionQuery) {
            guard let query = mentionQuery else { mentions.clear(); return }
            await mentions.search(query, local: mentionLocals)
        }
        // Re-counted whenever the set of visible people changes.
        .task(id: onlinePresenceKey) { await refreshOnlineCount() }
        // The space's roles, so role pings show in their colour.
        .task(id: model.source) {
            guard case .channel(let id, _) = model.source else { return }
            if channelServerId == nil { channelServerId = await ServerOnlineCount.serverId(forChannel: id) }
            guard let serverId = channelServerId,
                  let roles = try? await ServerAdmin.roles(serverId: serverId) else { return }
            ChatMarkdown.setRoles(roles.map { (name: $0.name, color: $0.color) })
        }
        // Runs on appear as well as when loading changes. A conversation
        // painted from the cache never shows a loading state, so watching
        // only for the change left it unsettled for good: "follow the
        // bottom" could never switch off, and every new message dragged a
        // reader who had scrolled up back down to it.
        .task(id: model.loading) {
            guard !model.loading, !initialScrollSettled else { return }
            // Let `.defaultScrollAnchor(.bottom)` and the first layout pass
            // finish before the top sentinel is allowed to page history.
            try? await Task.sleep(for: .milliseconds(250))
            initialScrollSettled = true
        }
    }

    private static let bottomId = "chat-bottom-anchor"

    // MARK: - Mentions

    private var mentionQuery: String? { MentionSearch.query(in: draft) }

    /// Who can be mentioned outside a space: the DM's other person, the
    /// group's members, and anyone who has spoken here.
    private var mentionLocals: [Profile] {
        var people: [Profile] = []
        if let callPeer { people.append(callPeer) }
        if case .group(let id, _) = model.source,
           let members = directMessages.groups.first(where: { $0.id == id })?.members {
            people += members
        }
        people += model.messages.compactMap(\.author)
        var seen = Set<String>()
        return people.filter { $0.id != app.currentUserId && seen.insert($0.id).inserted }
    }

    // MARK: - Header

    private var composerPlaceholder: String {
        switch model.source {
        case .channel(_, let name): return "Message #\(name)"
        case .dm(_, let title): return "Message @\(title)"
        case .group(_, let name): return "Message \(name)"
        }
    }

    /// Who or where this is, at a glance: the person's avatar with their
    /// live status (a DM), the group's picture, or the channel's #, then the
    /// name and a status line: "● 16 Online", "Online", "4 members".
    private var headerTitle: some View {
        Button {
            if case .dm = model.source, let peer = callPeer {
                Haptics.tap()
                openProfile = peer
            }
        } label: {
            HStack(spacing: 9) {
                headerIcon
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text(headerName)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Brand.textPrimary)
                            .lineLimit(1)
                        if case .dm = model.source, callPeer != nil {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(Brand.textMuted)
                        }
                    }
                    if let subtitle = headerSubtitle {
                        HStack(spacing: 4) {
                            if let dot = subtitle.dot, !isDm {
                                Circle().fill(dot).frame(width: 6, height: 6)
                            }
                            Text(subtitle.text)
                                .font(.system(size: 12))
                                .foregroundStyle(Brand.textMuted)
                                .contentTransition(.numericText())
                        }
                        .transition(.opacity)
                    }
                }
            }
            .animation(.snappy, value: onlineCount)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private var isDm: Bool {
        if case .dm = model.source { return true }
        return false
    }

    /// The channel's name without its "#": the glyph is drawn beside it.
    private var headerName: String {
        if case .channel(_, let name) = model.source { return name }
        return model.source.title
    }

    @ViewBuilder private var headerIcon: some View {
        switch model.source {
        case .dm:
            if let peer = callPeer {
                AvatarView(url: peer.avatarUrl, name: peer.name, size: 32,
                           status: presence.status(for: peer.id))
            }
        case .group(let id, let name):
            AvatarView(url: directMessages.groups.first { $0.id == id }?.iconUrl, name: name, size: 32)
        case .channel:
            Image(systemName: "number")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Brand.textSecondary)
                .frame(width: 30, height: 30)
                .background(Brand.elevated, in: Circle())
        }
    }

    // MARK: - Start of the conversation

    /// The top of the history, once there is nothing older to load: who you
    /// are talking to, or which channel this is.
    private var conversationStart: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch model.source {
            case .dm(_, let title):
                if let peer = callPeer {
                    AvatarView(url: peer.avatarUrl, name: peer.name, size: 72,
                               decoration: peer.equippedRingEffect)
                        .contentShape(Circle())
                        .onTapGesture { openProfile = peer }
                    StyledName(peer, size: 26, weight: .bold)
                    if let handle = peer.username {
                        Text(handle).font(.system(size: 15, weight: .medium)).foregroundStyle(Brand.textSecondary)
                    }
                } else {
                    Text(title).font(.system(size: 26, weight: .bold)).foregroundStyle(Brand.textPrimary)
                }
                Text("This is the very beginning of your direct messages with \(callPeer?.name ?? title).")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.textMuted)
            case .group(let id, let name):
                AvatarView(url: directMessages.groups.first { $0.id == id }?.iconUrl, name: name, size: 72)
                Text(name).font(.system(size: 26, weight: .bold)).foregroundStyle(Brand.textPrimary)
                Text("Welcome to the beginning of the \(name) group.")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.textMuted)
            case .channel(_, let name):
                Image(systemName: "number")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Brand.textPrimary)
                    .frame(width: 68, height: 68)
                    .background(Brand.elevated, in: Circle())
                Text("Welcome to #\(name)!").font(.system(size: 26, weight: .bold)).foregroundStyle(Brand.textPrimary)
                Text("This is the start of the #\(name) channel.")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 24)
        .padding(.bottom, 6)
    }

    /// Where the "NEW" line goes: above the oldest message that was unread
    /// when the chat opened.
    private func placeUnreadLine() {
        guard unreadAtOpen > 0, unreadAnchorId == nil else { return }
        let theirs = model.messages.filter { $0.authorId != app.currentUserId }
        guard !theirs.isEmpty else { return }
        let first = theirs[max(0, theirs.count - unreadAtOpen)]
        withAnimation(Motion.quick) { unreadAnchorId = first.id }
    }

    /// Scrolls to a message (the one a reply points at) and lights it briefly.
    private func jump(to id: String, using proxy: ScrollViewProxy) {
        guard model.messages.contains(where: { $0.id == id }) else { return }
        Haptics.tap()
        stickToBottom = false
        lastUserScroll = Date()
        withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) {
            proxy.scrollTo(id, anchor: .center)
        }
        withAnimation(.easeOut(duration: 0.2)) { highlightedId = id }
        Task {
            try? await Task.sleep(for: .milliseconds(1400))
            withAnimation(.easeOut(duration: 0.5)) {
                if highlightedId == id { highlightedId = nil }
            }
        }
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

    /// Key the recount on *who* is visible, not how many entries the map has.
    /// An online → invisible transition keeps the same number of keys, so the
    /// old `.task(id: statuses.count)` never re-ran and the header kept showing
    /// the person as online.
    private var onlinePresenceKey: String {
        presence.statuses
            .filter { $0.value != .offline }
            .keys
            .sorted()
            .joined(separator: ",")
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
                        // The shape of a conversation, bottom-aligned where
                        // the messages will land, instead of a spinner.
                        SkeletonMessageList()
                            .frame(maxWidth: .infinity, minHeight: viewport.size.height, alignment: .bottom)
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
                            } else {
                                conversationStart
                            }

                            ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, message in
                              // One view per message, divider included. As a
                              // separate sibling the "Today" divider had no
                              // identity of its own, and the lazy stack lost
                              // its place when the first message of a new day
                              // arrived, so following the bottom stopped there.
                              VStack(alignment: .leading, spacing: 2) {
                                if startsNewDay(at: index) {
                                    ChatDayDivider(timestamp: message.createdAt)
                                }
                                if message.id == unreadAnchorId {
                                    NewMessagesDivider()
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
                                    onHoldReactStarted: { frame in holdReactStarted(frame, message: message) },
                                    highlighted: message.id == highlightedId,
                                    onTapReply: { id in jump(to: id, using: proxy) }
                                )
                              }
                              .id(message.id)
                            }

                            // The true end of the list, below the last row's
                            // reactions and embeds, which scrolling to the
                            // last row's id could leave just out of view.
                            Color.clear.frame(height: 1).id(Self.bottomId)
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
                .simultaneousGesture(
                    DragGesture(minimumDistance: 4)
                        .onChanged { _ in lastUserScroll = Date() }
                        .onEnded { _ in lastUserScroll = Date() }
                )
                .modifier(UserScrollPhase { active in
                    userIsScrolling = active
                    lastUserScroll = Date()
                })
                .modifier(OpenAtBottom(followBottom: stickToBottom))
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .overlay(alignment: .bottomTrailing) {
                    if !stickToBottom, model.messages.last != nil {
                        Button {
                            stickToBottom = true
                            withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                                proxy.scrollTo(Self.bottomId, anchor: .bottom)
                            }
                        } label: {
                            // Grows into "3 new" when messages arrive while
                            // you're reading further up.
                            HStack(spacing: 6) {
                                if missedCount > 0 {
                                    Text("\(missedCount) new")
                                        .font(.system(size: 13, weight: .bold))
                                        .contentTransition(.numericText())
                                }
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 14, weight: .bold))
                            }
                            .foregroundStyle(missedCount > 0 ? Color.white : Brand.textPrimary)
                            .padding(.horizontal, missedCount > 0 ? 14 : 0)
                            .frame(minWidth: 38, minHeight: 38)
                            .background {
                                if missedCount > 0 {
                                    Capsule().fill(Brand.accent)
                                } else {
                                    Circle().fill(.ultraThinMaterial)
                                }
                            }
                            .overlay(Capsule().strokeBorder(missedCount > 0 ? Color.white.opacity(0.18) : Brand.divider, lineWidth: 1))
                            .shadow(color: .black.opacity(0.28), radius: 10, y: 4)
                            .animation(Motion.pop, value: missedCount)
                        }
                        .buttonStyle(PressScaleStyle(scale: 0.92))
                        .padding(.trailing, 16)
                        // Above the typing pill, which shares this corner.
                        .padding(.bottom, model.typers.isEmpty ? 10 : 52)
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
                    let userScrolling = userIsScrolling || Date().timeIntervalSince(lastUserScroll) < 1.2
                    if initialScrollSettled && userScrolling {
                        if stickToBottom != nearBottom { stickToBottom = nearBottom }
                    } else if nearBottom {
                        stickToBottom = true
                    }
                    // Only when something below the screen's edge appeared (a
                    // new message, an image finishing loading). This runs on
                    // every scroll frame, and scrolling to the bottom each
                    // time made a busy channel fight its own scrolling.
                    if stickToBottom, model.messages.last != nil, maxY - viewport.size.height > 2, !userScrolling {
                        proxy.scrollTo(Self.bottomId, anchor: .bottom)
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
                .onChange(of: model.messages.last?.id) { old, new in
                    // Someone else's message landed while you were reading
                    // further up: count it on the jump button.
                    guard old != nil, new != old, !stickToBottom, let last = model.messages.last,
                          last.authorId != app.currentUserId else { return }
                    missedCount += 1
                    Haptics.soft()
                }
                .onChange(of: stickToBottom) { _, following in
                    if following { missedCount = 0 }
                }
                .onChange(of: model.messages.count) {
                    if stickToBottom, model.messages.last != nil {
                        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(Self.bottomId, anchor: .bottom) }
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
                    guard height > 0, stickToBottom, model.messages.last != nil else { return }
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo(Self.bottomId, anchor: .bottom)
                    }
                    // Again once the keyboard has finished moving: a scroll
                    // aimed into a frame that is still animating lands short,
                    // which left the newest message under the composer.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        guard stickToBottom, model.messages.last != nil else { return }
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(Self.bottomId, anchor: .bottom)
                        }
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

    private func startEditing(_ message: DisplayMessage) {
        if editingMessage == nil { draftBeforeEdit = draft }
        staged = []
        withAnimation {
            replyingTo = nil
            editingMessage = message
        }
        draft = message.content
    }

    private func stopEditing() {
        withAnimation { editingMessage = nil }
        draft = draftBeforeEdit
        draftBeforeEdit = ""
    }

    private func editBanner(_ message: DisplayMessage) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "pencil").foregroundStyle(Brand.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text("Editing message")
                    .font(.caption.weight(.semibold)).foregroundStyle(Brand.textSecondary)
                Text(message.content)
                    .font(.caption2).foregroundStyle(Brand.textMuted).lineLimit(1)
            }
            Spacer()
            Button { stopEditing() } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.textMuted)
            }
            .accessibilityLabel("Cancel editing")
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Brand.surface)
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

    /// The space's bot commands, for the "/" list (cached for a minute).
    private func loadBotCommands() async {
        guard case .channel(let id, _) = model.source else { return }
        if channelServerId == nil { channelServerId = await ServerOnlineCount.serverId(forChannel: id) }
        guard let serverId = channelServerId else { return }
        botCommands = await BotCommandService.commands(serverId: serverId)
    }

    private func isGrouped(at index: Int) -> Bool {
        guard index > 0, !startsNewDay(at: index) else { return false }
        let prev = model.messages[index - 1]
        let cur = model.messages[index]
        // A bot's answer to a command starts its own block, under "used /x".
        guard prev.authorId == cur.authorId, cur.replyToId == nil, cur.interaction == nil else { return false }
        // One webhook can post as several names; each name is its own speaker.
        guard prev.webhook?.name == cur.webhook?.name,
              prev.webhook?.avatarUrl == cur.webhook?.avatarUrl else { return false }
        guard let a = RelativeTime.date(from: prev.createdAt),
              let b = RelativeTime.date(from: cur.createdAt) else { return false }
        return b.timeIntervalSince(a) < 300
    }

    private func sendDraft() {
        let content = draft
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        if let editing = editingMessage {
            // Saving an edit: an emptied message is left alone (delete is
            // its own action), as on the web.
            guard !trimmed.isEmpty else { return }
            stopEditing()
            Task { await model.editMessage(editing, to: trimmed) }
            return
        }
        // The same text again within a moment is the keyboard handing the
        // last message back (see below) and a second tap on send, not a new
        // message. It used to post twice.
        if !trimmed.isEmpty, trimmed == lastSent.text, Date().timeIntervalSince(lastSent.at) < 2 {
            draft = ""
            return
        }
        if !staged.isEmpty {
            sendStaged(caption: trimmed)
            return
        }
        lastSent = (trimmed, Date())
        let reply = replyingTo?.id
        draft = ""
        // The keyboard commits a pending autocorrect or prediction after the
        // box is cleared, which put the whole message straight back in the
        // composer. Clear it again once the keyboard has done that.
        for delay in [0.05, 0.3] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                if !draft.isEmpty, draft.trimmingCharacters(in: .whitespacesAndNewlines) == trimmed { draft = "" }
            }
        }
        // Whatever the reader was looking at, their own message is what they
        // want to see next.
        stickToBottom = true
        withAnimation { replyingTo = nil }
        guard let uid = app.currentUserId else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if case .dm(let threadId, _) = model.source { directMessages.markRepliedTo(threadId) }
        Task { await model.send(content: content, authorId: uid, replyToId: reply) }
    }

    private func sendGif(_ gif: GiphyGif) {
        guard let uid = app.currentUserId, let url = gif.fullUrl else { return }
        let reply = replyingTo?.id
        stickToBottom = true
        withAnimation { replyingTo = nil }
        Task { await model.sendAttachment(OutgoingAttachment(url: url, type: "gif", key: nil),
                                          replyToId: reply, authorId: uid) }
    }

    private func sendPoll(_ pollId: String) {
        guard let uid = app.currentUserId else { return }
        let reply = replyingTo?.id
        stickToBottom = true
        withAnimation { replyingTo = nil }
        Task { await model.sendAttachment(OutgoingAttachment(url: pollId, type: "poll", key: nil),
                                          replyToId: reply, authorId: uid) }
    }

    /// Load what was picked into the strip above the composer.
    private func stage(_ items: [PhotosPickerItem]) async {
        defer { photoItems = [] }
        for item in items {
            guard staged.count < maxAttachments else { break }
            // Videos travel as files, never as one big `Data`: see `PickedMovie`.
            if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
                if let movie = try? await item.loadTransferable(type: PickedMovie.self) {
                    staged.append(StagedAttachment(kind: .video(movie.url)))
                } else {
                    model.sendError = "Couldn't open that video."
                }
            } else if let data = try? await item.loadTransferable(type: Data.self) {
                staged.append(StagedAttachment(kind: .photo(data, UIImage(data: data))))
            }
        }
    }

    /// Images and GIFs pasted into the composer wait with picked photos.
    private func stagePasted(_ images: [Data]) {
        for data in images.prefix(max(0, maxAttachments - staged.count)) {
            staged.append(StagedAttachment(kind: .photo(data, UIImage(data: data))))
        }
    }

    private func removeStaged(_ item: StagedAttachment) {
        if case .video(let url) = item.kind { try? FileManager.default.removeItem(at: url) }
        withAnimation(.snappy) { staged.removeAll { $0.id == item.id } }
    }

    /// The waiting attachments, each with a remove button, and a tile to add more.
    private var stagedStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(staged) { item in
                    ZStack(alignment: .topTrailing) {
                        Group {
                            switch item.kind {
                            case .photo(_, let image):
                                if let image {
                                    Image(uiImage: image).resizable().scaledToFill()
                                } else {
                                    Brand.elevated.overlay(Image(systemName: "photo").foregroundStyle(Brand.textMuted))
                                }
                            case .video:
                                Brand.elevated.overlay(
                                    Image(systemName: "video.fill").font(.title3).foregroundStyle(Brand.textSecondary))
                            }
                        }
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                        Button { removeStaged(item) } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 22, height: 22)
                                .background(Color.black.opacity(0.7), in: Circle())
                                .frame(width: 34, height: 34)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .offset(x: 8, y: -8)
                        .accessibilityLabel("Remove attachment")
                    }
                    .transition(.scale.combined(with: .opacity))
                }
                if staged.count < maxAttachments {
                    Button { showPhotoPicker = true } label: {
                        Image(systemName: "plus")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Brand.textSecondary)
                            .frame(width: 72, height: 72)
                            .background(Brand.elevated, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Add more")
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 2)
        }
    }

    /// Send what is waiting, with the composer text as its caption.
    private func sendStaged(caption: String) {
        guard let uid = app.currentUserId else { return }
        let items = staged
        let reply = replyingTo?.id
        staged = []
        draft = ""
        stickToBottom = true
        withAnimation { replyingTo = nil }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if case .dm(let threadId, _) = model.source { directMessages.markRepliedTo(threadId) }

        let photos: [(data: Data, filename: String, mimeType: String, type: AttachmentType)] =
            items.enumerated().compactMap { index, item in
                guard case .photo(let data, _) = item.kind else { return nil }
                // Numbered so a set does not arrive as ten files all called
                // "image.jpg", which is what the file card would show.
                // By its bytes, not assumed JPEG: a GIF sent as image/jpeg
                // arrived as a still.
                let format = ImageFormat.sniff(data)
                return (data, items.count == 1 ? "image.\(format.ext)" : "image-\(index + 1).\(format.ext)",
                        format.mime, .image)
            }
        let videos = items.compactMap { item -> URL? in
            if case .video(let url) = item.kind { return url }
            return nil
        }
        Task {
            // Photos share one message with the caption. Each video is its
            // own message: it needs converting and streaming from disk, and
            // the mosaic has no cell that keeps a play control.
            if !photos.isEmpty {
                await model.uploadAndSendAttachments(items: photos, caption: caption, replyToId: reply, authorId: uid)
            } else if !caption.isEmpty {
                await model.send(content: caption, authorId: uid, replyToId: reply)
            }
            for video in videos {
                await model.uploadAndSendVideo(source: video, replyToId: photos.isEmpty && caption.isEmpty ? reply : nil,
                                               authorId: uid)
            }
        }
    }
}

/// What kind of image some bytes are, from their first few.
enum ImageFormat {
    static func sniff(_ data: Data) -> (ext: String, mime: String) {
        let head = [UInt8](data.prefix(12))
        if head.starts(with: [0x47, 0x49, 0x46, 0x38]) { return ("gif", "image/gif") }
        if head.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return ("png", "image/png") }
        if head.count >= 12, head[0...3] == [0x52, 0x49, 0x46, 0x46], head[8...11] == [0x57, 0x45, 0x42, 0x50] {
            return ("webp", "image/webp")
        }
        // Anything else (JPEG, and HEIC from the photo library) goes as it
        // always has.
        return ("jpg", "image/jpeg")
    }
}

/// A photo or video waiting above the composer.
private struct StagedAttachment: Identifiable {
    enum Kind {
        case photo(Data, UIImage?)
        case video(URL)
    }
    let id = UUID()
    let kind: Kind
}

/**
 Open on the newest message, and keep it there while the reader is.

 Size changes anchor to the bottom only while the reader is at the bottom:
 a link preview, image or invite card that finishes loading then pushes the
 conversation up, the way new text does, instead of growing off the bottom
 of the screen. Once they have scrolled up the anchor is the top, so an
 embed loading under them never drags the list down (on iOS 18 a fixed
 bottom anchor threw readers of older messages down whenever anyone posted).
 */
private struct OpenAtBottom: ViewModifier {
    var followBottom: Bool

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content
                .defaultScrollAnchor(.bottom, for: .initialOffset)
                .defaultScrollAnchor(followBottom ? .bottom : .top, for: .sizeChanges)
        } else {
            content.defaultScrollAnchor(.bottom)
        }
    }
}

/// Reports whether the reader is moving the list: a finger on it, or the
/// coast after a flick. A scroll the app started (jumping to the newest
/// message) does not count.
private struct UserScrollPhase: ViewModifier {
    let onChange: (Bool) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollPhaseChange { _, phase in
                switch phase {
                case .tracking, .interacting, .decelerating: onChange(true)
                default: onChange(false)
                }
            }
        } else {
            content
        }
    }
}

/// The red "NEW" line above the first message you haven't read.
private struct NewMessagesDivider: View {
    var body: some View {
        HStack(spacing: 8) {
            Rectangle().fill(Brand.dnd.opacity(0.7)).frame(height: 1)
            Text("NEW")
                .font(.system(size: 10, weight: .heavy))
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .frame(height: 16)
                .background(Brand.dnd, in: Capsule())
        }
        .padding(.leading, 16)
        .padding(.trailing, 12)
        .padding(.top, 10)
        .transition(.opacity)
        .accessibilityLabel("New messages")
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
