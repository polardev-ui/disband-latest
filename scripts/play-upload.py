"""Upload an Android release to Google Play, no clicking in Play Console.

Uses the Firebase service account (android/service-account.json, git-ignored),
which has release access to Disband in Play Console (Users and permissions).

  cd android && ./gradlew :app:bundleRelease
  python3 ../scripts/play-upload.py service-account.json tracks
  python3 ../scripts/play-upload.py service-account.json upload \
      app/build/outputs/bundle/release/app-release.aab production "• What changed"

Bump versionCode/versionName in android/app/build.gradle.kts first. With
managed publishing off, a production release goes to review and then live by
itself. Never prints the key.
"""
import json, time, base64, sys, urllib.request, urllib.error
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

PKG = "com.wsgpolar.disband"
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PKG}"
UPLOAD = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PKG}"

def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=")

def token(sa_path):
    sa = json.load(open(sa_path))
    now = int(time.time())
    header = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64(json.dumps({"iss": sa["client_email"], "scope": "https://www.googleapis.com/auth/androidpublisher",
                             "aud": sa["token_uri"], "iat": now, "exp": now + 3600}).encode())
    key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
    sig = b64(key.sign(header + b"." + claims, padding.PKCS1v15(), hashes.SHA256()))
    body = f"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion={(header+b'.'+claims+b'.'+sig).decode()}".encode()
    r = urllib.request.urlopen(urllib.request.Request(sa["token_uri"], data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}))
    return json.load(r)["access_token"]

def call(tok, method, url, data=None, ctype="application/json"):
    if isinstance(data, (dict, list)): data = json.dumps(data).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Bearer {tok}", "Content-Type": ctype})
    try:
        r = urllib.request.urlopen(req, timeout=600)
        txt = r.read()
        return r.status, (json.loads(txt) if txt else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:800]

if __name__ == "__main__":
    sa, cmd = sys.argv[1], sys.argv[2]
    tok = token(sa)
    if cmd == "tracks":
        s, edit = call(tok, "POST", f"{API}/edits", {})
        if s != 200: print("edit failed", s, edit); sys.exit(1)
        s, tracks = call(tok, "GET", f"{API}/edits/{edit['id']}/tracks")
        print(s, json.dumps(tracks, indent=1)[:3000])
        call(tok, "DELETE", f"{API}/edits/{edit['id']}")
    elif cmd == "upload":
        aab, track, notes = sys.argv[3], sys.argv[4], sys.argv[5]
        s, edit = call(tok, "POST", f"{API}/edits", {})
        if s != 200: print("edit failed", s, edit); sys.exit(1)
        eid = edit["id"]
        s, b = call(tok, "POST", f"{UPLOAD}/edits/{eid}/bundles?uploadType=media", open(aab, "rb").read(), "application/octet-stream")
        print("bundle", s, b if s != 200 else b.get("versionCode"))
        if s != 200: sys.exit(1)
        vc = b["versionCode"]
        s, t = call(tok, "PUT", f"{API}/edits/{eid}/tracks/{track}", {"track": track, "releases": [{
            "versionCodes": [str(vc)], "status": "completed",
            "releaseNotes": [{"language": "en-US", "text": notes}]}]})
        print("track", s, t if s != 200 else "ok")
        if s != 200: sys.exit(1)
        s, c = call(tok, "POST", f"{API}/edits/{eid}:commit")
        print("commit", s, c)
