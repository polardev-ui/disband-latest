import Foundation
import StoreKit

/**
 Whether this install may use CallKit and PushKit.

 The Chinese MIIT requires CallKit to be deactivated in apps distributed on the
 China App Store, so the same binary ships everywhere and switches itself off
 there. Two things follow from that, and only one of them is obvious:

 1. CallKit's system call UI is not presented.
 2. **PushKit is not registered either.** A VoIP push that is not answered with
    `reportNewIncomingCall` gets the app terminated by iOS, and doing it
    repeatedly costs the app its PushKit privileges altogether. With CallKit
    off there is nothing to report a push to, so the only safe thing is never
    to ask for one. Calls in China ring through ordinary alert pushes instead,
    which the send-call-push function already falls back to for any device
    without a VoIP token.

 The signal is the **App Store storefront**, not the device's region setting.
 The requirement is about where the app was bought, and those two differ all
 the time: someone in Shanghai can set their phone to United States, and a
 traveller can set theirs to China without ever having touched that storefront.
 The device region is kept only as the answer before StoreKit has replied.
 */
@MainActor
enum CallKitAvailability {
    /// The last storefront StoreKit reported, so a cold start — including one
    /// woken by a push — knows the answer before any await completes.
    private static let cacheKey = "disband.storefront.country"

    private static var cachedCountry: String? {
        get { UserDefaults.standard.string(forKey: cacheKey) }
        set { UserDefaults.standard.set(newValue, forKey: cacheKey) }
    }

    /// ISO 3166-1 alpha-3, which is what StoreKit's storefront reports.
    private static let chinaStorefront = "CHN"

    /// Called when the answer changes, so PushKit can be torn down or brought
    /// up without waiting for the next launch.
    static var onChange: ((Bool) -> Void)?

    /// Whether CallKit and PushKit may be used right now.
    ///
    /// Fails safe: while the storefront is unknown, a device set to China is
    /// treated as China. Being wrong in that direction costs a nicer call UI;
    /// being wrong in the other direction breaks a legal requirement.
    static var isEnabled: Bool {
        if let country = cachedCountry {
            return country != chinaStorefront
        }
        return Locale.current.region?.identifier != "CN"
    }

    /// Ask StoreKit where this install came from, and keep listening.
    ///
    /// Called at launch. The first answer is usually already cached by the
    /// system and arrives immediately, but nothing here blocks on it.
    static func start() {
        Task { await refresh() }
        Task {
            for await storefront in Storefront.updates {
                apply(storefront.countryCode)
            }
        }
    }

    static func refresh() async {
        guard let storefront = await Storefront.current else { return }
        apply(storefront.countryCode)
    }

    private static func apply(_ countryCode: String) {
        let was = isEnabled
        cachedCountry = countryCode
        let now = isEnabled
        if was != now { onChange?(now) }
    }
}
