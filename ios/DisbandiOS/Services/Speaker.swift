import AVFoundation
import WebRTC

/// Speaks message text aloud via the system speech synthesizer.
final class Speaker {
    static let shared = Speaker()
    private let synthesizer = AVSpeechSynthesizer()

    func speak(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // During a call the audio session belongs to WebRTC. Setting
        // `.playback` here would drop the microphone for the rest of the call,
        // so leave the session exactly as it is and just speak into it.
        if !RTCAudioSession.sharedInstance().isAudioEnabled {
            try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.duckOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
        }

        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesizer.speak(utterance)
    }
}
