import AudioToolbox
import UIKit

/// Incoming-call vibration.
///
/// The ringtone alone is silent to a phone in the user's pocket, and a single
/// buzz reads as a notification. These pulses walk a real phone-call line:
/// a strong kick when the ring starts, then a repeating buzz on the same
/// 1.4s-tone / 0.8s-gap cadence as the ringtone, so the whole phone does the
/// "buzz … buzz … buzz" a call should.
@MainActor
final class CallHaptics {
    static let shared = CallHaptics()

    private var vibrateTask: Task<Void, Never>?
    private let generator = UINotificationFeedbackGenerator()

    private init() {
        generator.prepare()
    }

    /// Ring pulse: one strong buzz at the start, then a pulse every 2.2s
    /// (1.4s on + 0.8s off) until stopped.
    ///
    /// 60s = the same wall clock as `CallManager`'s ring watchdog, so a
    /// missed call never vibrates on after the ring itself has given up.
    func startRingVibration() {
        stop()
        pulse(hard: true)
        vibrateTask = Task { [weak self] in
            var ticks = 1
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2.2))
                guard !Task.isCancelled else { return }
                self?.pulse(hard: false)
                ticks += 1
                // Give the "no answer" + reset a beat with its own cadence.
                if ticks >= 26 { self?.pulse(hard: true) }
            }
        }
    }

    /// Gentle pulses while an outgoing call rings (the "calling" side).
    func startCallingVibration() {
        stop()
        pulse(hard: false)
        vibrateTask = Task { [weak self] in
            for _ in 0..<20 {
                try? await Task.sleep(for: .seconds(3.0))
                guard !Task.isCancelled else { return }
                self?.pulse(hard: false)
            }
        }
    }

    func stop() {
        vibrateTask?.cancel()
        vibrateTask = nil
    }

    private func pulse(hard: Bool) {
        if hard {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
        } else {
            generator.notificationOccurred(.warning)
        }
    }
}