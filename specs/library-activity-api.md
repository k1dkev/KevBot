# Library pool and playback API

This document describes the library/activity API introduced by #175. It
deliberately replaces the legacy name-based pool convention: a playlist name is
never interpreted as a special operation, and special sources are never
represented by fake playlist names or IDs.

## Pool sources

List a source with GET /v1/library/pools and select a random track with
GET /v1/library/pools/random. Both require a source query parameter:

| source | Meaning | Extra input |
| --- | --- | --- |
| all_tracks | Every active track | — |
| playlist | Tracks in one active playlist | playlist_id (required) |
| most_played | Tracks with ordinary-play counts, highest first for listing | — |
| my_uploads | Tracks uploaded by the authenticated actor | — |
| play_history | Recent play events, preserving repeated tracks | — |
| upload_history | Recently uploaded tracks | — |

limit defaults to 25 and is capped at 100. Listing also accepts offset;
random selection applies limit as the candidate window for ranked/history
sources, then filters unplayable or over-duration tracks before sampling.
Ordinary track and playlist sources use the complete eligible set. A play
history event retains its own sampling weight, so a repeated track can appear
more than once in the candidate window.

For example:

~~~http
GET /v1/library/pools?source=playlist&playlist_id=42&limit=25
GET /v1/library/pools/random?source=play_history&limit=25&max_duration=15
~~~

A random response returns the selected track and its typed source:

~~~json
{
  "track_id": 123,
  "source": { "type": "playlist", "playlist_id": 42 }
}
~~~

For a history selection, the response also contains history_event_id.
source.type is one of the source values above. Playlist sources carry
playlist_id; the API never resolves a playlist by name in pool requests.
Use GET /v1/playlists to list playlists and the existing
GET /v1/playlists/{id}/tracks route to read a playlist directly.

Names such as all, allcats, mostplayed, and playhistory are ordinary names, not
API instructions. Playlist and track names remain subject only to their normal
length/character validation; there is no reserved-name list. The source
discriminator and playlist ID remove ambiguity without constraining the
namespace.

## Playback reporting

After the player enters Playing, report once to POST /v1/plays/events. Create
one UUID per playback attempt and reuse it for every retry. The endpoint
requires a delegated bot actor and playback_started: true.

~~~json
{
  "event_id": "24b0e317-d6ed-4ed8-9ab3-c995e9c6fcad",
  "track_id": 123,
  "play_type": "random",
  "source": { "type": "playlist", "playlist_id": 42 },
  "playback_started": true
}
~~~

play_type is a descriptive string:

| API value | Stored play type | Meaning |
| --- | ---: | --- |
| play | 0 | Direct/manual play |
| random | 1 | Track selected from a pool |
| greeting | 2 | Direct-track greeting |
| raid | 3 | Raid playback |
| farewell | 4 | Direct-track farewell |
| playlist_greeting | 5 | Track selected from a playlist greeting |

Forward the exact source returned by random selection. random requires a
source. playlist_greeting requires a playlist source. A playlist source is
valid only for random and playlist_greeting; non-playlist pool sources are
valid only for random. Direct-track plays omit source.

The first accepted report writes the idempotency record, canonical track_plays
history/counters, and (when the source is a playlist) playlist_plays in one
transaction, returning 201. An exact retry returns 200 without incrementing
history or counters. Reusing an event ID for a different actor, track, play
type, or source returns 409. The playback_events table stores the idempotency
identity; track_plays remains the canonical play-history feed.

The older POST /v1/plays/tracks endpoint remains available for existing
clients. New bot playback should use /v1/plays/events so retries are safe and
the event semantics are explicit.

## Removed name-based behavior

There is no /library/pools/{name} route. Old command words such as mostplayed,
myuploads, cats, or playhistory are not pool names in the API. Callers map any
desired command aliases to a typed source; names are never reserved or
shadowed. Playlist collection and membership operations use playlist
resources and IDs exclusively.
