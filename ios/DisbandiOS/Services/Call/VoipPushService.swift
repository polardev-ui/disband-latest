import Foundation
import PushKit
import Supabase

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
    private var pendingToken: String?

    private var client: SupabaseClient { SupabaseManager.client }

    /// Start listening for VoIP pushes. Called once at launch; tokens are
    /// flushed to the server as soon as a user is signed in.
    func start() {
        guard registry == nil else { return }
        PushDiag.log("voip.start", "pushing registry up")
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.registry = registry
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

    /// Persist the pending VoIP token once a user is signed in
    /// (RPC enforces ownership). Called after sign-in and whenever a token
    /// arrives.
    func flushToken() async {
        guard let token = pendingToken,
              client.auth.currentUser != nil else { return }
        do {
            try await client.rpc("register_device_token",
                                 params: ["p_token": token, "p_platform": "ios-voip"]).execute()
            pendingToken = nil
        } catch {
            print("voip token error: \(error)")
        }
    }
}