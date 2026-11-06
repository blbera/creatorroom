#!/usr/bin/env python3
"""Supported Switch 0.31.0 Gateway bootstrap. Never prints credentials."""

import http.cookiejar
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    state = root / ".local"
    state.mkdir(exist_ok=True, mode=0o700)

    def env(path):
        return dict(
            line.split("=", 1)
            for line in path.read_text().splitlines()
            if line and (not line.startswith("#")) and ("=" in line)
        )

    switch_env = env(root / "infra/switch/.env")
    local = env(root / ".env") if (root / ".env").exists() else {}
    jar = http.cookiejar.CookieJar()
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def call(path, body=None):
        req = urllib.request.Request(
            "http://127.0.0.1:8000/gateway" + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with client.open(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as x:
            print("Gateway request failed:", path, "HTTP", x.code, file=sys.stderr)
            sys.exit(1)

    user = call(
        "/auth/login",
        {
            "email": switch_env["GATEWAY_ADMIN_EMAIL"],
            "password": switch_env["GATEWAY_ADMIN_PASSWORD"],
        },
    )
    p = state / "switch-setup.json"
    saved = json.loads(p.read_text()) if p.exists() else {"user_id": user["id"]}

    def save():
        p.write_text(json.dumps(saved, indent=2))
        p.chmod(0o600)

    if not saved.get("registration_key"):
        saved["registration_key"] = call("/api-keys", {"label": "CreatorRoom custom agents"})["key"]
        save()
    manifest = call("/collaborations/setup/slack")["manifest"]
    if isinstance(manifest, str):
        manifest = json.loads(manifest)
    manifest["display_information"]["name"] = "CreatorRoom Switch"
    manifest["features"]["bot_user"]["display_name"] = "CreatorRoom Switch"
    manifest["features"].pop("agent_view", None)
    manifest["oauth_config"]["scopes"]["bot"] = [
        s
        for s in manifest["oauth_config"]["scopes"]["bot"]
        if s not in ["assistant:write", "usergroups:read", "usergroups:write"]
    ]
    (root / "infra/slack-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        "Gateway login verified; creator-owned registration key persisted securely. Release-matched Slack manifest saved."
    )
    if local.get("SLACK_BOT_TOKEN") and local.get("SLACK_APP_TOKEN"):
        checked = call(
            "/collaborations/setup/slack/check",
            {"bot_token": local["SLACK_BOT_TOKEN"], "app_token": local["SLACK_APP_TOKEN"]},
        )
        print(
            "Slack tokens verified by Switch:",
            checked["workspace_name"],
            "(" + checked["workspace_id"] + ")",
            "bot:",
            checked["bot_name"],
        )
        if not local.get("SLACK_TEAM_ID"):
            local["SLACK_TEAM_ID"] = checked["workspace_id"]
            appenv = root / ".env"
            text = appenv.read_text()
            if re.search("^SLACK_TEAM_ID=", text, re.M):
                text = re.sub(
                    "^SLACK_TEAM_ID=.*$",
                    "SLACK_TEAM_ID=" + checked["workspace_id"],
                    text,
                    flags=re.M,
                )
            else:
                text += "\nSLACK_TEAM_ID=" + checked["workspace_id"] + "\n"
            appenv.write_text(text)
            appenv.chmod(0o600)
    needed = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_TEAM_ID", "SLACK_USER_ID"]
    if not all(local.get(k) for k in needed):
        print("Slack setup pending. Fill local .env fields: " + ", ".join(needed))
        sys.exit(0)
    if not saved.get("bridge_id"):
        existing = call("/collaborations")
        items = existing if isinstance(existing, list) else existing.get("bridges", [])
        matches = [b for b in items if b.get("display_name") == "CreatorRoom demo Slack"]
        if matches:
            saved["bridge_id"] = matches[0]["bridge_id"]
        else:
            b = call(
                "/collaborations",
                {
                    "bridge_type": "slack",
                    "display_name": "CreatorRoom demo Slack",
                    "connection_config": {
                        "bot_token": local["SLACK_BOT_TOKEN"],
                        "app_token": local["SLACK_APP_TOKEN"],
                        "workspace_id": local["SLACK_TEAM_ID"],
                        "agent_usergroups": False,
                        "event_delivery": "socket_mode",
                    },
                    "channel_creation_enabled": False,
                    "set_as_default": True,
                },
            )
            saved["bridge_id"] = b["bridge_id"]
        save()
    directory = call(
        "/collaborations/"
        + saved["bridge_id"]
        + "/directory?query="
        + urllib.parse.quote(local.get("SLACK_USERNAME") or "b")
    )
    people = directory.get("users", []) if isinstance(directory, dict) else directory
    person = next((p for p in people if p.get("external_user_id") == local["SLACK_USER_ID"]), None)
    if not person and (not local.get("SLACK_USERNAME")):
        print(
            "Set SLACK_USERNAME to your actual Slack display/name, or speak once in the designated channel after inviting the app."
        )
        sys.exit(0)
    username = local.get("SLACK_USERNAME") or person.get("username") or person.get("display_name")
    linked = call(
        "/collaborations/" + saved["bridge_id"] + "/identities",
        {"external_user_id": local["SLACK_USER_ID"], "username": username},
    )
    saved["linked_identity"] = linked
    save()
    print(
        "Slack bridge configured; creator identity linked. Invite the app only to the designated demo channel."
    )


if __name__ == "__main__":
    main()
