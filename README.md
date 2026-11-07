# CreatorRoom

### Your editorial team in Slack. Every draft connected to its source.

Turning one video into a description, social posts, and a newsletter means repeating the same work—and checking that each draft still says what you actually said. **CreatorRoom brings a Producer, a Reviewer, and the creator into one editorial workflow through Switch.**

Upload your video's transcript, choose a creative angle in Slack, and get a content pack with timestamped source evidence. Request a focused revision, inspect the review, and approve the exact version you want to use.

**Built for solo creators · Powered by Switch + Claude · Runs with Docker Compose**

[The workflow](#the-workflow) · [Architecture](#architecture) · [Run locally](#run-locally) · [Development](#development)

## What you can do

| Capability | What it gives the creator |
| --- | --- |
| **One video, five outputs** | A YouTube description, X thread, LinkedIn post, newsletter, and timestamped navigation sections. |
| **Choose before generating** | Producer proposes two creative angles from your Slack brief and waits for your choice. |
| **Review against the source** | Reviewer reads the original transcript and returns findings linked to source segments. Select evidence to jump to that moment in the video. |
| **Revise only what needs work** | Rewrite one format or fix a named finding. Chapter revisions keep navigation and the description timestamp block together. |
| **Keep editorial control** | Compare immutable content versions, record a reason for accepting a model finding, and approve an exact reviewed version in Slack. |
| **Preserve project context** | Creator-confirmed terminology guides future writing; recorded editorial history shows the brief, chosen angle, and decisions. |
| **Take the work with you** | Download Markdown, chapter text, or JSON. Publication stays with the creator. |

**No native YouTube chapter access needed.** Clickable sections use the official YouTube embed in CreatorRoom. They do not require your channel to support native chapters.

## The workflow

1. **Bring the source.** Create a project with an HTTPS YouTube URL, confirmed duration, matching SRT/VTT transcript, and audience/tone preferences.
2. **Set the direction in Slack.** Brief Producer and choose one of its two proposed angles.
3. **Let the agents collaborate.** Producer drafts the pack and addresses Reviewer through Switch. Reviewer checks the original transcript and all generated assets.
4. **Inspect and refine.** Use the web workspace to watch source moments, search the transcript, compare versions, and inspect findings. Request changes in Slack.
5. **Approve and export.** The linked creator approves the current exact version after review and validation. Export the pack for publication.

A typical start:

```text
@producer brief Focus on the practical lesson for beginners.
@producer angle 1
@producer revise linkedin Make the opening more direct and practical.
```

Other commands, used when needed:

| Command | Effect |
| --- | --- |
| `@producer revise chapters Split the longest section at the next topic change.` | Creates a version with revised sections and a matching description timestamp block. |
| `@producer fix F1 v5` | Revises the asset identified by finding F1 in the current v5 and requests another review. |
| `@producer accept F1 v5 This is explicitly labelled as my personal opinion.` | Records a version-specific creator decision about a model finding. It does not approve the pack or waive deterministic errors. |
| `@producer glossary "Falco DB" => "FalkorDB"` | Records a confirmed project term for future generation. Request an asset revision to apply it. |
| `@producer approve v6` | Approves v6 only if it is the current reviewed version and its approval checks pass. |
| `@producer help` | Lists supported commands. |

Version numbers above are examples, not a sequence to paste. Use the workspace's version-specific copyable commands. If multiple projects share a room, insert `project <id>` before the command.

The web workspace supports source navigation and editorial inspection; the creative conversation and approval happen in Slack.

## Architecture

![CreatorRoom architecture: Slack collaboration through Switch, Producer and Reviewer, Claude, and a source-linked web workspace](docs/assets/creatorroom-architecture.png)

Docker Compose runs Switch, PostgreSQL, Gateway, and CreatorRoom locally. CreatorRoom serves the React workspace and runs both agents in one Node.js process with a single SQLite writer. Model requests go from the application server to Anthropic; credentials stay server-side.

[Architecture details](docs/architecture.md) · [Editable SVG](docs/assets/creatorroom-architecture.svg)

### Why Switch is central

**Creator in Slack → Switch → Producer → Switch → Reviewer → Switch → Slack**

| Switch responsibility | How CreatorRoom uses it |
| --- | --- |
| Slack bridge | Receives creator messages through Socket Mode and carries agent replies back to Slack. |
| Agent identities and addressed messages | Producer and Reviewer use separate creator-owned identities and API keys. A real addressed Switch event triggers review. |
| Rooms and identity policy | Bind collaboration to the configured room and linked human creator. CreatorRoom validates those identities before accepting approval. |
| Shared documents | Producer owns the brief/pack document; Reviewer owns its review document. Each updates only its own document. |

Removing Switch breaks the collaboration path. There is no separate Slack receiver or direct application callback standing in for the agent-to-agent handoff.

## Run locally

**Requirements:** Docker with Compose, Node.js 24+ for local tooling, Python 3.11+, an Anthropic API key, a Slack custom app you can edit, and your own video with a matching transcript.

The stack uses Slack Socket Mode, so it needs no public tunnel or inbound webhook. Switch Console, Mattermost, and Redis are not required.

### 1. Install and start Switch

```sh
npm ci
python3 scripts/init-env.py
./scripts/switch up -d --wait
```

The initializer creates local mode-0600 `.env` files without overwriting existing ones. Keep the generated database/master keys and `creatorroom.local` identity stable after initial deployment. Real environment files, runtime data, and recording notes stay out of Git.

### 2. Configure local credentials

Fill the root `.env`:

| Setting | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic API credential. |
| `ANTHROPIC_MODEL` | An available model identifier; the demo used `claude-haiku-4-5-20251001`. |
| `SLACK_BOT_TOKEN` | Bot OAuth token (`xoxb…`) used during Switch setup. |
| `SLACK_APP_TOKEN` | App-level token (`xapp…`) with `connections:write`. |
| `SLACK_TEAM_ID` | Workspace ID (`T…`). |
| `SLACK_CHANNEL_ID` | Dedicated collaboration channel ID. |
| `SLACK_USER_ID` | Creator's member ID (`U…`). |
| `SLACK_USERNAME` | Actual Slack handle for identity directory matching. |

Run `npm run models` to check authentication and list available model identifiers without generating content. Generation uses the official Anthropic SDK with schema-validated output.

### 3. Connect Slack and register the agents

Create an app from [the Slack manifest](infra/slack-manifest.json), or compare it against an existing app you can edit. One Slack app presents both agents under individual display names.

1. Enable **Socket Mode** and **Interactivity**. Generate an app-level token with `connections:write` under Basic Information.
2. Enable **Event Subscriptions** and the manifest's bot message events, including `message.channels` for a public channel. Compare scopes and commands; save and reinstall after permission changes.
3. Copy the bot token from OAuth & Permissions and record the workspace, channel, and creator IDs in your local `.env`.
4. Configure Switch and register both agents:

   ```sh
   npm run switch:setup
   npm run agents:register
   ```

5. Invite the app into the designated channel and send a message, then bind the room:

   ```sh
   python3 scripts/link-room.py
   ```

If the app joined before Switch started and no room is found, use `python3 scripts/link-room.py --bind-existing` to bind the configured channel through the supported Gateway API. The manifest follows the pinned Switch release, with unused Agents and optional paid user-group autocomplete declarations removed.

### 4. Start CreatorRoom

```sh
./scripts/start
```

Open **[localhost:4173](http://localhost:4173)**. In the configured Slack channel, send `@producer ping`: Producer should answer, address Reviewer through Switch, and Reviewer should reply. Type the handle as plain text if Slack does not offer autocomplete.

Create a project in the web workspace and begin the editorial workflow. Transcript uploads accept matching SRT/VTT files up to 2 MiB.

<details>
<summary><strong>Service addresses, persistence, and operations</strong></summary>

| Service | Host address | Container address |
| --- | --- | --- |
| CreatorRoom web/API | http://localhost:4173 | creatorroom:4173 |
| Switch API | http://localhost:8000 | switch:8000 |
| Browser Gateway | http://localhost:3000 | gateway:3000 |
| PostgreSQL | Not published | postgres:5432 |

Host ports bind to `127.0.0.1`. `creatorroom-switch` runs the upstream services; `creatorroom-app` runs the application on the shared network. Only the Gateway profile is enabled. The upstream Compose file is preserved with a small override for database port, identity, restart, and health behavior. Native ARM64 images avoid emulation; the Node base image is pinned by digest.

`.local/app` holds SQLite and original uploads. Agent and room configuration are read-only mounts. The app receives the model secret and Slack team/channel identifiers; Switch stores Slack bridge tokens using its supported encrypted configuration. Private content and secrets are excluded from the image build context.

```sh
./scripts/status
./scripts/diagnostics
./scripts/stop
./scripts/start
```

`/api/ready` checks the database, both worker sockets, and Switch health. Startup retries are bounded. Normal stops preserve data. Avoid `down -v`, resource pruning, or a second application writer alongside Docker. Diagnostics do not dump secrets or raw logs.

</details>

## Editorial guarantees and limits

- **Approval belongs to the creator.** It requires the linked human, correct room, current exact version, completed review, passing deterministic checks, and no unresolved blocking Reviewer findings. Agents and transcript text cannot approve.
- **Revisions preserve the record.** Generated content versions are immutable. A new version needs its own review and approval; finding acceptance decisions do not transfer. Reasons require at least eight characters and cannot waive deterministic errors.
- **Review stays connected to the source.** Source-reference and direct-quote checks are deterministic. Reviewer rechecks every asset; blocking findings on unchanged content carry forward. Review means *supported by the transcript*, not independently fact-checked.
- **Terminology is creator-confirmed.** Project glossary entries guide new writing without rewriting original captions, historical packs, or verbatim quotations. ASR errors can still need correction.
- **History records actual actions.** New versions retain the creator direction and chosen angle. Editorial history includes recorded decisions, times, and Switch message IDs; older conversations are not retroactively reconstructed.
- **Navigation works inside CreatorRoom.** The official YouTube embed retains its controls and offers a fallback link on playback errors. Seeking is not frame precise and does not force paused playback to start. Native channel chapters, clip rendering, automatic social publishing, and cross-project preference learning are outside this version.

<details>
<summary><strong>Content validation and delivery behavior</strong></summary>

Chapter validation requires a first start at `00:00`, ascending starts within video bounds, at least three entries, and at least ten seconds per section including the last. Invalid chapter revisions are rejected before saving. The X thread uses 5–7 posts with a conservative 270-character budget, not platform-weighted validation. LinkedIn targets 150–250 words; the newsletter targets 250–400.

Original transcripts are retained and their contents treated as untrusted input. Quote metadata is reserved for verbatim text present in the asset. Evidence links refer to original source segments. Slack receives readable summaries and local artifact links; shared document references do not grant external credentials.

Events are persisted before cursor acknowledgement and deduplicated by source message ID. Heartbeats run independently of model work. Reconnects use persisted generation/cursor state and stop on takeover or explicit gaps. Permanent model errors stop immediately; transient retries are bounded. Ambiguous external sends stop for operator reconciliation instead of blindly duplicating messages.

</details>

## Development

```sh
npm test
npm run build
npm run format:check
uvx ruff check scripts
uvx ruff format --check scripts
```

The build includes TypeScript checking. Browser tests cover workspace behavior with a mocked player; a separate opt-in suite checks a real owned video. Mocked tests do not establish live model or YouTube functionality.

<details>
<summary><strong>Browser tests and offline fixture</strong></summary>

Install Chromium once, start the app, then run:

```sh
npx playwright install chromium
npm run test:browser
```

For the real-video suite, set `LIVE_PROJECT_ID` and run `npm run test:browser:live`. Browser tests do not publish content. Mocked API/player checks and real playback, seeking, and approved exports are separate verification paths.

For an original offline fixture, stop the app, run `npx tsx scripts/seed.ts`, then restart. The fixture is labeled throughout and has no real video; it does not establish live integration success.

</details>

<details>
<summary><strong>Backup and restore</strong></summary>

`python3 scripts/backup.py` creates an ignored private backup with a PostgreSQL custom dump, SQLite backup-API snapshot, uploads, required secret/identity files, and a SHA-256 manifest. Files use mode `0600`; directories use `0700`. Backups contain credentials and source content: keep them offline and out of Git.

Restore into a separate empty checkout with different project/network names and host ports. Restore original environment/master keys and agent/room configuration, load the dump as the schema owner into the isolated PostgreSQL instance, and place the SQLite snapshot/uploads in `.local/app` while workers are stopped. Retain the original server identity. Start and verify the restored project before replacing any existing deployment; reconcile cursors after rollback. Backup readability/integrity is checked; destructive restore over the working stack has not been performed.

</details>
