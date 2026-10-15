# KevBot planning audit

Snapshot: 2026-10-08, working branch `feat/frontend-overhaul` at `07180b4`.
This is source evidence for [the roadmap](../ROADMAP.md), not an ongoing task
tracker. Use GitHub issues for task status after triage.

## Review scope and limits

Reviewed root/component documentation, API/routes/services/tests, frontend
routes/components/clients, MySQL migrations and tools, CI/deployment/release
configuration, legacy bot command/event code, all 18 Markdown notes in the
KevBot Obsidian folder, and GitHub issue/PR metadata and issue comments.
Three parallel read-only reviews covered API/database, frontend/bot, and notes.

GitHub resolves the old `Kunedawg/KevBot` remote to
[k1dkev/KevBot](https://github.com/k1dkev/KevBot). Its default branch is `main`.
The reviewed feature branch is 18 commits ahead of `main`, with no open PR for
that branch found. An implementation on this branch should not be reported as
merged or deployed.

No production service/database was accessed. No code execution or new tests were
needed for this audit. Earlier in this session the API build and all 35 search
integration tests passed against isolated Testcontainers. Other feature status
below means source exists, not that it passed an end-to-end check.

## Verified implementation and gaps

| Area | Evidence | Finding |
| --- | --- | --- |
| API foundation | [app routes](../api/src/app.ts), [services](../api/src/services) | Track CRUD/upload/normalization/download/stream, playlists/membership, user preferences, activity writes, and unified search exist |
| Identity | [auth routes](../api/src/routes/authRoutes.ts), [auth service](../api/src/services/authService.ts) | Discord code exchange, access tokens, refresh sessions, logout, and bot key/token exist; password login/register are absent |
| Bot actors | [token verification](../api/src/services/authService.ts), [actor helper](../api/src/utils/getAuthenticatedUser.ts) | Bot token becomes user `0`; no complete delegated-user provisioning/ownership model exists |
| Permission parity | [playlist service](../api/src/services/playlistsService.ts), [legacy category commands](../v1/src/commands) | Collaborative additions already exist; master override, reserved names, and empty-only category deletion need reconciliation |
| Activity | [play routes](../api/src/routes/playsRoutes.ts) | `POST /v1/plays/tracks` and `POST /v1/plays/playlists/random` exist; legacy global play-history reads are missing |
| Query handling | [search schema](../api/src/schemas/searchSchemas.ts) | `z.coerce.boolean()` treats nonempty query strings as truthy, including `"false"`; several docs/defaults disagree with schemas |
| Production API | [Dockerfile](../api/Dockerfile), [scripts](../api/package.json), [Swagger setup](../api/src/app.ts) | Production stage does not compile TypeScript; runtime expects untracked `dist/server.js`. OpenAPI YAML also needs explicit packaging |
| Database | [migrations](../db/migration), [manager](../tools/db/migration_manager/migration_manager/__main__.py) | Baseline `1.2.0`, migrations through `2.14.0`, semver/target/dry-run/history behavior exist |
| Hosted migrations | [workflow](../.github/workflows/database-migrate.yml) | Uses obsolete CLI arguments/directories and `MYSQL_*` configuration instead of the current manager's `DB_CONNECTION_STRING` contract |
| Migration failures | [manager](../tools/db/migration_manager/migration_manager/__main__.py) | Caught manager errors only print; applied SQL precedes history update; unknown unversioned schemas are assumed to match baseline; no migration lock/checksum/recovery journal found |
| Hosted topology | [service deploy](../.github/workflows/service-deploy.yml), [database compose](../db/docker-compose.yml) | Repo automates self-managed Droplet MySQL; user confirmed DigitalOcean hosting, but actual Managed Database versus Droplet is unverified |
| Frontend reads | [routes](../frontend/src/app), [search](../frontend/src/components/library-search-panel.tsx) | Login, browse/search, profiles, playlist detail, and track playback exist |
| Frontend writes/player | [API client](../frontend/src/lib/api-client.ts), [player](../frontend/src/lib/contexts/music-player-context.tsx) | Upload/management UI is missing; no playback logging/queue; shuffle/repeat only toggle state, previous/next disabled |
| Frontend statistics | [playlist columns](../frontend/src/components/data-table/playlist-columns.tsx), [user page](../frontend/src/app/(dashboard)/user/[id]/user-page-client.tsx) | Playlist plays hardcoded to `9000`; top tracks derived from latest 100, some totals incomplete, "Top Playlists" is newest ordering |
| Frontend reliability | [callback](../frontend/src/app/auth/discord/callback/page.tsx), [auth client](../frontend/src/lib/api-client.ts), [search context](../frontend/src/lib/contexts/search-context.tsx) | OAuth state not required/validated; refresh/exchange/logout coordination incomplete; search URL and stale pagination behavior need fixes |
| Frontend packaging | [package](../frontend/package.json), [config](../frontend/src/lib/config.ts) | Next `15.1.7`; runtime Zod import not declared directly; no frontend Dockerfile/Compose/test suite found |
| New bot | [legacy registry](../v1/src/functions/handlers/handleCommands.js), [parity draft](../specs/bot-parity.md) | New `bot/` directory absent. Legacy has 18 commands and voice-event behavior; these now define the first-release boundary |
| CI | [workflow](../.github/workflows/continuos-integration.yml) | CI is configured to invoke API tests; documented automatic frontend lint/build coverage is absent. Successful live CI runs were not verified |

Additional issues to assess in bounded follow-ups: stream range/error handling,
compensation for partial GCS uploads, play-count aggregation concurrency/startup,
auth request origin/throttling, temporary cleanup, restore/name collisions, and
visibility of deleted playlist members. Static findings are not a claim that
every historical bug remains reproducible.

## GitHub snapshot

- **78 issues:** 47 open and 31 closed. The newest issue update is 2023-04-15.
- Open issues have no assigned milestones, assignees, or area labels. Existing
  labels are generic work-type labels and release-please labels.
- No milestones were returned. Project inventory failed because the token lacks
  `read:project`; an existing Project may still exist.
- [PR #125](https://github.com/k1dkev/KevBot/pull/125) is an automated RSC security
  patch targeting `feat/frontend/initial-project`, not the current branch or main.
- [PR #136](https://github.com/k1dkev/KevBot/pull/136) is the pending release-please
  PR, including unified search/component version updates.
- Repository settings currently allow merge, rebase, and squash; automatic branch
  deletion is off. Main protection requires one approval but returned no required
  status checks. These differ from the documented settings; they were not changed.

The current frontend dependency baseline needs a fresh security review. Official
[Next.js guidance](https://nextjs.org/blog/security-update-2025-12-11) already
identifies patched versions newer than `15.1.7`; a further
[upstream security update is announced for 2026-10-14](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026).
Choose versions against published advisories at implementation/release time.
No deployed frontend exposure was verified.

## Disposition of every open issue

These are proposed actions for review, not closure decisions. Link a replacement
before closing an old issue as superseded. Reproduce defects against the relevant
legacy or v2 behavior; age alone is not a reason to close them.

### Review batches — 2026-10-14

The original 47 open issues were rechecked and remain unchanged. New outcome
epics #137–#140 and initial sub-issues #141–#146 are separate tracking work;
see [the live roadmap links](../ROADMAP.md#first-issue-batch).

| Review batch | Count | Original issue numbers | Recommendation |
| --- | --- | --- | --- |
| Delivered/superseded candidates | 9 | #81, #60, #59, #57, #56, #43, #19, #66, #20 | Review evidence first. API creation and removed-procedure work are strong closure candidates; legacy features still need their v2 parity rows verified |
| Carry requirements into v2 | 19 | #84, #79, #76, #75, #74, #72, #71, #68, #65, #63, #62, #55, #54, #51, #32, #26, #25, #21, #17 | Retain the requirement; consolidate overlapping tickets or link a bounded replacement under the appropriate epic before closing an original |
| Later enhancements | 13 | #83, #82, #78, #73, #70, #69, #64, #61, #58, #53, #47, #18, #9 | Keep as later ideas unless deliberately prioritized. Additional privileges are separate from required master-equivalent parity |
| Legacy maintenance/design review | 5 | #86, #80, #77, #30, #11 | Decide whether any value remains after replacing direct-storage/cached legacy architecture; avoid a generic refactor campaign |
| Private data verification | 1 | #45 | Verify ownership in a private data-repair process; do not infer completion or reproduce private records in public issues |

Start with #81 (API now exists), #60/#59 (stored procedures removed), and #56
(old README checklist checked) for the simplest evidence review. Then review
#57/#43/#19/#66/#20 against code and relevant behavior. Closing an original legacy
feature ticket must not imply its replacement bot implementation is complete.

The row-by-row recommendations below remain the evidence record. No batch was
automatically closed, and the original issue count is not the current total
after creating the ten new tracking issues.

| Issue | Proposed disposition |
| --- | --- |
| [#86 transfer-manager downloads](https://github.com/k1dkev/KevBot/issues/86) | Reassess against API streaming/caching design; whole-bucket legacy startup optimization may be superseded |
| [#84 website](https://github.com/k1dkev/KevBot/issues/84) | Reframe as web completion epic; implementation already exists, management flows remain |
| [#83 slash commands](https://github.com/k1dkev/KevBot/issues/83) | Keep as interface decision/enhancement; preserve accepted legacy command access |
| [#82 audio filters](https://github.com/k1dkev/KevBot/issues/82) | Later enhancement |
| [#81 REST API](https://github.com/k1dkev/KevBot/issues/81) | Candidate close with implementation evidence; track concrete API gaps separately |
| [#80 refactor](https://github.com/k1dkev/KevBot/issues/80) | Replace vague legacy checklist with scoped work only where current code needs it |
| [#79 raid errors](https://github.com/k1dkev/KevBot/issues/79) | Carry behavior/error cases into raid parity acceptance |
| [#78 Opus](https://github.com/k1dkev/KevBot/issues/78) | Later performance/format decision unless current voice compatibility requires it |
| [#77 clean GIFs](https://github.com/k1dkev/KevBot/issues/77) | Legacy documentation/media cleanup; verify whether useful in current docs |
| [#76 download cache](https://github.com/k1dkev/KevBot/issues/76) | Fold into bot playback transport design; avoid copying whole-library startup caching |
| [#75 stalled downloads](https://github.com/k1dkev/KevBot/issues/75) | Carry timeout/recovery cases into bot/API stream acceptance |
| [#74 SQL README](https://github.com/k1dkev/KevBot/issues/74) | Consolidate into current database runbook/documentation issue |
| [#73 recentuploads alias](https://github.com/k1dkev/KevBot/issues/73) | Keep as optional alias; actual legacy mode is `uploadhistory` |
| [#72 upload dates](https://github.com/k1dkev/KevBot/issues/72) | Verify and cover upload-history formatting in parity checks |
| [#71 spaces in commands](https://github.com/k1dkev/KevBot/issues/71) | Dispatcher input/error case; decide supported syntax rather than broad autocorrection |
| [#70 bot conversations](https://github.com/k1dkev/KevBot/issues/70) | Later conversational UX; distinct from implemented API refresh sessions |
| [#69 lists by user](https://github.com/k1dkev/KevBot/issues/69) | Existing user filters/web profiles partially cover intent; decide extra Discord grouping separately |
| [#68 SQL sync instructions](https://github.com/k1dkev/KevBot/issues/68) | Consolidate with reproducible fixtures and database recovery/upgrade runbook |
| [#66 category greetings](https://github.com/k1dkev/KevBot/issues/66) | Legacy implementation/API preferences exist; verify new bot category-greeting parity |
| [#65 greeting length](https://github.com/k1dkev/KevBot/issues/65) | Explicit shared duration-policy decision; not proof of missing greeting support |
| [#64 lists by duration](https://github.com/k1dkev/KevBot/issues/64) | Later search/list enhancement |
| [#63 farewell limit](https://github.com/k1dkev/KevBot/issues/63) | Resolve README 3-second versus code `<4`-second conflict in parity spec |
| [#62 specialized categories](https://github.com/k1dkev/KevBot/issues/62) | Replace physical special-category idea with explicit shared virtual-pool contracts |
| [#61 text-file category batches](https://github.com/k1dkev/KevBot/issues/61) | Later bulk-management enhancement |
| [#60 SQL procedure comments](https://github.com/k1dkev/KevBot/issues/60) | Candidate supersede: v2 migration removes stored procedures |
| [#59 set_greeting procedure](https://github.com/k1dkev/KevBot/issues/59) | Candidate supersede: current API/preferences replace procedure implementation |
| [#58 extra user privileges](https://github.com/k1dkev/KevBot/issues/58) | Keep enhanced privilege tiers later; master-equivalent authorization is required parity |
| [#57 missing exclamation](https://github.com/k1dkev/KevBot/issues/57) | Current checked-in dispatcher checks for `!`; verify before closing as fixed |
| [#56 README updates](https://github.com/k1dkev/KevBot/issues/56) | Consolidate into doc cleanup; old checklist is already checked |
| [#55 random-play logging](https://github.com/k1dkev/KevBot/issues/55) | Modern logging exists; verify virtual-pool versus named-playlist attribution |
| [#54 SQL sync Markdown](https://github.com/k1dkev/KevBot/issues/54) | Consolidate with #68; current workflow/runbook needed |
| [#53 silence-aware greetings](https://github.com/k1dkev/KevBot/issues/53) | Later enhancement; immediate join behavior is legacy parity |
| [#51 play history](https://github.com/k1dkev/KevBot/issues/51) | Preserve legacy event-history feature; modern read API and bot adapter needed |
| [#47 hotkeys](https://github.com/k1dkev/KevBot/issues/47) | Later desktop integration |
| [#45 ownership repair](https://github.com/k1dkev/KevBot/issues/45) | Separate private data-repair check; production ownership not verified by this audit |
| [#43 common list function](https://github.com/k1dkev/KevBot/issues/43) | Legacy resolver exists; replace with accepted shared API pool contract |
| [#32 logging](https://github.com/k1dkev/KevBot/issues/32) | Reframe for current API/bot operational logs; Heroku-specific comment is historical |
| [#30 naming cleanup](https://github.com/k1dkev/KevBot/issues/30) | Scoped maintenance only; avoid wholesale legacy rename before replacement |
| [#26 SQL/GCS mismatch](https://github.com/k1dkev/KevBot/issues/26) | Carry into data consistency/reporting and cutover checks |
| [#25 upload failures](https://github.com/k1dkev/KevBot/issues/25) | Review current API failure compensation; create bounded reproducible cases |
| [#21 delete owned audio](https://github.com/k1dkev/KevBot/issues/21) | API ownership/soft delete exists; frontend controls still needed; no legacy delete command registered |
| [#20 farewells](https://github.com/k1dkev/KevBot/issues/20) | Legacy/API support exists; new bot leave-event parity required |
| [#19 recent uploads](https://github.com/k1dkev/KevBot/issues/19) | Verify legacy/current date ordering; consolidate duplicate with closed #52 if satisfied |
| [#18 zip uploads](https://github.com/k1dkev/KevBot/issues/18) | Later bulk-upload enhancement |
| [#17 upload category argument](https://github.com/k1dkev/KevBot/issues/17) | Legacy intent/code exists but call is defective; required working upload-to-category parity |
| [#11 import cleanup](https://github.com/k1dkev/KevBot/issues/11) | Scoped maintenance or supersede with replacement architecture |
| [#9 birthdays](https://github.com/k1dkev/KevBot/issues/9) | Later non-core feature |

## Repository documentation conflicts

| Source | Conflict / consolidation action |
| --- | --- |
| `PRD.md` | Password login/register, outdated user model, per-entity search, PostgreSQL reference; rewrite as current product scope with linked API contracts |
| `TODOS.md` | Duplicated factory review and old OAuth/provider/signed-URL design; Discord/dev auth largely implemented with different names; remaining items belong in scoped issues |
| `ARCHITECTURE.md` | Presents missing client features/streaming bot as implemented; root Compose does not start frontend/bot; upload sequence differs from service; refresh against code |
| `README.md`, `CONTRIBUTING.md` | Stale version examples, nonexistent frontend Compose path, claims of frontend CI, old destructive reseeding procedure; replace duplicate setup recipes with verified runbooks |
| `CLAUDE.md`, `AGENTS.md` | Instruction drift includes migration auto-start claims and different branch-commit rules; align guidance with accepted workflow and canonical docs |
| `specs/search.md` | Says authenticated route and weights `100/12/10`; route is public and current weights `4/3/2`; config names/defaults differ; resolve intended policy then align spec/code |
| `api/src/docs/openapi.yml` | Advertises removed password endpoints and outdated identity/query fields; verify against route/schema contracts instead of testing only Swagger HTML |
| `api/docs/SECURITY_MODEL*.md` | Cookie attributes/state responsibilities/server-fetch claims diverge from controller/client; consolidate into a current auth contract plus concise linked overview |
| `frontend/README.md` | Starter content/fonts/page paths; needs real setup, API/OAuth configuration and feature status |
| `api/README.md`, `api/.env.example` | Container-only testing instructions and obsolete env example; document actual local/Testcontainers prerequisites and current schema |
| `.github/RELEASE_PROCESS_IMPLEMENTATION.md`, `.github/REPOSITORY_SETTINGS.md`, release docs | Describe squash-only/no automatic GitHub releases; live merge settings allow all and config has `skip-github-release: false`; reconcile intended policy with actual state |
| `scratch-work/DESIGN.md`, `v1/` docs | Historical designs/legacy behavior; label as historical and link accepted replacements rather than treating as current architecture |
| Generated `CHANGELOG.md` files | Historical release records, not active plans; leave release-please ownership intact |

The roadmap establishes distinct homes for scope, task status, contracts,
decisions, and operational instructions. Existing docs need reconciliation rather
than automatic rewriting from whichever old checklist an agent reads first.

## Obsidian source reconciliation

Latest dated working entry: **2026-04-25**. Later dated completion/decision records
outweigh earlier unchecked boxes. The current repo can supersede older notes:
release-please is implemented even though earlier notes prefer manual releases.

References below use note names and line ranges from this snapshot, without
copying private connection details, credentials, or sensitive seed data.

| Notes | Consolidated interpretation |
| --- | --- |
| `Working Sessions.md` | Main chronology. April frontend intentions at 7–109; legacy voice repair at 141–146; Discord auth work at 229–274; earlier API/normalization/testing completions at 320–624; SQL/GCS separation at 777–778 |
| `Working Session Backlog.md` | Accumulated bugs/options. Current candidates include stats, metadata stripping, errors, restore collisions, fixtures, backups and identity; unchecked items require code verification |
| `_main.md` | Early decomposition into API/DB/frontend/bot, backups and local environments; schema/tooling drafts have been overtaken by implementation |
| `kev-bot-api design 1.md` | Initial retrieval and legacy-command intent; reconcile against actual 18-command registry |
| `kev-bot api design 2.md` | Exploratory content negotiation/download alternatives, including AI-generated examples; not an accepted endpoint contract |
| `kev-bot next steps.md` | Early software/testing/naming priorities; later implementation overrides broad initial tasks |
| `SQL Next Steps.md`, `SQL Stuff.md` | Backup/sync/deploy/versioning intentions remain useful for operations; alternative tools/providers are research, not decisions |
| `How to backup SQL.md` | Historical manual export instructions; replace with rehearsed backup/restore runbook |
| `Testing.md` | Narrow historical exclusion for original-file preservation checks; not a general testing policy |
| `Clips that need to be re-normalized.md` | Legacy data-maintenance candidates; repair status remains unverified |
| Both `changelog-releasing-versioning.md` copies | Byte-identical policy drafts; count once and reconcile against actual release-please |
| Both `Example ChangeLog.md` copies | Byte-identical examples; not actual release evidence |
| Both `Changelog Next Steps.md` copies | Same competing proposals, with one extra reference link in the software-management copy |
| `software-management/Next Steps.md` | Automation/versioning/label questions; do not reimplement release tooling that already exists |

Specific historical conflicts to resolve:

- Older browser-local JWT/direct-account plans are superseded by later Discord
  identity and memory-held access tokens/refresh sessions.
- Anonymous plays were originally intentional; later notes request broad auth.
  Current public read/play routes make this an explicit policy decision.
- UUID/provider-table/account-merging/signed-URL sketches are alternatives; current
  integer IDs, Discord users, and API streaming are the implemented baseline.
- MySQL replacement (PostgreSQL/Supabase) and migration-tool replacement were
  explored but not adopted. Keep them outside the v2 completion path.
- Active-name uniqueness/soft deletion, independent SQL versus GCS migrations,
  and API schema-version checks remain relevant design constraints.
- April profile/table changes are mostly present; `9000` playlist plays is an
  explicitly acknowledged placeholder, not delivered statistics.
- April mutation checklists mostly describe client wiring and API reconciliation,
  not evidence that CRUD needs to be rebuilt from scratch.
- Normalization preview, artwork, richer mobile UX, and query logging are requests
  to prioritize deliberately. Production query logging must have a stated purpose
  and data-handling policy before implementation.

Leave personal notes as session/exploration history. Promote surviving tasks into
GitHub and accepted choices into repo specs/decisions; link back instead of
maintaining a second live release checklist in the vault.
