# Discord bot v2 — behavior parity

Status: **Accepted** on 2026-10-15 (America/Chicago). The owner accepted D1–D11,
the permission matrix, and playback/reporting semantics in the
[accepted decisions and acceptance cases](bot-parity-decisions.md).
[Approval record](https://github.com/k1dkev/KevBot/issues/141#issuecomment-6207636658).
Inventoried on 2026-10-08 and reviewed against sources on 2026-10-14.
Design acceptance does not mean the `bot/` service is implemented or release
verification has passed.

The first usable v2 release retains the legacy bot's core operations while
modernizing its public vocabulary around playlists and typed library sources.
See [ROADMAP.md](../ROADMAP.md) for delivery order and release gates.

## Evidence and boundary

Sources: [legacy command registry](../v1/src/functions/handlers/handleCommands.js),
[dispatcher](../v1/src/events/MessageCreate.js), [command implementations](../v1/src/commands),
[pool resolver](../v1/src/functions/helpers/getList.js),
[voice events](../v1/src/events/VoiceStateUpdate.js), and
[legacy README](../v1/README.md).

There are **18 registered commands** in v1. A download command and a standalone
admin command are not present. V2 retains the useful operations, with playlist
resources and typed source selectors as the public model.
Slash commands are an outstanding enhancement, not registered legacy commands.
Use actual dispatch and implementation as evidence, and record differences from
documentation rather than assuming either is always correct.

Preserve user-facing functionality. Direct MySQL/stored-procedure access, direct
GCS access, whole-library startup downloads, process-local data caches, and known
legacy defects are not required implementation techniques.

## Command interface

Current syntax is `<COMMAND_PREFIX><command>!<arguments>`, with a configured
prefix. Command names and text arguments are lowercased; ordinary arguments are
space-separated. Bot-authored messages are ignored. Command responses are
normally sent by DM and split/formatted when necessary.

Preserve configured prefix access for the first release. Slash commands are
additive unless the user explicitly approves replacing prefix compatibility.
Guild/DM validity and errors follow the accepted context rules in
[the decisions](bot-parity-decisions.md); voice commands need appropriate
guild/channel context and Discord permissions.

## Required command matrix

All entries are pending v2 implementation and acceptance evidence. Names below
are exact registry names; examples omit the configured prefix.

| Command | Example/interface | Required behavior | Existing API / gap |
| --- | --- | --- | --- |
| `p` | `p!clip` | Resolve exact clip, play in caller's channel, record ordinary play, disconnect/clean up after playback | Stream/read endpoints exist; actor attribution and voice adapter needed |
| `pr` | `pr!`, `pr!playlist:<name>`, `pr!source:<type>`, optional pool length | Select a random eligible track from all tracks, a playlist, or a typed special source | Typed pool API in #175; command adapter in #186 |
| `raid` | `raid!clip 3` | Play named clip in a numbered guild voice channel; record raid play | Guild channel/permission handling and defined channel numbering needed |
| `list` | `list!`, `list!playlist:<name>`, optional length | Return formatted track/playlist/count/history data for the selected source | Catalog reads exist; event-history reads and formatting adapter needed |
| `upload` | MP3 attachment; `upload!playlist1 playlist2` | Validate the first attachment as MP3, derive/validate name, reject unknown supplied playlists before upload, normalize through API, attribute uploader, apply playlists and report outcomes | Multipart upload exists; bot actor and attachment/playlist adapters needed |
| `help` | `help!kb`, `help!kevbot`, `help!kev-bot` | Provide current command descriptions and usage, including valid aliases | New registry-derived help needed |
| `setgreeting` | `setgreeting!name [track|playlist]` | Set own track or playlist greeting; resolve name ambiguity with explicit type | Greeting PUT exists; delegated identity and lookup needed |
| `getgreeting` | `getgreeting!` | Show own greeting and useful missing-reference warnings | Greeting GET exists |
| `delgreeting` | `delgreeting!` | Clear own greeting | PUT with null references exists |
| `setfarewell` | `setfarewell!clip` | Set own track farewell with agreed duration limit | Farewell PUT exists; duration-policy alignment needed |
| `getfarewell` | `getfarewell!` | Show own farewell and useful missing-reference warnings | Farewell GET exists |
| `delfarewell` | `delfarewell!` | Clear own farewell | PUT with null references exists |
| `newplaylist` | `newplaylist!name` | Create a uniquely named playlist | Playlist POST exists |
| `delplaylist` | `delplaylist!name` | Delete an empty playlist; creator or Moderator/Admin permission | Playlist DELETE and role policy in #181 |
| `addtoplaylist` | `addtoplaylist!playlist track1 track2` | Add multiple tracks to one playlist; collaborative additions; per-item outcomes | Playlist membership API exists; command adapter needed |
| `delfromplaylist` | `delfromplaylist!playlist track1 track2` | Remove multiple tracks from one playlist; creator or Moderator/Admin; per-item outcomes | Playlist membership API and role policy in #181 |
| `addplayliststo` | `addplayliststo!track playlist1 playlist2` | Add one track to multiple playlists; partial results | Multiple playlist membership operations needed |
| `delplaylistsfrom` | `delplaylistsfrom!track playlist1 playlist2` | Remove one track from multiple playlists; creator or Moderator/Admin; partial results | Multiple playlist membership operations needed |

The v1 library-management command spellings are replaced by their playlist
equivalents in v2. Do not retain obsolete resource aliases, create a parallel
library resource, or add a reserved-name mechanism.

## Special pools and aliases

| Pool/argument | Commands | Semantics |
| --- | --- | --- |
| `source:all_tracks` or omitted | `list`, `pr` | All eligible active tracks |
| `playlist:<name>` | `list`, `pr` | Tracks in the named playlist; resolve to a playlist ID before calling the API |
| `source:most_played` | `list`, `pr` | Ranked pool with play counts; default length 25; optional length |
| `source:my_uploads` | `list`, `pr` | Calling Discord user's uploads; empty-user feedback |
| `source:play_history` | `list`, `pr` | Global recent play events, including repeated tracks; default length 25 |
| `source:upload_history` | `list`, `pr` | Recent uploads with timestamps; default length 25 |
| Any other valid playlist name | `list`, `pr` | Ordinary playlist; distinguish nonexistent from empty |

Ranked/history pools default to 25 entries with positive integer lengths up to
100 (D7). History remains global and preserves repeated events (D8); random
sampling follows the accepted pool semantics (D9), not a first-page cache.

Greeting type aliases are `track` and `playlist`. A track or playlist named
`allcats`, `all`, or `mostplayed` is ordinary data and is never interpreted as
a special source. There is no reserved-name list.

## Voice events and activity

- A non-bot user entering voice from a disconnected state triggers their greeting.
- A track greeting plays that track; a playlist greeting selects from its playlist.
- A non-bot user leaving voice triggers their farewell in the old channel.
- Switching channels does not trigger a greeting or farewell under legacy behavior.
- Bot members are ignored by these automatic events.
- Preserve distinct ordinary/random/raid/greeting/playlist-greeting/farewell play
  attribution and the relevant random-playlist logging.

Implement the [accepted behavior](bot-parity-decisions.md) for permission denial,
missing/deleted clips, empty playlists,
expired API credentials, stalled downloads/streams, disconnects, channel moves,
overlapping commands/events, and shutdown. The legacy runtime is not a reliable
specification for all failure cases; use accepted behavior and verification.

## Identity and permission contract

The API authenticates the bot service separately from the user it represents.
Resolve or provision users from authoritative Discord IDs without requiring
them to sign into the website first. Keep Discord snowflake IDs as strings.
Uploads, preferences, membership mutations, and play events must use the actual
acting user. The current bot token maps to user ID `0`, so token issuance alone
does not satisfy this contract.

Retain collaborative additions. The API stores `user`, `moderator`, or `admin`
on each user and enforces the fixed ability map in
[`authorization-roles.md`](authorization-roles.md). Moderators can perform the
specified cross-owner track and safe playlist operations; Admins can also list
users and assign roles. Bot credentials alone and Discord guild roles do not
grant application abilities. Reject impersonation by ordinary user clients.

Library selections and permission rules belong to shared API behavior. Discord
command parsing, DM formatting, voice connection management, and gateway events
belong to the bot adapter. No business operation should require bot database/GCS
credentials.

## Accepted decisions

The full contract is [bot-parity-decisions.md](bot-parity-decisions.md), including
its permission matrix and playback/reporting semantics. This table summarizes
the accepted resolutions; implementation and verification remain follow-up work.

| Decision | Accepted resolution |
| --- | --- |
| Command migration | Preserve configured prefixes and all 18 commands; slash commands remain additive (D1) |
| Farewell duration | Strictly less than 4 seconds across clients/API (D2) |
| Upload duration | New uploads strictly less than 15 seconds; audit existing boundary clips without deleting them (D3) |
| `mostplayed` definition | Ordinary PLAY (0) events only, with stable ties and no zero-play entries (D5) |
| Roles | Fixed API-enforced User/Moderator/Admin ability map; no permanent master-ID exception |
| Names and resources | Tracks and playlists have no reserved names; typed source selectors are separate from resources |
| Playlist name length | Preserve compatibility up to 45 characters; do not silently truncate/rename existing data (D4) |
| Special names | `allcats`, `all`, and `mostplayed` remain ordinary track/playlist names; use typed source selectors |
| Raid channel numbers | Deterministic 1-based displayed voice-channel order, with permission checks after numbering (D10) |
| History limits and random sampling | Ranked/history default 25, maximum 100; global repeated-event history and complete-pool sampling as specified (D7–D9) |
| Concurrent playback | One active play per guild; reject busy manual requests, skip overlapping automatic events; no interruption/unbounded queue (D11) |

Known legacy defects include incomplete cache updates, missing removal-helper
imports, and a broken optional-playlist upload call. These features still need
working v2 behavior; preserving defects is not the compatibility goal.

## Verification and cutover

For every command and special mode, record its v2 implementation reference,
positive/negative scenarios, permission cases, and verification result. Cover:

- New Discord users with no prior web login and existing migrated users.
- Caller/creator/moderator/admin/unrelated-user actions and rejected impersonation.
- Duplicate membership, partial multi-item failures, empty/deleted content,
  and libraries larger than one page.
- All named commands, supported aliases, default arguments, and pool lengths.
- Greeting/farewell joins/leaves, bot-member exclusion, and no switch trigger.
- Successful/failed plays, correct actor/play type, persistence after restart,
  API token renewal, timeout/reconnect behavior, and cleanup.
- Web changes visible in Discord and Discord changes visible on the website.

Use unit/adapter checks with Discord stubs plus a real test-guild run before
release. Do not point the legacy bot at the migrated v2 schema: v2 removes its
stored procedures and changes media naming. Rehearse schema/audio migration and
backup restoration separately; cut over bot instances without duplicate events.

Implementation/release acceptance is complete only when every required matrix
row has evidence. The design is accepted, but basic `p` playback cannot close
the full parity release gate.
