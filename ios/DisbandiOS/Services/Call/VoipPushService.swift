import Foundation
import PushKit
import Supabase
import UIKit

/// A VoIP push decoded from APNs. Fire-and-forget from the edge function; the
/// topic carries everything needed to start ringing without a network round
/// trip.
struct VoipPushPayload: Equatable {
    let callId: String
    let from: String
    let callerName: String
    let type: String
}

/// PushKit wiring for incoming calls.
///
/// APNs on its own can only wake the app to show a banner — it can never put a
/// call UI on the lock screen. PushKit VoIP pushes are sent to a *separate*
/// device token (the `com.wsgpolar.disband.voip` push topic), arrive even when
/// the app is killed, and are what lets us hand the call to CallKit for the
/// system ring + swipe-to-answer.
@MainActor
final class VoipPushService: NSObject, PKPushRegistryDelegate {
    static let shared = VoipPushService()

    /// Fired on the main actor when a VoIP push arrives.
    var onReceiveIncomingPush: ((VoipPushPayload) -> Void)?

    private var registry: PKPushRegistry?

    /**
     The VoIP token waiting to be written to the server, kept on disk.

     It used to live only in memory, and that is a bet that one of two
     unordered events lands second: PushKit handing over the token, and the
     Supabase session finishing its restore from the keychain. Whichever
     finishes first finds the other side not ready and does nothing; the
     second one is what actually registers. When the losing path was the
     token — the delegate fired, no session yet — the value sat in a property
     that the next launch overwrote before anyone read it, and the device kept
     a perfectly good APNs alert token and no VoIP token at all. Those are the
     devices that ring as a plain banner instead of the system call UI.

     On disk, the pending token survives the launch that failed to register
     it, and `retry()` below gets another go at it every time the app comes
     forward.
     */
    private static let pendingKey = "disband.voip.pendingToken"
    /// The token the server is known to hold, so an unchanged one is not
    /// rewritten on every single foreground.
    private static let registeredKey = "disband.voip.registeredToken"

    private var pendingToken: String? {
        get { UserDefaults.standard.string(forKey: Self.pendingKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.pendingKey) }
    }

    private var registeredToken: String? {
        get { UserDefaults.standard.string(forKey: Self.registeredKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.registeredKey) }
    }

    private var foregroundObserver: NSObjectProtocol?

    private var client: SupabaseClient { SupabaseManager.client }

    /// Start listening for VoIP pushes. Called once at launch; tokens are
    /// flushed to the server as soon as a user is signed in.
    ///
    /// Not started at all where CallKit is unavailable. A VoIP push must be
    /// answered with `reportNewIncomingCall`, and with CallKit off there is
    /// nothing to report it to — iOS terminates the app for that, and repeats
    /// cost the app PushKit entirely. Those devices are rung by the ordinary
    /// alert push instead.
    func start() {
        // Storefront answers can arrive after launch, so this may have to be
        // undone (or done) later.
        CallKitAvailability.onChange = { [weak self] enabled in
            Task { @MainActor in
                if enabled { self?.startRegistry() } else { self?.stopRegistry() }
            }
        }
        // Anything that failed to register earlier gets another attempt every
        // time the app comes forward — by then a session has almost always
        // finished restoring, and a device that missed its registration once
        // no longer stays unreachable for calls until it happens to reinstall.
        if foregroundObserver == nil {
            foregroundObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { _ in
                Task { @MainActor in await VoipPushService.shared.flushToken() }
            }
        }

        guard CallKitAvailability.isEnabled else {
            PushDiag.log("voip.start", "skipped — CallKit unavailable in this storefront")
            return
        }
        startRegistry()
    }

    private func startRegistry() {
        guard registry == nil else { return }
        PushDiag.log("voip.start", "pushing registry up")
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.registry = registry
    }

    /// Stop receiving VoIP pushes and drop the token, so the server stops
    /// sending them to a device that can no longer act on one.
    private func stopRegistry() {
        guard let registry else { return }
        PushDiag.log("voip.stop", "CallKit unavailable — unregistering")
        registry.desiredPushTypes = []
        self.registry = nil
        let doomed = registeredToken ?? pendingToken
        pendingToken = nil
        registeredToken = nil
        Task { await deleteStoredToken(doomed) }
    }

    /// PushKit handed us a VoIP device token — persist it for the signed-in user.
    ///
    /// VoIP tokens live in the same `device_tokens` table as APNs tokens but
    /// with platform `ios-voip`, so the regular alert-push sender never touches
    /// them and this sender never touches APNs tokens.
    func pushRegistry(_ registry: PKPushRegistry,
                      didUpdate pushCredentials: PKPushCredentials,
                      for type: PKPushType) {
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        PushDiag.log("voip.token", "prefix=\(token.prefix(8))")
        Task { @MainActor in
            if token != self.registeredToken { self.registeredToken = nil }
            self.pendingToken = token
            await self.flushToken()
        }
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {}

    func pushRegistry(_ registry: PKPushRegistry,
didReceiveIncomingPushWith payload: PKPushPayload,
                          for type: PKPushType,
                          completion: @escaping () -> Void) {
        PushDiag.log("voip.push.received", "type=\(type.rawValue)")
        handle(payload: payload)
        completion()
    }

    func pushRegistry(_ registry: PKPushRegistry,
                      didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType) {
        PushDiag.log("voip.push.received", "type=\(type.rawValue)")
        handle(payload: payload)
    }

    private func handle(payload: PKPushPayload) {
        let dict = payload.dictionaryPayload
        guard let callId = dict["callId"] as? String,
              let from = dict["from"] as? String else {
            PushDiag.log("voip.push.badpayload", "missing callId/from: \(dict)")
            return
        }
        PushDiag.log("voip.push.parsed", "callId=\(callId)")
        onReceiveIncomingPush?(VoipPushPayload(
            callId: callId,
            from: from,
            callerName: dict["callerName"] as? String ?? "Disband call",
            type: dict["type"] as? String ?? "voice"
        ))
    }

    /**
     Remove this device's VoIP token from the server.

     Left behind, the server keeps sending VoIP pushes to a device that has
     just stopped being able to answer one — which is the exact situation that
     gets an app terminated. RLS lets a user delete their own tokens, so no
     privileged call is needed.
     */
    private func deleteStoredToken(_ token: String?) async {
        guard let userId = client.auth.currentUser?.id.uuidString.lowercased(),
              let token else { return }
        do {
            // Scoped to THIS device's token. Deleting every `ios-voip` row for
            // the user would silently stop calls ringing on their other
            // phones and iPads, none of which have lost anything.
            try await client.from("device_tokens")
                .delete()
                .eq("user_id", value: userId)
                .eq("platform", value: "ios-voip")
                .eq("token", value: token)
                .execute()
        } catch {
            print("voip token cleanup error: \(error)")
        }
    }

    /// Persist the pending VoIP token once a user is signed in
    /// (RPC enforces ownership). Called after sign-in and whenever a token
    /// arrives.
    func flushToken() async {
        guard let token = pendingToken,
              client.auth.currentUser != nil else { return }
        // Already on the server and unchanged: nothing to say.
        if token == registeredToken {
            pendingToken = nil
            return
        }
        do {
            try await client.rpc("register_device_token",
                                 params: [
                                    "p_token": token,
                                    "p_platform": "ios-voip",
                                    "p_app_version": Bundle.main.appVersionDisplay,
                                 ]).execute()
            registeredToken = token
            pendingToken = nil
            PushDiag.log("voip.registered", "prefix=\(token.prefix(8))")
        } catch {
            // Left pending on purpose — the next foreground tries again.
            PushDiag.log("voip.register.failed", "\(error)")
            print("voip token error: \(error)")
        }
    }
}