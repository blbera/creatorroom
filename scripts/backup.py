#!/usr/bin/env python3
"""Create a private, consistent backup without stopping the application."""

import datetime as dt
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    settings = dict(
        line.split("=", 1)
        for line in (root / "infra/switch/.env").read_text().splitlines()
        if line and not line.startswith("#") and "=" in line
    )
    timestamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%S%fZ")
    target = root / "backups" / timestamp
    target.mkdir(parents=True, mode=0o700)
    os.chmod(target.parent, 0o700)
    with (target / "switch.dump").open("wb") as output:
        subprocess.run(
            [
                str(root / "scripts/switch"),
                "exec",
                "-T",
                "postgres",
                "pg_dump",
                "-U",
                settings["DB_OWNER_USER"],
                "-d",
                settings["DB_NAME"],
                "-Fc",
            ],
            stdout=output,
            check=True,
        )
    source = sqlite3.connect(f"file:{root / '.local/app/creatorroom.sqlite'}?mode=ro", uri=True)
    destination = sqlite3.connect(target / "creatorroom.sqlite")
    with destination:
        source.backup(destination)
    source.close()
    destination.close()
    for relative, name in [
        (".env", "app.env"),
        ("infra/switch/.env", "switch.env"),
        (".local/agents.json", "agents.json"),
        (".local/room.json", "room.json"),
        (".local/switch-setup.json", "switch-setup.json"),
    ]:
        shutil.copy2(root / relative, target / name)
    uploads = root / ".local/app/uploads"
    if uploads.exists():
        shutil.copytree(uploads, target / "uploads")
    hashes = {
        str(path.relative_to(target)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in target.rglob("*")
        if path.is_file()
    }
    (target / "manifest.json").write_text(json.dumps(hashes, indent=2) + "\n")
    for path in target.rglob("*"):
        path.chmod(0o700 if path.is_dir() else 0o600)
    print(f"Private backup created: backups/{timestamp}")
    print("Contains credentials and source content. Keep it offline; never commit or share it.")


if __name__ == "__main__":
    main()
