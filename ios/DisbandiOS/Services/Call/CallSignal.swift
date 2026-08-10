import Foundation

/// A 1:1 call signaling message, wire-compatible with the desktop app's
/// `CallSignal` (sent as Realtime broadcasts on `call-user:<id>` and
/// `call:<callId>` channels, event "call").
struct CallSignal: Codable, Sendable {
    /// "ring" | "accept" | "reject" | "cancel" | "offer" | "answer" | "ice" | "leave"
    var type: String
    var from: String
    var to: String?
    var callId: String?
    var callerName: String?
    var rejecterName: String?
    var sdp: CallSdp?
    var candidate: CallIceCandidate?
}

/// Mirrors `RTCSessionDescriptionInit` JSON ({ type, sdp }).
struct CallSdp: Codable, Sendable {
    var type: String
    var sdp: String
}

/// Mirrors `RTCIceCandidateInit` JSON ({ candidate, sdpMLineIndex, sdpMid }).
struct CallIceCandidate: Codable, Sendable {
    var candidate: String
    var sdpMLineIndex: Int32
    var sdpMid: String?
}

/// Deterministic, order-independent call id shared by both peers
/// (mirrors `directCallId` in the web app).
func directCallId(_ a: String, _ b: String) -> String {
    [a, b].sorted().joined(separator: ":")
}
