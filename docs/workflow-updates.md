# Editorial workflow update

The initial Slack direction is used in angle generation and snapshotted on saved pack versions. Legacy versions remain unchanged and explicitly show that no original brief snapshot was recorded.

Commands (prefix `project <id>` when the room has multiple projects):

- `@producer brief Focus on the practical beginner lesson.`
- `@producer revise chapters Split section three at 01:01.`
- `@producer fix F1 v5`
- `@producer accept F1 v5 This statement is clearly labelled my opinion.`
- `@producer glossary "Falco DB" => "FalkorDB"`
- `@producer approve v6`

Use actual finding IDs and current versions. Accepting a finding is an explicit human decision, not proof of factual correctness and not pack approval. Blocking deterministic checks still prevent approval. Reviewer checks all assets on every new version. An unresolved error on an unchanged asset must not be lost after another asset changes.

Chapter revisions replace the description timestamp block using validated source times and preserve all other formats. The new version is immutable, reviewed through Switch, and requires its own approval. Failed chapter validation does not create a new version.

History records real processed events and message IDs. No previous Slack conversation is reconstructed. A retry reuses its saved version and external-effect records; it does not create another version or handoff.

Project terminology corrections preserve the original transcript and previous content. The correction layer guides new writing, while direct quotes are validated against the original text.

## Verification scope

New domain/workflow tests use in-memory SQLite, schema-validated model fixtures, and mocked Switch operations. They verify the command and state transitions without spending model credits or sending Slack messages. They are not a substitute for a live creator-originated run. Existing approved content is preserved during deployment.

## Completed verification

- 23 domain/workflow tests pass, using explicitly mocked model/transport for new workflows.
- Production TypeScript/Vite build and formatting checks pass.
- Updated Docker app rebuilt and healthy; Switch and both worker sockets ready.
- Existing source segments, every pack version, and approval records hash-match the pre-update state.
- Existing approved v4 Markdown, chapter text, and JSON exports return success.
- CUA browser verification checked the production legacy-history disclosure and isolated fixture history, glossary, blocking findings, command copying, and 390px mobile overflow (none).
- Browser regression source was expanded; this turn used CUA for browser checks rather than executing the Playwright suite.
- No new live Slack messages or paid model calls were triggered to manufacture a demonstration. A creator-originated Slack run remains the final live verification of the new commands.
