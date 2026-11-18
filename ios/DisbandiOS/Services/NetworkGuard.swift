import Foundation
import Security
import SwiftUI
import WebKit

/// The server's network-restriction marker (see the web app's
/// network-restriction.server.ts). After a sign-in or sign-up is refused for
/// being rate limited or for a blocked VPN, the answer carries a signed
/// "restricted until" marker; it's kept here and sent with every later
/// attempt, so switching networks doesn't reset the clock.
///
/// Kept in the Keychain, which survives deleting and reinstalling the app,
/// and in UserDefaults; either one restores the other.
enum NetworkRestriction {
    private static let account = "dsb.kv.rk7"
    private static let service = "com.wsgpolar.disband.cache"
    private static let defaultsKey = "dsb_rk7Qx2"

    private static func until(_ token: String) -> Date? {
        guard let body = token.split(separator: ".").first else { return nil }
        var b64 = body.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ms = json["u"] as? Double else { return nil }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    private static func keychainGet() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func keychainSet(_ value: String?) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    private static func writeAll(_ value: String?) {
        keychainSet(value)
        if let value { UserDefaults.standard.set(value, forKey: defaultsKey) }
        else { UserDefaults.standard.removeObject(forKey: defaultsKey) }
    }

    /// The marker this device holds, while it's still running.
    static func current() -> String? {
        let found = [keychainGet(), UserDefaults.standard.string(forKey: defaultsKey)].compactMap { $0 }
        let best = found.max { (until($0) ?? .distantPast) < (until($1) ?? .distantPast) }
        guard let best, let end = until(best), end > Date() else {
            if !found.isEmpty { writeAll(nil) }
            return nil
        }
        if found.count < 2 || found.contains(where: { $0 != best }) { writeAll(best) }
        return best
    }

    /// Keep the marker from a server answer, if it has one.
    static func remember(from data: Data) {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["restriction"] as? String, token.contains("."),
              let end = until(token) else { return }
        if let held = current(), let heldEnd = until(held), heldEnd >= end { return }
        writeAll(token)
    }
}

/// Cloudflare Turnstile, the same check the web and desktop apps show. The
/// page is loaded as if from disband.dev so the site key accepts it; the
/// token comes back through a script message handler.
struct TurnstileView: UIViewRepresentable {
    static let siteKey = "0x4AAAAAADpTEU6IzBC_YVIF"
    let action: String
    let onToken: (String) -> Void
    let onError: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onToken: onToken, onError: onError) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "turnstile")
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        let html = """
        <!doctype html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <style>html,body{margin:0;background:transparent;display:flex;justify-content:center;align-items:center;height:100%}</style>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=go" async defer></script>
        <script>
          function post(kind, value) { window.webkit.messageHandlers.turnstile.postMessage({ kind: kind, value: value || "" }); }
          function go() {
            turnstile.render('#t', {
              sitekey: '\(Self.siteKey)', theme: 'dark', action: '\(action)',
              callback: function (t) { post('token', t); },
              'error-callback': function (c) { post('error', String(c || '')); },
              'expired-callback': function () { post('expired'); }
            });
          }
        </script></head><body><div id="t"></div></body></html>
        """
        web.loadHTMLString(html, baseURL: URL(string: "https://www.disband.dev/verify"))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "turnstile")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onToken: (String) -> Void
        let onError: () -> Void
        init(onToken: @escaping (String) -> Void, onError: @escaping () -> Void) {
            self.onToken = onToken
            self.onError = onError
        }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }
            let value = body["value"] as? String ?? ""
            DispatchQueue.main.async {
                if kind == "token", !value.isEmpty { self.onToken(value) }
                else if kind == "error" { self.onError() }
            }
        }
    }
}

/// The sheet sign-in and sign-up show when the server asks for the check.
struct TurnstileSheet: View {
    let action: String
    let onDone: (String?) -> Void
    @State private var failed = false
    @State private var attempt = 0

    var body: some View {
        VStack(spacing: 16) {
            Text("Quick check")
                .font(.title3.weight(.bold))
                .foregroundStyle(Brand.textPrimary)
            Text("Confirm you're a person to keep going.")
                .font(.subheadline)
                .foregroundStyle(Brand.textMuted)
                .multilineTextAlignment(.center)
            TurnstileView(action: action, onToken: { onDone($0) }, onError: { failed = true })
                .id(attempt)
                .frame(height: 80)
            if failed {
                Button("Try again") {
                    failed = false
                    attempt += 1
                }
                .font(.subheadline.weight(.semibold))
            }
            Button("Cancel", role: .cancel) { onDone(nil) }
                .font(.subheadline)
                .foregroundStyle(Brand.textMuted)
        }
        .padding(24)
        .presentationDetents([.height(300)])
        .presentationBackground(Brand.elevated)
    }
}
