package com.wsgpolar.disband.data

/** Whoever shows this conversation suppresses its notification banner, mirroring iOS `ActiveChat`. */
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