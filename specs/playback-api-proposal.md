# Proposed playback API

Status: proposed v2 contract, implemented in part by #175 and #186.

## Design boundary

The API selects library content and records completed playback. The Discord bot
owns command parsing, voice-channel targeting, and audio playback. The API must
not ask the bot to play audio or infer an operation from a track/playlist name.

This keeps names such as `allcats`, `all`, and `mostplayed` available as normal
track and playlist names. Categories are not API resources; use playlists and
playlist IDs throughout.

## Select a random track

Use the existing typed pool endpoint instead of a reserved name or virtual
playlist:

```http
GET /v1/library/pools/random?source=all_tracks
GET /v1/library/pools/random?source=playlist&playlist_id=42
GET /v1/library/pools/random?source=most_played
GET /v1/library/pools/random?source=my_uploads
GET /v1/library/pools/random?source=play_history
GET /v1/library/pools/random?source=upload_history
```

The response includes both the selected track and the exact typed source to
carry forward when reporting the play:

```json
{
  "track_id": 123,
  "source": { "type": "playlist", "playlist_id": 42 }
}
```

The source is a discriminated union, not a name. A playlist requires its ID;
the other supported source types do not accept playlist fields. The bot should
not translate `allcats` or any other name into a source.

## Special play kinds

Special kinds describe why a track played. They do not change track or playlist
identity:

| `play_type` | Track selection | `source` |
| --- | --- | --- |
| `play` | Exact track selected by `p` | Omitted |
| `random` | Result from the random pool endpoint | Required; forward its response unchanged |
| `greeting` | Actor's configured greeting track | Omitted |
| `playlist_greeting` | Random eligible track from the actor's configured greeting playlist | Required; `{ "type": "playlist", "playlist_id": id }` |
| `farewell` | Actor's configured farewell track | Omitted |
| `raid` | Exact track selected for the targeted voice-channel member | Omitted |

Greeting and farewell configuration continues to use the user preference
resources. A preference can point to a track or playlist where supported; the
bot resolves the stored IDs, uses the typed pool endpoint for playlist
selection, and only reports a play after audio actually starts. Raid channel
selection and Discord voice behavior remain bot responsibilities.

## Report a playback

After Discord's player enters `Playing`, call:

```http
POST /v1/plays/events
Authorization: Bearer <delegated actor token>
Content-Type: application/json
```

```json
{
  "event_id": "24b0e317-d6ed-4ed8-9ab3-c995e9c6fcad",
  "track_id": 123,
  "play_type": "random",
  "source": { "type": "playlist", "playlist_id": 42 },
  "playback_started": true
}
```

Generate one UUID per playback attempt and reuse it on retries. A first report
returns `201`; an identical retry returns `200` without recording a second
play. Reusing the ID for a different actor, track, kind, or source returns
`409`. Failed playback is not reported. The event ledger, track history and
counters, and applicable playlist history are committed atomically.

The endpoint records a fact; it is not a playback command. The bot remains
responsible for reporting only after `Playing`, and the API validates the
actor, track, play kind, and source relationship.

## Why not add one generic play-request endpoint?

The current split is sufficient for v2: the bot can resolve direct tracks and
user preferences with existing resource endpoints, ask the typed pool API for
random selection, then report the result through the idempotent event endpoint.
A generic endpoint that also represents voice-channel selection or playback
would mix Discord orchestration into the API without making the actual audio
operation transactional. If future clients need server-side request
resolution, add a separate typed `resolve` operation only for selection; keep
voice playback and event reporting distinct.
