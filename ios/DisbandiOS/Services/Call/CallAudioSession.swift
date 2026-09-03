import AVFoundation
import WebRTC

/// The single owner of the audio session during a call.
///
/// WebRTC does not simply read `AVAudioSession` — it wraps it in
/// `RTCAudioSession`, which keeps its own cached view of the category, mode and
/// activation state and starts/stops the voice-processing audio unit from that
/// cache. Configuring `AVAudioSession.sharedInstance()` directly (as this app
/// used to, in six separate places) mutates the session behind that cache's
/// back. The two then disagree, and WebRTC either re-applies its own settings
/// over yours or concludes there is nothing to do and never starts the unit —
/// which is why calls connected, ICE succeeded, and both sides heard silence.
///
/// Every audio-session change on the call path goes through here.
enum CallAudioSession {
    private static var session: RTCAudioSession { RTCAudioSession.sharedInstance() }

    /// Take manual control so activation happens when *we* say, not as a side
    /// effect of the peer connection being created. Called once at launch.
    static func prepare() {
        let session = self.session
        session.lockForConfiguration()
        // With manual audio, WebRTC will not start the audio unit until
        // `isAudioEnabled` is set — that is what `activate()` does below.
        session.useManualAudio = true
        session.isAudioEnabled = false
        session.unlockForConfiguration()
    }

    /// Configure for a two-way call and start the audio unit.
    static func activate() {
        let session = self.session
        session.lockForConfiguration()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
            )
            try session.setActive(true)
            session.isAudioEnabled = true
        } catch {
            // Leaving isAudioEnabled false here keeps WebRTC from half-starting
            // against a session it could not configure.
        }
        session.unlockForConfiguration()
    }

    /// Configure for playback-only audio (the ringtone) without giving up the
    /// ability to capture later.
    ///
    /// The old ringtone path set the category to `.playback`, which physically
    /// cannot record; answering from that state left the microphone dead.
    /// `.playAndRecord` rings just as loudly and needs no second switch when
    /// the call is answered.
    static func prepareForRinging() {
        let session = self.session
        session.lockForConfiguration()
        try? session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
        )
        try? session.setActive(true)
        session.unlockForConfiguration()
    }

    /// Stop the audio unit and hand the session back to the rest of the system.
    static func deactivate() {
        let session = self.session
        session.lockForConfiguration()
        session.isAudioEnabled = false
        try? session.setActive(false)
        session.unlockForConfiguration()
    }

    /// Route audio to the loudspeaker (video calls / speakerphone) or back to
    /// the earpiece.
    static func setSpeaker(_ on: Bool) {
        let session = self.session
        session.lockForConfiguration()
        try? session.overrideOutputAudioPort(on ? .speaker : .none)
        session.unlockForConfiguration()
    }
}
