# CreatorRoom

A creator’s editorial team in Slack, powered by Switch: source-grounded content packs and navigable video sections.

CreatorRoom takes a creator-owned YouTube URL and matching uploaded SRT/VTT transcript. Producer proposes two angles, drafts a versioned pack, and addresses Reviewer through Switch. The creator requests selective revisions and approves an exact version in Slack. The web workspace provides transcript search, source evidence, section navigation, version comparison, and Markdown, chapter-text, and JSON exports.

## Current state

Development scaffold with implemented workflow code and deterministic tests. Switch 0.31.0 and PostgreSQL are deployed locally and healthy; browser Gateway returns HTTP 200. Producer and Reviewer are registered. The Slack Socket Mode bridge is active and the creator identity is linked. Anthropic authentication and Haiku availability are verified.

**Not demo-ready:** live Slack agent round trips, model generation/review, revision/approval, real YouTube seeking, browser acceptance, and full app container deployment remain to be verified. The fixture is original text with no unrelated video attached.

## Local development

Requires Node.js 24+, Python 3, Docker with Compose, an Anthropic API key, and an editable Slack custom app. No Switch Console or Mattermost is required.

```sh
npm ci
npm test
npm run build
npm start
```

The app listens at http://localhost:4173. Run `npx tsx scripts/seed.ts` for an explicitly labeled fixture. Fixture mode makes no model or Slack calls.

Environment files are intentionally excluded from this repository. Create a local `.env` with `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-haiku-4-5-20251001`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_TEAM_ID`, `SLACK_CHANNEL_ID`, and `SLACK_USER_ID`. Optional settings: `SLACK_USERNAME`, `SWITCH_URL` (default http://127.0.0.1:8000), `APP_HOST` (default 127.0.0.1), `APP_PORT` (default 4173), `APP_BASE_URL` (default http://localhost:4173), and `DATA_DIR` (default .local/app). Never put credentials in browser build variables.

`npm run models` lists available models without requesting generation. The app verifies the configured identifier before generation. Use Haiku and a small original source while developing; no automated paid smoke runs are included.

Switch infrastructure is pinned to released server 0.31.0. Create `infra/switch/.env` locally with `SWITCH_VERSION=0.31.0`, `DB_OWNER_USER=creatorroom_owner`, `DB_USER=creatorroom_runtime`, `DB_NAME=switch`, independent random database passwords, `AGENT_REGISTRATION_TOKEN`, `SECRET_KEYS=v1:<random-secret-at-least-32-characters>`, `GATEWAY_ADMIN_EMAIL`, `GATEWAY_ADMIN_PASSWORD`, and `FRONTEND_BASE_URL=http://localhost:3000`. Keep it mode 0600; retain the keys and fixed server identity across restarts.

```sh
./scripts/switch config --quiet
./scripts/switch up -d
./scripts/switch ps
npm run switch:setup
npm run agents:register
```

Gateway is http://localhost:3000; Switch is http://localhost:8000. PostgreSQL is not published. Only the Gateway profile is enabled. Stop with `./scripts/switch stop`; volumes persist. Never use `down -v` for routine troubleshooting.

Reuse your Slack app, comparing its settings with `infra/slack-manifest.json`. Enable Socket Mode and Interactivity, generate an app-level token with `connections:write`, and retain its bot OAuth token. Invite the app only to the dedicated channel. After setting your team/channel/member IDs locally, run `npm run switch:setup` to check tokens and link your identity, then `python3 scripts/link-room.py` to attach both agents. Restart the app afterward. No incoming webhook, public tunnel, Console, or Mattermost is required.

Back up PostgreSQL with `pg_dump -Fc`, SQLite using its backup API or while the app is stopped, uploaded sources, and the original secret/identity files. Keep backups private and ignored. Restore into a separate isolated deployment first with the same server identity and master keys.

Official contracts: [Switch self-hosting](https://docs.switchagents.ai/switch-rooms/deploy/self-host), [Slack](https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/slack), [agent protocol](https://docs.switchagents.ai/switch-rooms/internals/agent-protocol), and [YouTube Player API](https://developers.google.com/youtube/iframe_api_reference). The upstream Compose YAML is preserved; project changes are isolated in its override.

## Workflow commands

In the designated channel: `@producer ping`, `@producer project <id> brief`, `@producer angle 1`, `@producer revise linkedin make the opening more direct`, `@producer approve v2`. Include `project <id>` before a command when the room has several projects. Commands are typed handles supported by Switch, including free Slack plans.

CreatorRoom never posts through an incoming webhook or independent Slack bot. Reviewer work must be triggered by Producer’s addressed Switch request. Approval checks compare the configured human identity, room, and exact current version in application code.

## Limits

Claims are supported by the supplied transcript, not independently fact-checked. X length checks use a conservative character budget, not platform-weighted counting. CreatorRoom sections navigate the embedded player; they do not enable native YouTube chapters. Localhost links open only on the host computer. The local app is intended for a trusted local demo, not public hosting.

The public repository contains source only. Judges still need reproducible setup, their own credentials or supervised demo access, and a recording of the verified end-to-end workflow before submission. No registration, submission, or social content has been published automatically.
