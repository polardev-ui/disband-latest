package com.wsgpolar.disband.core

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject
import java.io.File

/**
 * The server's network-restriction marker (see the web app's
 * network-restriction.server.ts): after a sign-in or sign-up is refused for a
 * rate limit or a blocked VPN, the answer carries a signed "restricted until"
 * marker. It's kept here and sent with every later attempt, so switching
 * networks doesn't reset the clock. Kept in preferences (restored by Android
 * backup on reinstall) and a private file; either restores the other.
 */
object NetworkRestriction {
    private const val PREFS = "dsb_kv_cache"
    private const val KEY = "rk7Qx2"
    private const val FILE = ".dsb_kv3"

    private fun until(token: String): Long {
        val body = token.substringBefore('.')
        return try {
            val json = String(Base64.decode(body, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP))
            JSONObject(json).optLong("u", 0L)
        } catch (_: Exception) {
            0L
        }
    }

    private fun writeAll(context: Context, value: String?) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (value == null) prefs.remove(KEY) else prefs.putString(KEY, value)
        prefs.apply()
        val file = File(context.filesDir, FILE)
        runCatching { if (value == null) file.delete() else file.writeText(value) }
    }

    /** The marker this device holds, while it's still running. */
    fun current(context: Context): String? {
        val found = listOfNotNull(
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null),
            runCatching { File(context.filesDir, FILE).takeIf { it.exists() }?.readText() }.getOrNull(),
        ).filter { it.isNotBlank() }
        val best = found.maxByOrNull { until(it) }
        if (best == null || until(best) <= System.currentTimeMillis()) {
            if (found.isNotEmpty()) writeAll(context, null)
            return null
        }
        if (found.size < 2 || found.any { it != best }) writeAll(context, best)
        return best
    }

    /** Keep the marker from a server answer, if it has one. */
    fun remember(context: Context, body: String) {
        val token = runCatching { JSONObject(body).optString("restriction", "") }.getOrDefault("")
        if (!token.contains('.')) return
        val held = current(context)
        if (held != null && until(held) >= until(token)) return
        writeAll(context, token)
    }
}

private const val TURNSTILE_SITE_KEY = "0x4AAAAAADpTEU6IzBC_YVIF"

/**
 * Cloudflare Turnstile, the same check the web and desktop apps show. Loaded
 * as if from disband.dev so the site key accepts it; the token comes back
 * through a JavaScript interface.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TurnstileDialog(action: String, onDone: (String?) -> Unit) {
    var failed by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text("Quick check") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Confirm you're a person to keep going.")
                key(attempt) {
                    AndroidView(
                        modifier = Modifier.fillMaxWidth().height(84.dp),
                        factory = { ctx ->
                            WebView(ctx).apply {
                                setBackgroundColor(Color.TRANSPARENT)
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                addJavascriptInterface(object {
                                    @JavascriptInterface
                                    fun token(value: String) { post { onDone(value) } }
                                    @JavascriptInterface
                                    fun error(@Suppress("UNUSED_PARAMETER") code: String) { post { failed = true } }
                                }, "DisbandTurnstile")
                                val html = """
                                    <!doctype html><html><head>
                                    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
                                    <style>html,body{margin:0;padding:0;background:transparent}#t{display:flex;justify-content:center;padding-top:4px}</style>
                                    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=go" async defer></script>
                                    <script>
                                      function go() {
                                        turnstile.render('#t', {
                                          sitekey: '$TURNSTILE_SITE_KEY', theme: 'dark', action: '$action',
                                          callback: function (t) { DisbandTurnstile.token(t); },
                                          'error-callback': function (c) { DisbandTurnstile.error(String(c || '')); }
                                        });
                                      }
                                    </script></head><body><div id="t"></div></body></html>
                                """.trimIndent()
                                loadDataWithBaseURL("https://www.disband.dev/verify", html, "text/html", "utf-8", null)
                            }
                        },
                    )
                }
                if (failed) {
                    TextButton(onClick = { failed = false; attempt += 1 }) { Text("Try again") }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("Cancel") } },
    )
}
