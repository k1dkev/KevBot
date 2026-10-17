# KevBot product requirements

KevBot is a shared library of short audio clips, used through a website and a
Discord bot. Users should upload once, organize clips into playlists, and play
the same library from either client. MySQL stores identity, library metadata,
preferences and activity; the API owns those operations and GCS stores audio.

This describes intended product scope. [ARCHITECTURE.md](ARCHITECTURE.md)
separates implemented services from planned work. [ROADMAP.md](ROADMAP.md)
owns delivery order; [GitHub issues](https://github.com/k1dkev/KevBot/issues)
own execution status. See the [documentation index](docs/README.md) for contracts,
runbooks and the preserved historical PRD.

## First usable v2 release

The release must replace the full legacy Discord bot, including all 18 registered
commands, supported aliases and argument modes, library/category operations,
greetings, farewells, voice events, permissions and useful failure responses.
Basic playback alone does not satisfy this requirement.

The [command inventory](specs/bot-parity.md) and
[D1–D11, permission matrix and playback/reporting contract](specs/bot-parity-decisions.md)
define compatibility. The owner accepted these on 2026-10-15 in
[#141's approval record](https://github.com/k1dkev/KevBot/issues/141#issuecomment-6207636658);
[#169](https://github.com/k1dkev/KevBot/pull/169) records their publication.
Design acceptance does not mean the API gaps, replacement bot, test-guild checks
or production cutover are implemented.

Preserve configured prefix access. Slash commands may be additive; replacing
prefix access requires a separate owner decision. Categories use the shared
playlist model. The replacement bot must use the API rather than direct
database/storage access or the legacy whole-library download/cache architecture.

## User outcomes

### Shared library and website

- Discover tracks, playlists and users through browse/search, pagination and
  profiles. Track playback supports play/pause, seeking and volume.
- Complete web upload and management flows for tracks, playlists, memberships
  and personal greeting/farewell preferences, using API validation and permissions.
  Existing API operations are not proof that their web controls exist.
- Keep normalized MP3s and originals under stable track IDs. Validate file size,
  format, duration and names; report upload failures and partial outcomes clearly.
- Make web changes visible in Discord and Discord changes visible on the web.
- Report real activity and counts. Do not present placeholders or an incomplete
  page of results as whole-library statistics.

### Discord compatibility

Implement every command and special pool in the linked parity inventory, with
exact-name resolution, complete eligible pools, bounded history modes and
per-item results for batch category operations. Voice playback must handle
missing context, permissions, failed starts, timeouts and cleanup.

The accepted overlap policy allows one active playback per guild: reject busy
manual requests with feedback and skip overlapping automatic greetings/farewells
with diagnostics. Preserve play types and log successful starts as specified;
event idempotency and required activity queries remain implementation work.
The parity specs own the detailed command matrix and verification cases.

### Identity and permissions

The website uses Discord identity with access tokens and refresh sessions.
Password registration/login are not current product endpoints. Bot service
authentication must remain distinct from the real Discord user taking an action;
website login must not be required before the bot can resolve/provision that user.
Discord snowflakes must be handled as strings in the accepted actor contract.

The accepted category policy permits collaborative additions and restricts
removal/deletion to the creator or configured master, with empty-only deletion
and reserved virtual pools. Master authority is not a general override of every
web operation. See the accepted permission matrix for the exact scope.

[#157](https://github.com/k1dkev/KevBot/issues/157) owns implementation of these
identity/policy gaps and corresponding public API documentation. This PRD does
not assert that unpublished work is present in `main`.

## Current foundation and remaining work

Implementation baseline: `main` at `789bfc4` (2026-10-16), after publication of
the accepted parity contract. Status below describes source capabilities, not
deployment or complete release acceptance.

| Area | Present in the baseline | Required completion |
| --- | --- | --- |
| API | Discord exchange, refresh/logout, bot service authentication; track upload/normalization/streaming; playlists/memberships; preferences; activity writes; unified search | Accepted actor/policy gaps in #157, pools/activity in #158, contract and correctness follow-ups |
| Website | Login flow, browse/search, profiles, playlist detail and single-track player | Upload/management controls, playlist playback, activity reporting and complete statistics |
| Discord | Legacy implementation in `v1/`; compatibility contract | New service and adapters in #159–#162; full acceptance in #163 |
| Data/operations | MySQL migrations, GCS media, migration and backup utilities | Data audit, migration/restore rehearsal and cutover evidence under M3 |

Accepted compatibility can intentionally differ from the baseline. In particular,
the baseline upload duration check permits exactly 15 seconds and caps playlist
names at 15 characters. The accepted contract requires uploads strictly shorter
than 15 seconds and category names up to 45 characters; farewell duration is
strictly shorter than 4 seconds. #157 owns alignment and boundary tests. Existing
data needs an audit, not automatic truncation, renaming or deletion.

## Release evidence and quality goals

Require positive/negative evidence for every parity matrix row, permissions,
multi-page libraries, cross-client visibility and restart persistence. Exercise
the replacement bot in a real test guild and rehearse schema/audio migration and
backup restoration before cutover. Use the roadmap's release gates rather than
maintaining another completion checklist here.

The earlier PRD proposed p95 playback start below two seconds, upload processing
below five seconds, fewer than 1% failed uploads and at least 90% play reporting.
These remain candidate measurement targets, not measured guarantees or approved
service-level objectives. Establish measurement and acceptance evidence before
claiming they are met.

## Policy questions and deferred scope

Public versus authenticated reads and deleted-content visibility still need
explicit policy reconciliation under
[#145](https://github.com/k1dkev/KevBot/issues/145). Anonymous playback reports
are accepted as history-only events and excluded from aggregate counts and
rankings; see the #175 playback contract. A UUID makes retries idempotent but
does not prove a playback was audible or that an anonymous request came from
the official browser client.

Keep MySQL, Kysely, GCS and the existing API/migration architecture as the starting
point. Payments, automated moderation, listening rooms, advanced analytics,
audio effects, richer queues and database/provider replacement are deferred
unless separately prioritized. Original-audio retention, cleanup, backup and
recovery expectations also require explicit operational decisions. Historical
ideas remain in the [planning audit](docs/PLANNING_AUDIT.md) and roadmap rather
than becoming additional first-release requirements.
