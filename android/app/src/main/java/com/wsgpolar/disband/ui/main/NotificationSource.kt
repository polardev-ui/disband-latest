package com.wsgpolar.disband.ui.main

/**
 * Turn a notification row's link into the bare id `resolve_notification_source`
 * accepts.
 *
 * Inbox rows keep their kind (`channel:<uuid>`, `dm:<uuid>`, `/group/<uuid>`),
 * while push payloads carry a bare uuid. Passing the row straight through made
 * the resolver reject it as a non-UUID, so tapping an inbox row closed the
 * sheet and navigated nowhere.
 */
internal fun notificationSourceId(source: String): String {
    val trimmed = source.trim()
    for (prefix in listOf("channel:", "dm:", "group:", "/group/", "group/")) {
        if (trimmed.startsWith(prefix)) return trimmed.removePrefix(prefix)
    }
    return trimmed
}
