package com.wsgpolar.disband.call

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Deterministic shared call id, mirroring iOS `CallSignal.directCallId`. */
fun directCallId(a: String, b: String): String =
    listOf(a, b).sorted().joinToString(":")

/**
 * Wire-compatible with the iOS `CallSignal` (and the web `useCallManager`).
 * The entire object is the Realtime broadcast payload on event `"call"`.
 *
 * `type` ∈ ring | accept | reject | cancel | handled | leave | offer | answer | ice
 */
@Serializable
data class CallSignal(
    val type: String,
    val from: String,
    val to: String? = null,
    @SerialName("callId") val callId: String? = null,
    @SerialName("callerName") val callerName: String? = null,
    @SerialName("rejecterName") val rejecterName: String? = null,
    val sdp: CallSdp? = null,
    val candidate: CallIceCandidate? = null,
)

/** Mirrors `RTCSessionDescriptionInit` JSON ({ type, sdp }). */
@Serializable
data class CallSdp(
    val type: String,
    val sdp: String,
)

/** Mirrors `RTCIceCandidateInit` JSON. */
@Serializable
data class CallIceCandidate(
    val candidate: String,
    @SerialName("sdpMLineIndex") val sdpMLineIndex: Int,
    @SerialName("sdpMid") val sdpMid: String? = null,
)