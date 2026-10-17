# Bot parity contract — accepted decisions

Status: **Accepted** on 2026-10-15 (America/Chicago), covering D1–D11, the
permission matrix, and playback/reporting semantics. D6 was revised at the
owner's direction on 2026-10-16: library sources are typed and name-independent,
and playlist/track names have no reserved-word list. D1 was revised on
2026-10-17: slash commands are required for v2 while prefixes remain supported;
#83 tracks delivery. See the
[owner approval record](https://github.com/k1dkev/KevBot/issues/141#issuecomment-6207636658).
This accompanies the [18-command inventory](bot-parity.md); it neither implements
a bot nor asserts that v2 behavior has passed acceptance testing. API changes
mentioned here are follow-up work, not changes already present in `main`.
Future changes to this contract require an explicit reviewed decision.

## Compatibility decisions

| ID | Accepted contract | Evidence / intentional difference |
| --- | --- | --- |
| D1 (revised) | Keep configured `<prefix><command>!<args>` access and add slash-command access to the v2 release. Preserve all 18 registry names, case-folding, help selectors `kb`/`kevbot`/`kev-bot`, and greeting type aliases. `/search` searches tracks and playlists. | Owner direction on 2026-10-17; tracked by #83. Trim ordinary argument whitespace; malformed input returns usage instead of an exception. |
| D2 | Farewell duration is strictly **less than 4 seconds** across API and clients. Test 3, 3.999 and 4 seconds. | `setfarewell.js` rejects `>=4`; the README's 3-second statement is corrected, not silently treated as implemented behavior. No new master-only duration exception. |
| D3 | New uploaded audio must be strictly **less than 15 seconds** across both clients. Keep MP3 validation, normalization, 15-character bot clip names and existing API byte limits. Test 14.999 and 15 seconds. | Legacy `upload.js` rejects `>=15`, while the API currently allows exactly 15. This requires an explicit shared API boundary change, not a bot-only exception. Audit existing boundary-length clips before cutover; do not delete them. |
| D4 | Preserve playlist names up to the existing schema's **45 characters**, with lowercase ASCII letters/digits for new bot-created names. Align the API's current 15-character playlist cap with this compatibility limit. Never truncate/rename existing data automatically. | The playlist table has a 45-character name column. Track-name limits remain unchanged. Existing incompatible names require a cutover report and an owner-approved mapping. |
| D5 | `mostplayed` means counts of ordinary **PLAY (0)** events, not random/raid/greetings/farewells. Zero-play tracks are excluded. Sort count descending, then name and ID for stable ties. | `updateMostPlayed.js` explicitly filters `play_type=0`. API `total_play_count` combines types 0/1/3, so reusing that field would change semantics. Use the per-type data or a shared query instead. |
| D6 (revised) | Special library sources use a typed selector; playlist sources use playlist IDs. No playlist or track name is reserved or interpreted as an operation, including names such as `all`, `allcats`, `mostplayed`, or `playhistory`. | Owner direction on 2026-10-16 supersedes the legacy name-based resolver behavior. Legacy command aliases, if retained, are translated by the bot client and never become API resource names. |
| D7 | Ranked/history pools default to 25 entries and accept a positive integer up to 100; larger/zero/negative/noninteger values return an explicit error. Fewer available entries returns all available entries. `all_tracks`, playlists and `my_uploads` cover the entire eligible set through pagination, not an implicit first-page cap. | Resolver default is 25; history startup queries retain 100. Explicit bounds replace accidental JavaScript coercion and truncated caches. |
| D8 | `playhistory` is global recent play **events**, newest first, preserving repeats and timestamps; `uploadhistory` is global uploads, newest first. Exclude deleted/unplayable tracks from random candidates and explain missing references in list output. | Existing resolver/history intent; do not turn global history into user-only or unique-track history. The API needs read queries, not just existing play-log writes. |
| D9 | Random selection is uniform over the complete eligible pool: unique tracks for all_tracks/playlists/my_uploads/most_played/upload_history, but event entries for play_history (a repeated track can have multiple chances). A requested pool length is applied before sampling. Playlist collections are resources, not playable sources. | `pr.js` samples the resolver's array. This retains event weighting without inheriting whole-library caching. An empty pool gives useful feedback, not an undefined-track error. |
| D10 | `raid` uses 1-based ordinary guild voice channels in displayed top-down order, including parent-category order, with channel ID as a stable tie-break. Do not interpret raw Discord positions as contiguous numbers. Number the full voice list, then check target permissions; do not silently renumber denied channels. Stage channels are excluded. | `raid.js` describes top-down numbering but looks up `rawPosition === n-1`, which fails with gaps/categories. Require a guild and a positive integer in range. |
| D11 | One active playback per guild. Reject a new manual play/random/raid request while busy with a clear response; skip overlapping automatic greetings/farewells, with a diagnostic reason and no play log. No interruption or unbounded queue in the first release. | Legacy creates independent players/connections without a reliable overlap contract. This is an accepted behavior decision, not claimed legacy parity. Any later interruption/queue change requires explicit review. |

## Context, errors and command semantics

- `p` and `pr` require a guild and the caller's voice channel; `raid` requires a
  guild and the selected voice channel. Missing context or Discord permissions
  returns useful feedback without attempting playback. The remaining 15 commands
  support DM or guild invocation for the same shared library and the actual
  authenticated Discord user; they do not depend on a guild-only role.
- Replies remain DMs, split to Discord message limits. A closed-DM failure is
  handled without leaking private response content into a public channel; log
  a diagnostic and, for a guild command, give a minimal "enable DMs" notice.
- Exact-name resolution is case-folded, never a first fuzzy-search result.
  A clip/playlist greeting name collision requires an explicit supported type.
  Missing/deleted preferences are reported, not silently reassigned. Empty
  empty playlists cannot supply a playable greeting.
- `upload` uses the first attachment, validates supplied playlists before upload,
  and normalizes through the API. Unknown playlists reject the request
  before creating a track. If membership application fails after upload, report
  that the track exists and which memberships failed; do not claim atomicity or
  retry the upload blindly. Temporary files use request-specific paths.
- Multi-item playlist commands report success/duplicate/missing/denied outcomes
  per item and continue other valid items. An unavailable API is not a sequence
  of fabricated successes. Fix known missing-import and optional-playlist upload
  bugs rather than preserving them as behavior.
- Join-from-disconnected and leave-to-disconnected trigger greeting and farewell
  in the corresponding channel; channel switches and bot-member changes do not.
  Revalidate stream eligibility and permissions at play time. Skip missing/deleted
  clips or empty playlists with diagnostics. Failed starts are not counted.
- Emit one track-play event only after the player enters Playing, using a stable
  event identifier to make retries idempotent. Preserve types 0 ordinary, 1 random,
  2 greeting, 3 raid, 4 farewell, 5 playlist greeting. Random real-playlist choices
  also log the typed source and playlist ID; special sources are not fake playlist IDs.
  API event identifiers/idempotency support is a gap, not implemented today.
- API auth renewal gets one coordinated retry; a mutating operation is not
  blindly retried after an unknown outcome. Downloads/requests have bounded
  timeouts and every completion/failure/disconnect/shutdown releases resources.

## Identity and permission contract

Trusted bot service authentication and the represented user are separate. The
API must resolve/provision the user by their Discord snowflake **string** without
requiring a website login, and validate delegated identity on every mutation.
Bot clients cannot choose arbitrary numeric user IDs as proof of identity.
Ordinary browser clients cannot invoke bot delegation or assign privileged roles.
The bot never receives database/GCS credentials, and user ID `0` is not an actor.

Retain one configured `MASTER_DISCORD_ID` on the **API server**, checked
as a string against the resolved actor. Do not use Number conversion, guild admin
status, or possession of the bot key as the authority. No general admin command,
ownership transfer, or unrestricted impersonation endpoint is added by parity.

| Operation | Any authenticated user | Playlist creator | Configured master |
| --- | --- | --- | --- |
| Create a playlist with any valid name | Yes, self-owned | Yes | Yes |
| Add active clips to any active playlist | Yes; duplicates are non-destructive | Yes | Yes |
| Remove membership | No | Yes | Yes |
| Delete playlist | No | Only when empty | Only when empty |
| Change greeting/farewell | Own preference only | Own preference only | Own preference only |
| Mutate special pool selectors | N/A; they are query types, not resources | N/A | N/A |

Apply the same shared-library policy through the API for web and bot, not weaker
checks in Discord alone. Track rename/delete/restore and other web-only actions
retain their separately specified policies; master authority is not a blanket
override of every API operation. Creator/master resolution failures fail closed.

## Gap groups and implementation gates

| Group | Required work | Acceptance cases |
| --- | --- | --- |
| API identity/policy | Resolve/provision actors, authenticated delegation, server-side master/shared-additions/creator-removal policy, playlist naming and shared duration/name limits | Fresh Discord user; snowflake precision; forged actor; ordinary-client delegation; creator/master/unrelated user; former pool words as ordinary names; nonempty deletion; exact duration boundaries |
| API pools/activity | Per-type mostplayed, global event/upload history, complete sampling, stable limits/order, event-idempotent play reporting | More than one API page; ties; repeated history entries; 25/100 bounds; deleted references; unbiased candidates; duplicate report retry |
| Bot foundation | TypeScript service/config/compose/CI, prefix dispatch, registry-derived help, shared API client/auth renewal and error responses | Exact 18-command registry; selectors/aliases; missing/extra args; case/whitespace; DM/guild contexts; closed DMs; no database/storage credentials |
| Voice playback | p/pr/raid, per-guild state, random/raid numbering, lifecycle/timeouts and logging | Wrong/no channel; denied permissions; gapped/category channel positions; two guilds; busy guild; failed start; stream stall; reconnect/disconnect/shutdown; correct play type |
| Library commands | Upload and playlist membership/management commands | First attachment; no/corrupt/oversize audio; normalization; unknown supplied playlist; duplicate/missing/mixed item results; shared-additions/removal policy; upload succeeded but membership failed |
| Preferences/events | Six greeting/farewell commands and automatic voice events | Track/playlist ambiguity; all type aliases; missing/cleared/deleted preferences; joins/leaves/switches; ignored bots; empty playlists; overlap handling |
| Release acceptance | Matrix evidence and real test-guild run across all groups | Migrated data and new users; cross-client visibility; persistence after restart; exact aliases/defaults; no duplicate legacy/v2 events; upgrade/restore rehearsal |

Implementation tracking: API identity/policy [#157](https://github.com/k1dkev/KevBot/issues/157),
pools/activity [#158](https://github.com/k1dkev/KevBot/issues/158),
bot foundation [#159](https://github.com/k1dkev/KevBot/issues/159),
voice [#160](https://github.com/k1dkev/KevBot/issues/160),
library commands [#161](https://github.com/k1dkev/KevBot/issues/161),
preferences/events [#162](https://github.com/k1dkev/KevBot/issues/162), and
full acceptance [#163](https://github.com/k1dkev/KevBot/issues/163).
Each is a native sub-issue of the relevant M1/M2 epic with a dependency on #141.

Implementation issues must link this accepted contract. The design/publication
dependency #141 completes when the acceptance documentation lands; remaining
implementation dependencies still apply. Their completion must provide
implementation and
verification references for every command/special mode; a basic playback demo
does not satisfy full parity. Separate cutover work must audit playlist names,
15-second existing clips, identity/ownership gaps and audio-object consistency.

## Approval record and change control

The owner explicitly accepted the contract on 2026-10-15 (America/Chicago):

> I accept D1–D11, the permission matrix, and playback/reporting semantics.

The linked approval record is the source of this status change. No behavior
choices were changed while recording acceptance. The documentation PR closes
#141 on merge; implementation issues #157–#163 remain open with their own
dependencies and verification requirements. Test-guild/release acceptance
remains under #139/#140 and is not satisfied by accepting this design.

D6 was revised in #175 at the owner's direction on 2026-10-16, replacing
reserved, name-based pool words with typed source selectors and playlist IDs.
Further changes to D1–D11, the permission matrix, or playback/reporting
semantics must record their rationale and owner approval in a reviewed update.
