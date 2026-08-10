import AVFoundation

/// Call lifecycle sounds, synthesized in-memory (no bundled assets) to mirror the
/// desktop app's Web Audio tones: a looping dual-tone ringtone, a connect chime,
/// join/leave blips, and a soft end/decline tone.
@MainActor
final class CallSounds {
    static let shared = CallSounds()

    private let sampleRate = 44100.0
    private var ringPlayer: AVAudioPlayer?
    private var oneShots: [AVAudioPlayer] = []

    private init() {}

    // MARK: - Public API

    func startRingtone() {
        stopRingtone()
        guard let data = ringtoneData(), let player = try? AVAudioPlayer(data: data) else { return }
        player.numberOfLoops = -1
        player.volume = 0.8
        player.play()
        ringPlayer = player
    }

    func stopRingtone() {
        ringPlayer?.stop()
        ringPlayer = nil
    }

    func playConnected() { playOneShot(chime([(523.25, 0.0, 0.30), (783.99, 0.10, 0.35)])) }
    func playJoin() { playOneShot(chime([(659.25, 0.0, 0.20), (880.00, 0.07, 0.28)])) }
    func playLeave() { playOneShot(chime([(659.25, 0.0, 0.20), (440.00, 0.07, 0.28)])) }
    func playEnd() { playOneShot(chime([(440.00, 0.0, 0.22), (329.63, 0.09, 0.34)])) }

    // MARK: - Playback

    private func playOneShot(_ data: Data?) {
        guard let data, let player = try? AVAudioPlayer(data: data) else { return }
        player.volume = 0.8
        oneShots.append(player)
        player.play()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.oneShots.removeAll { $0 === player }
        }
    }

    // MARK: - Tone synthesis

    /// Looping ring pulse: a 1.4s dual-tone (220 + 330 Hz) swell followed by
    /// 0.8s of silence, matching the desktop ringtone cadence.
    private func ringtoneData() -> Data? {
        let pulse = 1.4
        let gap = 0.8
        let total = pulse + gap
        let n = Int(total * sampleRate)
        var samples = [Float](repeating: 0, count: n)
        let pulseCount = Int(pulse * sampleRate)
        for i in 0..<pulseCount {
            let t = Double(i) / sampleRate
            var env: Float
            if t < 0.08 {
                env = Float(t / 0.08)
            } else {
                let progress = Double(i - Int(0.08 * sampleRate)) / Double(pulseCount - Int(0.08 * sampleRate))
                env = Float(pow(0.001, progress))
            }
            let wave = 0.7 * sin(2 * .pi * 220.0 * t) + 0.35 * sin(2 * .pi * 330.0 * t)
            samples[i] = Float(wave * Double(env) * 0.8)
        }
        return makeWav(samples)
    }

    /// A short chord of decaying sine tones: (freq, startOffset, duration).
    private func chime(_ tones: [(freq: Double, start: Double, dur: Double)]) -> Data? {
        let end = (tones.map { $0.start + $0.dur }.max() ?? 0.4) + 0.12
        let n = Int(end * sampleRate)
        var samples = [Float](repeating: 0, count: n)
        for tone in tones {
            let s0 = Int(tone.start * sampleRate)
            let count = min(Int(tone.dur * sampleRate), n - s0)
            for i in 0..<count {
                let t = Double(i) / sampleRate
                let env = Float(exp(-t * 7))
                samples[s0 + i] += Float(sin(2 * .pi * tone.freq * t)) * env
            }
        }
        return makeWav(samples)
    }

    /// 16-bit mono PCM packed into a WAV container.
    private func makeWav(_ samples: [Float]) -> Data? {
        var pcm = Data(capacity: samples.count * 2)
        for sample in samples {
            var v = Int16(max(-1, min(1, sample)) * 32767)
            withUnsafeBytes(of: &v) { pcm.append(contentsOf: $0) }
        }
        let byteRate = 2 * sampleRate
        var header = Data()
        func put(_ s: String) { header.append(s.data(using: .ascii)!) }
        func put32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { header.append(contentsOf: $0) } }
        func put16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { header.append(contentsOf: $0) } }
        put("RIFF"); put32(36 + UInt32(pcm.count)); put("WAVE")
        put("fmt "); put32(16); put16(1); put16(1)
        put32(UInt32(sampleRate)); put32(UInt32(byteRate)); put16(2); put16(16)
        put("data"); put32(UInt32(pcm.count))
        return header + pcm
    }
}
