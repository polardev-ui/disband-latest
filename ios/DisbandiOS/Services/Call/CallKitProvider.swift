import CallKit
import Foundation

/// Bridges Disband's incoming calls to CallKit's system call UI.
///
/// When the app is backgrounded (or killed) the phone has no browser overlay to
/// swipe on — that's CallKit's job: the lock-screen ring, the system answer /
/// decline buttons, and the "call" entry in the app switcher. Opened from the
/// VoIP push, the app reports a new incoming call and the system takes it from
/// there; the answers/ends flow back here through `CXAnswerCallAction` /
/// `CXEndCallAction`.
@MainActor
final class CallKitProvider: NSObject, CXProviderDelegate {
    static let shared = CallKitProvider()

    /// Fired on the main actor when the user answers from the system call UI.
    var onAnswer: ((IncomingCall) -> Void)?
    /// Fired on the main actor when the user declines/ends from the system UI.
    var onEnd: ((IncomingCall) -> Void)?

    /// MIIT requires CallKit to be deactivated for apps distributed on the
    /// China App Store, so the same binary ships everywhere and switches
    /// itself off there; those devices use the in-app ring instead.
    ///
    /// The decision lives in `CallKitAvailability` because PushKit has to make
    /// the same one — see the note there on why registering for VoIP pushes
    /// with CallKit off gets the app killed.
    static var isEnabledForCurrentRegion: Bool {
        CallKitAvailability.isEnabled
    }

    private let provider: CXProvider
    private var calls: [UUID: IncomingCall] = [:]

    /// Outgoing and joined calls, which the system was never told about.
    ///
    /// iOS suspends an app shortly after it leaves the screen unless it has a
    /// call registered with CallKit. Only incoming calls were reported, so any
    /// call you started or joined yourself lost its microphone and its audio
    /// the moment you swiped up — the process was simply suspended. Reporting
    /// every active call is what keeps it alive in the background.
    private let controller = CXCallController()
    private var activeCalls: [String: UUID] = [:]

    override init() {
        let config = CXProviderConfiguration(localizedName: "Disband")
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.includesCallsInRecents = false
        config.ringtoneSound = "default"
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: .main)
    }

    /// Register a call this device started or joined — a 1:1 call, a group
    /// call, or a voice channel. Without this the app is suspended on
    /// backgrounding and stops sending and receiving audio.
    func startActiveCall(id: String, title: String, hasVideo: Bool = false) {
        guard Self.isEnabledForCurrentRegion else { return }
        guard activeCalls[id] == nil else { return }
        let uuid = UUID()
        activeCalls[id] = uuid

        let handle = CXHandle(type: .generic, value: title)
        let action = CXStartCallAction(call: uuid, handle: handle)
        action.isVideo = hasVideo

        controller.request(CXTransaction(action: action)) { [weak self] error in
            guard let self else { return }
            Task { @MainActor in
                if let error {
                    // Nothing to keep alive if the system refused the call, so
                    // do not leave a mapping that end() would act on later.
                    self.activeCalls[id] = nil
                    print("CallKit startActiveCall failed: \(error.localizedDescription)")
                    return
                }
                self.provider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
                self.provider.reportOutgoingCall(with: uuid, connectedAt: Date())
            }
        }
    }

    /// Tell the system a call this device started or joined has finished.
    func endActiveCall(id: String) {
        guard Self.isEnabledForCurrentRegion else { return }
        guard let uuid = activeCalls.removeValue(forKey: id) else { return }
        let action = CXEndCallAction(call: uuid)
        controller.request(CXTransaction(action: action)) { error in
            if let error {
                print("CallKit endActiveCall failed: \(error.localizedDescription)")
            }
        }
    }

    /// Present the system ring (lock screen, swipe to answer, banner upstairs).
    func presentIncomingCall(_ call: IncomingCall) {
        guard Self.isEnabledForCurrentRegion else { return }
        // One CallKit call per Disband call: replace any stale entry.
        if let stale = calls.first(where: { $0.value.callId == call.callId })?.key {
            calls.removeValue(forKey: stale)
        }
        let uuid = UUID()
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: call.callerName)
        update.localizedCallerName = call.callerName
        update.hasVideo = false
        calls[uuid] = call
        PushDiag.log("callkit.report", "callId=\(call.callId)")
        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error {
                PushDiag.log("callkit.error", "callId=\(call.callId) \(error.localizedDescription)")
                print("CallKit reportNewIncomingCall failed: \(error.localizedDescription)")
                Task { @MainActor [weak self] in
                    self?.calls.removeValue(forKey: uuid)
                }
            } else {
                PushDiag.log("callkit.reported", "callId=\(call.callId)")
            }
        }
    }

    /// Whether the system call UI is already showing this call.
    ///
    /// The realtime ring and the VoIP push carry the same call and can arrive
    /// in either order: CallKit must only be presented once, but it must still
    /// be presented when the realtime ring happened to be first.
    func isPresented(callId: String) -> Bool {
        guard Self.isEnabledForCurrentRegion else { return false }
        return calls.values.contains { $0.callId == callId }
    }

    /// Dismiss the system ring (declined, missed, or picked up on another
    /// device). The system call UI disappears and the call is not logged.
    func dismissIncomingCall(for call: IncomingCall) {
        guard Self.isEnabledForCurrentRegion else { return }
        guard let uuid = calls.first(where: { $0.value.callId == call.callId })?.key else { return }
        calls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
    }

    /// Once audio is live, transfer the system UI into the in-progress call.
    func markCallConnected(for call: IncomingCall) {
        guard Self.isEnabledForCurrentRegion else { return }
        guard let uuid = calls.first(where: { $0.value.callId == call.callId })?.key else { return }
        provider.reportOutgoingCall(with: uuid, connectedAt: Date())
    }

    // MARK: - CXProviderDelegate

    func providerDidReset(_ provider: CXProvider) {
        calls.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let call = calls[action.callUUID]
        action.fulfill()
        if let call {
            Task { @MainActor in
                self.onAnswer?(call)
                // Answering elsewhere kills the in-app ring on other sessions,
                // but on THIS device the system UI is the ring.
                self.calls.removeValue(forKey: action.callUUID)
            }
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let call = calls[action.callUUID]
        action.fulfill()
        if let call {
            Task { @MainActor in
                self.onEnd?(call)
                self.calls.removeValue(forKey: action.callUUID)
            }
        }
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        action.fulfill()
    }
}