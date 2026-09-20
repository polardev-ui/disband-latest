import Foundation

/// One message on a multi-party call's signaling channel, wire-compatible with
/// the web app's `SignalPayload` in `useVoiceChannel.ts` (server voice) and
/// `useGroupCallManager.ts` (group calls).
///
/// Server voice broadcasts on `voice:<channelId>` with event `signal`; group
/// calls on `group-call:<groupId>` with event `group-call`. Rings for a group
/// call go to each member's personal `call-user:<userId>` topic, also with
/// event `group-call`.
///
/// Optional fields are omitted from the JSON when nil, which is what the web
/// expects — it tests `payload.to` for presence, not for null.
struct MeshSignal: Codable, Sendable {
    /// "offer" | "answer" | "ice" | "leave" | "screen" | "ring"
    var type: String
    var from: String
    var to: String?
    var sdp: CallSdp?
    var candidate: CallIceCandidate?
    /// Only on "screen": whether `from` started or stopped sharing.
    var sharing: Bool?
    /// Marks messages from the native iOS app. The web ignores unknown keys;
    /// two iPhones use it to break an offer collision deterministically
    /// (see `VoiceSession.handleOffer`).
    var client: String?

    // "ring" only (group calls).
    var groupId: String?
    var groupName: String?
    var callerName: String?

    static let nativeClient = "ios"
}
