#!/usr/bin/env python3
"""Bind only the explicitly configured demo channel. No messages are posted."""

import http.cookiejar
import json
import pathlib
import subprocess
import sys
import urllib.request
import uuid


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent

    def env(p):
        return dict(
            line.split("=", 1)
            for line in p.read_text().splitlines()
            if line and (not line.startswith("#")) and ("=" in line)
        )

    switch_env = env(root / "infra/switch/.env")
    local = env(root / ".env")
    setup = json.loads((root / ".local/switch-setup.json").read_text())
    agents = json.loads((root / ".local/agents.json").read_text())
    client = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )

    def call(path, body=None):
        req = urllib.request.Request(
            "http://127.0.0.1:8000/gateway" + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Content-Type": "application/json"},
        )
        with client.open(req, timeout=30) as r:
            return json.load(r)

    call(
        "/auth/login",
        {
            "email": switch_env["GATEWAY_ADMIN_EMAIL"],
            "password": switch_env["GATEWAY_ADMIN_PASSWORD"],
        },
    )
    rooms = call("/rooms")
    if "--bind-existing" in sys.argv:
        matched = False
        for summary in rooms:
            candidate = call("/rooms/" + summary["id"])
            if (
                candidate.get("external_channel_id") == local.get("SLACK_CHANNEL_ID")
                and candidate.get("bridge_id") == setup["bridge_id"]
            ):
                matched = True
        if not matched:
            call(
                "/rooms",
                {
                    "name": "k8s-alert",
                    "description": "CreatorRoom designated demo channel",
                    "channel_type": "channel_public",
                    "bridge_id": setup["bridge_id"],
                    "external_channel_id": local["SLACK_CHANNEL_ID"],
                    "agent_ids": [a["id"] for a in agents.values()],
                },
            )
            rooms = call("/rooms")
    for summary in rooms:
        room = call("/rooms/" + summary["id"])
        if (
            room.get("external_channel_id") != local.get("SLACK_CHANNEL_ID")
            or room.get("bridge_id") != setup["bridge_id"]
        ):
            continue
        missing = [a["id"] for a in agents.values() if a["id"] not in room["agent_ids"]]
        if missing:
            call("/rooms/" + room["id"] + "/agents", {"agent_ids": missing})
        if not setup.get("linked_identity"):
            raise SystemExit("Run setup-switch.py to link creator first")

        def sender(kind, resource):
            uuid.UUID(resource)
            table = "agents" if kind == "agent" else "external_users"
            query = f"SELECT c.matrix_user_id FROM {table} r JOIN clients c ON c.id=r.client_id AND c.tenant_id=r.tenant_id WHERE r.id='{resource}';"
            value = subprocess.check_output(
                [
                    str(root / "scripts/switch"),
                    "exec",
                    "-T",
                    "postgres",
                    "psql",
                    "-U",
                    "creatorroom_owner",
                    "-d",
                    "switch",
                    "-At",
                    "-c",
                    query,
                ],
                text=True,
            ).strip()
            if not value:
                raise SystemExit("No authoritative event sender binding found")
            return value

        result = {
            "roomId": room["id"],
            "creatorId": sender("user", setup["linked_identity"]["id"]),
            "producerParticipantId": sender("agent", agents["producer"]["id"]),
            "reviewerParticipantId": sender("agent", agents["reviewer"]["id"]),
        }
        p = root / ".local/room.json"
        p.write_text(json.dumps(result, indent=2))
        p.chmod(0o600)
        print(
            "Demo room linked:", room["name"], "; both agents added. Restart CreatorRoom workers."
        )
        break
    else:
        print(
            "Demo room not found. Invite the existing Slack app into the designated channel and send a message there. No other channels were touched."
        )


if __name__ == "__main__":
    main()
