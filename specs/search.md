# Unified Search — v1

## Purpose

`GET /v1/search` is a single endpoint that lets authenticated clients both **search** and **browse** across three entity types — tracks, playlists, and users — with a uniform request and response shape. It replaces per-entity list/search endpoints as the primary surface for the library UI and the Discord bot's lookup flows.

## Endpoint

```txt
GET /v1/search
```

Requires an authenticated user (same auth rules as other `/v1/*` endpoints).

## Query parameters

| Name              | Type                                                    | Default                                                            | Notes                                                                                                                        |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `q`               | string                                                  | —                                                                  | Optional. If present, must be non-empty after trim. Empty/whitespace-only → `400`. Max length `config.maxSearchQueryLength`. |
| `type`            | `"all" \| "tracks" \| "playlists" \| "users"`           | `"all"`                                                            | Which entity types to return.                                                                                                |
| `sort`            | `"relevance" \| "name" \| "created_at" \| "play_count"` | `relevance` if `q` present, else `name`                            | See sort rules below.                                                                                                        |
| `order`           | `"asc" \| "desc"`                                       | `desc` for `relevance`/`created_at`/`play_count`; `asc` for `name` |                                                                                                                              |
| `include_deleted` | boolean                                                 | `false`                                                            | Intended for admin/dev use; exposed but not gated in v1.                                                                     |
| `limit`           | int                                                     | `20`                                                               | Clamped to `[1, config.maxSearchPerPage]`.                                                                                   |
| `offset`          | int                                                     | `0`                                                                | Must be ≥ 0.                                                                                                                 |
| `playlist_id`     | int                                                     | —                                                                  | Narrows tracks to a specific playlist. Valid **only** with `type=tracks`.                                                    |
| `user_id`         | int                                                     | —                                                                  | Narrows to a specific owner. Valid **only** with `type=tracks` or `type=playlists`.                                          |

## Modes

**Browse mode** — `q` is omitted. Results come from the requested scope ordered by an explicit non-relevance sort.

**Search mode** — `q` is provided. Results are ranked by the hybrid relevance model (see below) by default; an explicit non-relevance `sort` is also allowed for tracks and playlists.

### Sort legality matrix

| Sort         | Browse | Search | `type=tracks` | `type=playlists` | `type=users` | `type=all` |
| ------------ | ------ | ------ | ------------- | ---------------- | ------------ | ---------- |
| `relevance`  | ❌     | ✅     | ✅            | ✅               | ✅           | ✅         |
| `name`       | ✅     | ✅     | ✅            | ✅               | ✅           | ✅         |
| `created_at` | ✅     | ✅     | ✅            | ✅               | ✅           | ✅         |
| `play_count` | ✅     | ✅     | ✅            | ❌               | ❌           | ❌         |

`play_count` is only supported for `type=tracks` in v1; playlists do not have an aggregated play-count surface and cross-type comparisons are not meaningful.

## Response shape

```json
{
  "data": [
    {
      "type": "track",
      "id": 123,
      "name": "midnight",
      "created_at": "2026-04-20T18:30:00Z",
      "deleted_at": null,
      "relevance": 145.2,
      "duration": 12,
      "total_play_count": 82,
      "raw_total_play_count": 90,
      "user": { "id": 4, "display_name": "kev" }
    },
    {
      "type": "playlist",
      "id": 55,
      "name": "late-night",
      "created_at": "2026-04-18T10:00:00Z",
      "deleted_at": null,
      "relevance": 103.7,
      "track_count": 14,
      "user": { "id": 4, "display_name": "kev" }
    },
    {
      "type": "user",
      "id": 9,
      "name": "kevin",
      "created_at": "2026-04-01T09:00:00Z",
      "deleted_at": null,
      "relevance": 98.1
    }
  ],
  "pagination": {
    "total": 243,
    "limit": 20,
    "offset": 0,
    "has_next": true,
    "has_prev": false
  }
}
```

### Common fields (all items)

- `type: "track" | "playlist" | "user"` — discriminant.
- `id: number`
- `name: string` — track name, playlist name, or user display handle (Discord username for users).
- `created_at: string` (ISO 8601)
- `deleted_at: string | null`
- `relevance: number | null` — populated in search mode; `null` in browse mode.

### Per-type fields

- **track:** `duration`, `total_play_count`, `raw_total_play_count`, `user: { id, display_name }`.
- **playlist:** `track_count`, `user: { id, display_name }`.
- **user:** (no extra fields in v1).

## Validation (`400 Bad Request`)

Return `400` for any of:

- `q` present but empty after trim, or longer than `config.maxSearchQueryLength`.
- Unknown `type`, `sort`, or `order`.
- `limit < 1`, `limit > config.maxSearchPerPage`, or `offset < 0`.
- `sort=relevance` without `q`.
- `sort=play_count` with anything other than `type=tracks`.
- `playlist_id` with anything other than `type=tracks`.
- `user_id` with `type=users` or `type=all`.
- Any unknown query parameter (schema is strict).

## Relevance model

Unified score applied uniformly across tracks, playlists, and users:

```
score = exact_match   * 100   -- name = q
      + prefix_match  * 12    -- name LIKE CONCAT(q, '%')
      + contains_match * 10   -- name LIKE CONCAT('%', q, '%')
      + fulltext_score        -- MATCH(name) AGAINST (q IN NATURAL LANGUAGE MODE)
```

Booleans evaluate to 0/1, so an exact match accumulates all three LIKE boosts (exact implies prefix implies contains) plus any fulltext score. A row is included in search mode only if `score > 0` (equivalently: at least one of contains or fulltext matches).

The fulltext score uses the MySQL NGRAM parser (token size 2) via fulltext indexes on `tracks.name`, `playlists.name`, and `users.discord_username`.

**Cross-type relevance is not normalized in v1.** When `type=all`, items from all three branches are combined via `UNION ALL` and ordered by the same `score`. Because fulltext scores vary in magnitude across tables, cross-type ordering may mix types non-intuitively when scores are close; the LIKE-based boosts dominate for the common prefix/contains cases, which is the intended UX.

## Examples

### Search everything

```txt
GET /v1/search?q=midnight
```

### Browse all tracks

```txt
GET /v1/search?type=tracks
```

### Search tracks in a playlist

```txt
GET /v1/search?q=drive&type=tracks&playlist_id=12
```

### Browse playlists for a user

```txt
GET /v1/search?type=playlists&user_id=4
```

### Search users sorted by name

```txt
GET /v1/search?q=kev&type=users&sort=name&order=asc
```

## v1 limitations (explicit non-goals)

- No cross-type relevance normalization.
- No cursor pagination — offset/limit only.
- No per-type totals in the response envelope (single `pagination.total`).
- No facets or aggregations.
- No fuzzy matching beyond MySQL NGRAM fulltext.
- `include_deleted` is not yet role-gated; will be tightened when admin routing lands.
