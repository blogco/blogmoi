# Expense sync root cause and verification

At parent revision aa5bf0f, static/js/expense-tracker.js:getInsightRecords
(lines 1100, 1109, 1112) referenced scopeLabel without declaring it.
The declarations in getHealthInsights, renderFoodBubbles and renderKpis
are local to those functions. This was a lexical scope error, not an
import/export, closure or destructuring problem. Nonempty dashboard
rendering triggers it during startup and after a sync. Empty data hid it.
The startup rejection handler (line 1883) labeled every exception as an
IndexedDB open failure. The sync catch also collapsed cloud, local apply
and rendering failures, despite a successful GitHub PUT.

The repair declares the period label inside getInsightRecords. ESLint
checks all static JavaScript for undeclared identifiers. Authentication,
local storage, cloud result and queue processing have independent state.
The displayed queue count is explicitly relative to the last verified
baseline; zero is never used to skip a remote read. Historical verification
time does not imply that the current sync succeeded.

Each sync captures transactions and metadata in one readonly transaction,
authenticates, saves an optional checkpoint in the existing sync-meta row,
reads the current cloud SHA, and performs a three-way merge by ID. Both-side
edits require explicit user resolution. Missing records do not imply
deletion; deletion requires a tombstone. PUT only occurs for changed data.
A subsequent GET verifies the saved SHA and normalized document. An
unverifiable write retains its receipt and leaves the baseline untouched.
Local apply updates transactions and metadata atomically, preserves edits
made during the request, and clears the checkpoint only on completion.
UI failure cannot erase the verified cloud result. Retrying after reload
re-reads cloud state and avoids duplicate commits.

No database version, store definition or cloud document schema changed.
The optional checkpoint field is compatible with existing v2 metadata;
v1-to-v2 migration and existing records are tested. No production database
is opened by tests, and all HTTP writes in tests use a fake GitHub service.
No real expense data or workflow file is included in this code change.
Tokens remain in memory only; diagnostic messages retain sanitization.

Run npm ci, npm run lint, npm run build, node --test tests/*.test.mjs.
The production test executes built modules against built HTML in jsdom,
with fake-indexeddb and mocked GitHub. It tests populated startup,
authentication, migration confirmation, repeated Sync clicks and reload.
This is automated DOM integration testing, not visual browser testing.
The integration suite also tests unavailable storage, atomic abort,
write/readback, HTTP errors, offline recovery, in-flight edits, conflicts,
and failures after remote success. TypeScript checking is N/A (ESM JS).

Live authenticated browser sync and the user's actual IndexedDB remain
unverified when browser access is unavailable. Do not infer their state
from the automated tests or public production HTTP responses.
