#!/usr/bin/env python3
"""App Store Connect helper for SendPalm.

Credentials are the same team key Remote Crab / MDDock use:
`~/.config/mddock/ios-release.env` (APPLE_API_KEY, APPLE_API_ISSUER,
APPLE_API_KEY_PATH, APPLE_TEAM_ID). Override the path with
SENDPALM_ASC_ENV.

Usage:
    scripts/asc.py whoami                 # team + app list (read-only)
    scripts/asc.py bundle-ids             # find/register com.sendpalm.app
    scripts/asc.py create-app             # create the ASC app record
    scripts/asc.py app                    # show the app record if it exists
    scripts/asc.py metadata <json>        # push store metadata for a version
    scripts/asc.py builds                 # recent build uploads

The App Store Connect API cannot create an app record (`POST /v1/apps` is not
part of the public API). `create-app` therefore reports exactly what Apple
answers, so the caller knows whether to fall back to the web UI.
"""

import argparse
import base64
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# App Store Connect refuses local auto-detected proxies (common in CN dev
# environments). Force direct connections, like the other projects do.
os.environ["no_proxy"] = "appstoreconnect.apple.com," + os.environ.get("no_proxy", "")
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE_ID = "com.sendpalm.app"
APP_NAME = "SendPalm"
SKU = "sendpalm"
DEFAULT_ENV = Path.home() / ".config" / "mddock" / "ios-release.env"


def load_env() -> None:
    env_file = Path(os.environ.get("SENDPALM_ASC_ENV", DEFAULT_ENV))
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k, os.path.expandvars(v))
    missing = [
        k
        for k in ("APPLE_API_KEY", "APPLE_API_ISSUER", "APPLE_API_KEY_PATH")
        if not os.environ.get(k)
    ]
    if missing:
        sys.exit(f"missing ASC credentials: {missing} (see {env_file})")


def b64url(data) -> str:
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def der_to_raw(der: bytes) -> bytes:
    assert der[0] == 0x30
    idx = 2
    assert der[idx] == 0x02
    r_len = der[idx + 1]
    r = der[idx + 2 : idx + 2 + r_len]
    idx = idx + 2 + r_len
    assert der[idx] == 0x02
    s_len = der[idx + 1]
    s = der[idx + 2 : idx + 2 + s_len]
    if len(r) == 33 and r[0] == 0:
        r = r[1:]
    if len(s) == 33 and s[0] == 0:
        s = s[1:]
    return r.rjust(32, b"\x00") + s.rjust(32, b"\x00")


def jwt_token() -> str:
    key_path = os.environ["APPLE_API_KEY_PATH"]
    key_id = os.environ["APPLE_API_KEY"]
    issuer_id = os.environ["APPLE_API_ISSUER"]
    now = int(time.time()) - 60
    header = b64url('{"alg":"ES256","kid":"%s","typ":"JWT"}' % key_id)
    payload = b64url(
        '{"iss":"%s","iat":%s,"exp":%s,"aud":"appstoreconnect-v1"}'
        % (issuer_id, now, now + 900)
    )
    signing_input = f"{header}.{payload}"
    der = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", key_path],
        input=signing_input.encode(),
        capture_output=True,
        check=True,
    ).stdout
    return f"{signing_input}.{b64url(der_to_raw(der))}"


class Client:
    def __init__(self) -> None:
        self.headers = {
            "Authorization": f"Bearer {jwt_token()}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def call(self, method: str, url: str, data=None) -> dict:
        body = json.dumps(data).encode() if data is not None else None
        last: Exception | None = None
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, data=body, headers=self.headers, method=method)
                ctx = ssl.create_default_context()
                with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
                    raw = r.read().decode()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as e:
                detail = e.read().decode()[:1500]
                print(f"HTTP {e.code} {method} {url}\n{detail}", file=sys.stderr)
                raise
            except Exception as e:  # Apple drops TLS mid-flow under bursts
                last = e
                print(f"  retry {attempt + 1}/5 ({type(e).__name__})", file=sys.stderr)
                time.sleep(2 * (attempt + 1))
        raise last  # type: ignore[misc]

    def get(self, path: str) -> dict:
        return self.call("GET", f"{API}{path}")

    def post(self, path: str, data) -> dict:
        return self.call("POST", f"{API}{path}", data)

    def patch(self, path: str, data) -> dict:
        return self.call("PATCH", f"{API}{path}", data)


def cmd_whoami(c: Client) -> None:
    apps = c.get("/apps?limit=200")
    print(f"team: {os.environ.get('APPLE_TEAM_ID', '?')}  key: {os.environ['APPLE_API_KEY']}")
    print(f"apps: {len(apps.get('data', []))}")
    for a in apps.get("data", []):
        attrs = a["attributes"]
        print(f"  {a['id']}  {attrs.get('bundleId')}  {attrs.get('name')}  sku={attrs.get('sku')}")


def find_bundle_id(c: Client) -> dict | None:
    res = c.get(f"/bundleIds?filter[identifier]={BUNDLE_ID}&limit=5")
    data = res.get("data", [])
    return data[0] if data else None


def find_app(c: Client) -> dict | None:
    res = c.get(f"/apps?filter[bundleId]={BUNDLE_ID}&limit=5")
    data = res.get("data", [])
    return data[0] if data else None


def cmd_bundle_ids(c: Client) -> None:
    found = find_bundle_id(c)
    if found:
        print(f"bundle id registered: {found['id']} {found['attributes'].get('identifier')}")
        return
    print(f"bundle id {BUNDLE_ID} NOT registered in the developer portal.")
    print("  xcodebuild -allowProvisioningUpdates registers it on the next signed build,")
    print("  or it can be added at developer.apple.com → Identifiers.")


def cmd_app(c: Client) -> None:
    app = find_app(c)
    if not app:
        print("no ASC app record for " + BUNDLE_ID)
        return
    print(json.dumps(app, indent=2, ensure_ascii=False))


def cmd_create_app(c: Client) -> None:
    existing = find_app(c)
    if existing:
        print(f"app already exists: {existing['id']}")
        return
    payload = {
        "data": {
            "type": "apps",
            "attributes": {
                "name": APP_NAME,
                "primaryLocale": "en-US",
                "sku": SKU,
                "bundleId": BUNDLE_ID,
            },
        }
    }
    try:
        res = c.post("/apps", payload)
        print(json.dumps(res, indent=2, ensure_ascii=False))
    except urllib.error.HTTPError as e:
        if e.code in (403, 404, 405):
            print(
                "\nThe public API cannot create app records (Apple only allows this in the "
                "web UI). Fall back to https://appstoreconnect.apple.com → 我的 App → +.",
                file=sys.stderr,
            )
        raise


def cmd_builds(c: Client) -> None:
    app = find_app(c)
    if not app:
        sys.exit("no app record — run create-app first")
    res = c.get(f"/builds?filter[app]={app['id']}&limit=10&sort=-uploadedDate")
    for b in res.get("data", []):
        a = b["attributes"]
        print(f"  {b['id']}  {a.get('version')}  {a.get('processingState')}  {a.get('uploadedDate')}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=["whoami", "bundle-ids", "app", "create-app", "builds"],
    )
    args = parser.parse_args()
    load_env()
    c = Client()
    {
        "whoami": cmd_whoami,
        "bundle-ids": cmd_bundle_ids,
        "app": cmd_app,
        "create-app": cmd_create_app,
        "builds": cmd_builds,
    }[args.command](c)


if __name__ == "__main__":
    main()
