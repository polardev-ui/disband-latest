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
        pendingToken = nil
        Task { await deleteStoredToken() }
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

    /**
     Remove this device's VoIP token from the server.

     Left behind, the server keeps sending VoIP pushes to a device that has
     just stopped being able to answer one — which is the exact situation that
     gets an app terminated. RLS lets a user delete their own tokens, so no
     privileged call is needed.
     */
    private func deleteStoredToken() async {
        guard let userId = client.auth.currentUser?.id.uuidString.lowercased() else { return }
        do {
            try await client.from("device_tokens")
                .delete()
                .eq("user_id", value: userId)
                .eq("platform", value: "ios-voip")
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
        do {
            try await client.rpc("register_device_token",
                                 params: ["p_token": token, "p_platform": "ios-voip"]).execute()
            pendingToken = nil
        } catch {
            print("voip token error: \(error)")
        }
    }
}