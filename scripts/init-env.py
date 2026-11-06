#!/usr/bin/env python3
"""Create local secret files once; existing files are never overwritten."""

import os
import secrets
from pathlib import Path


def write_once(path: Path, values: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        print(f"Retained existing {path.name}")
        return
    with os.fdopen(descriptor, "w") as output:
        output.write("".join(f"{key}={value}\n" for key, value in values.items()))
    print(f"Created private {path.name}; values were not printed")


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    write_once(
        root / "infra/switch/.env",
        {
            "SWITCH_VERSION": "0.31.0",
            "SWITCH_BIND_ADDR": "127.0.0.1",
            "DB_OWNER_USER": "creatorroom_owner",
            "DB_USER": "creatorroom_runtime",
            "DB_NAME": "switch",
            "DB_OWNER_PASSWORD": secrets.token_hex(32),
            "DB_PASSWORD": secrets.token_hex(32),
            "AGENT_REGISTRATION_TOKEN": secrets.token_hex(32),
            "SECRET_KEYS": "v1:" + secrets.token_hex(32),
            "GATEWAY_ADMIN_EMAIL": "creator@creatorroom.local",
            "GATEWAY_ADMIN_PASSWORD": secrets.token_urlsafe(32),
            "FRONTEND_BASE_URL": "http://localhost:3000",
            "GATEWAY_PUBLIC_URL": "http://localhost:3000",
            "API_HOST_PORT": "8000",
            "GATEWAY_HOST_PORT": "3000",
            "COMPOSE_PROFILES": "gateway",
            "MATTERMOST_USER": "unused",
            "MATTERMOST_USER_PASSWORD": "unused",
            "MATTERMOST_ADMIN_USER": "unused",
            "MATTERMOST_ADMIN_PASSWORD": "unused",
            "MATTERMOST_TEAM_NAME": "unused",
        },
    )
    write_once(
        root / ".env",
        {
            "ANTHROPIC_API_KEY": "",
            "ANTHROPIC_MODEL": "claude-haiku-4-5-20251001",
            "SLACK_BOT_TOKEN": "",
            "SLACK_APP_TOKEN": "",
            "SLACK_TEAM_ID": "",
            "SLACK_CHANNEL_ID": "",
            "SLACK_USER_ID": "",
            "SLACK_USERNAME": "",
            "APP_BASE_URL": "http://localhost:4173",
        },
    )
    (root / ".local/app").mkdir(parents=True, exist_ok=True, mode=0o700)


if __name__ == "__main__":
    main()
