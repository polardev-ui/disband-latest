package com.wsgpolar.disband.data

/**
 * Whoever shows this conversation suppresses its notification banner, mirroring
 * iOS `ActiveChat`.
 *
 * The key is the bare row id — the DM thread, group or channel — because that
 * is what the push payload's `source` carries. Prefixing it ("dm:", "group:",
 * "channel:") meant the comparison could never be true and the suppression was
 * dead code: you were notified about the chat you were reading.
 */
object ActiveChat {
    @Volatile
    var source: String? = null
        private set

    fun show(source: String?) {
        this.source = source
    }

    fun clear() {
        source = null
    }

    fun isShowing(source: String?): Boolean = source != null && this.source == source
}

/** Tiny process-wide bridge so the FCM service can reach the running CallManager. */
object CallPushBridge {
    @Volatile
    var calls: com.wsgpolar.disband.call.CallManager? = null
}