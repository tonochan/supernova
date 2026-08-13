# Local Data Migration

Date: 2026-08-13

## Purpose

Move browser-local SUPERNOVA data from the old GitHub Pages origin
`https://tonochan.github.io` to the new production origin
`https://supernova.tonochan.jp`.

`localStorage` is scoped by origin, so the new origin cannot read the old
origin directly.

## Design

- The new app shows an "old data" import action on the title screen.
- User action opens `https://tonochan.github.io/supernova/migrate/` as a
  top-level popup.
- The old-origin page reads only SUPERNOVA-owned localStorage keys and sends
  them to the opener with `postMessage`.
- The data is sent to the exact target origin only:
  `https://supernova.tonochan.jp`.
- No saved data is placed in URL query strings, URL hashes, or server storage.
- The old-origin data is never deleted automatically.

## Migrated Keys

- `supernova-best`
- `supernova-found`
- `supernova-game-state`
- `supernova-last-replay`
- `supernova-replay-history`
- `supernova-lang`

Any other key is rejected.

## Merge Rules

- Best score: keep the larger value.
- Discovered elements: union of old and new sets.
- Language: import only when the new origin has no explicit language setting.
- Last replay: keep the newer completed replay; tie-break with higher score.
- Replay history: dedupe by history entry ID, keep the newer saved entry, sort
  newest first, cap at the existing history limit.
- In-progress game state: keep the newer `savedAt`; never overwrite a newer
  new-origin save with an older old-origin save.

Re-running migration is idempotent.

## Validation And Failure Handling

The new origin validates:

- source origin
- target origin
- message kind
- schema version
- allowed key list
- value type
- total payload size
- replay/game-state shape and rules version

Popup blocked, no old data, corrupt data, oversized payload, and closed popup
all show human-readable status. Failure of the migration UI must not block the
game itself.

## Rollback

Rollback is removing the title-screen import button and the new-origin receiver
logic from `index.html`/`game.js`, then redeploying the Worker static assets.
The old GitHub Pages `compat-pages/migrate/` bridge can be left in place because
it does nothing useful without an opener from the new app. It can also be
removed in a later Pages bridge deploy.

## Verification

Local checks:

```sh
node --check game.js
node --check tests/local-data-migration-e2e.mjs
node tests/local-data-migration-e2e.mjs
git diff --check
```
