# KevBot Unified Audio Platform PRD

## 1. Overview

KevBot will provide a single audio library experience surfaced through both a web application and a Discord bot. Creators upload short-form audio clips once, and listeners can discover, queue, and play them in either surface while sharing playlists across the ecosystem. The backend REST API underpins every interaction so that feature parity, governance, and analytics remain consistent.

## 2. Goals & Success Metrics

- Deliver a shared backend that serves the frontend and Discord bot without bespoke business logic in either client.
- Enable upload, normalization, storage, and playback of user-generated audio tracks (≤15 seconds, MP3 only).
- Allow authenticated users to build and manage playlists that can be consumed from web or Discord.
- Track usage with existing play logging endpoints to inform content quality and engagement.
- Success metrics: 100% of bot actions callable via public API, 95th percentile stream start < 2s, <1% failed uploads, playlist engagement (≥1 playlist per active user), daily play logs captured for ≥90% of plays.

## 3. Target Users & Personas

- **Uploader (Web power user):** Curates audio clips, manages metadata, builds playlists, monitors engagement.
- **Listener (Web or Discord):** Browses tracks and playlists, plays audio, saves playlists for reuse.
- **Community Moderator (Discord):** Triggers playback in voice channels, manages shared playlists, monitors bot usage.
- **System Administrator:** Maintains storage buckets, monitors normalization jobs, ensures compliance with audio policies.

## 4. Scope

### In Scope (MVP)

- Web app for authentication, upload, library browse, playlist CRUD, and streaming playback.
- Discord bot that authenticates against the API, lists/streams tracks, and manages playlists (where permissions allow).
- Shared user identity model (username/password with optional Discord linkage) leveraging `/v1/auth` and `/v1/users` endpoints.
- Audio normalization pipeline (ffmpeg loudnorm) and Google Cloud Storage-backed file management as implemented in the API.
- Play logging for tracks and playlists via `/v1/plays` routes.

### Out of Scope (Future Considerations)

- Payments or licensing workflows.
- Moderation queue or automated content flagging.
- Real-time collaborative editing or synchronous listening rooms.
- Rich analytics dashboards (beyond basic play counts surfaced from API).

## 5. Functional Requirements

### 5.1 Shared Backend API

- Every client call must route through the Express API (`/v1/*`). No direct database or storage access from web or bot.
- JWT authentication: obtain via `POST /v1/auth/login`; include Bearer token on protected endpoints. Tokens expire per config (`jwtTokenExpirationTime` default 1h).
- Enforce resource ownership: track and playlist mutations require auth and must respect API-level permission checks.
- Expose OpenAPI docs at `/v1/docs` for client generation and QA.

### 5.2 Audio Track Management

- Upload flow (web): gather track name + MP3 file, call `POST /v1/tracks` with multipart `file`. Respect backend constraints (extension `.mp3`, ≤3 MB, ≤15s duration, lowercase alphanumeric names ≤15 chars).
- Bot must reuse uploaded assets; no separate Discord file storage. For playback, bot streams via `GET /v1/tracks/:id/stream` using HTTP range requests to reduce latency.
- Download option in web UI via `GET /v1/tracks/:id/download` for admins/moderators.
- Support browsing catalog with search & pagination using `GET /v1/tracks?name=&limit=&offset=` and include deleted toggle for admins.
- Permit edits (`PATCH /v1/tracks/:id`), soft deletes (`DELETE /v1/tracks/:id`), and restores (`PATCH /v1/tracks/:id/restore`) while honoring ownership.

### 5.3 Playlist Management

- Create playlists via `POST /v1/playlists` (names lowercase alphanumeric, ≤15 chars). Display playlist list with optional filters.
- Manage lifecycle: edit (`PATCH`), soft delete (`DELETE`), restore (`PATCH /restore`).
- Maintain playlist membership through `POST /v1/playlists/:id/tracks` and `DELETE /v1/playlists/:id/tracks`; prevent duplicates and report invalid track IDs using API responses.
- Retrieve playlist contents via `GET /v1/playlists/:id/tracks` for web playback queues or Discord random selection.

### 5.4 Playback & Activity Logging

- Log each play event from web audio player and Discord bot using `POST /v1/plays/tracks`. Include `play_type` to differentiate organic, random, greeting, raid, or farewell usage.
- When the bot triggers a “random playlist” session, call `POST /v1/plays/playlists/random`.
- Web UI should surface play counts (total + raw) from track listings (`total_play_count`, `raw_total_play_count`).

### 5.5 User & Identity Management

- Registration (`POST /v1/auth/register`) with password policy (8–64 chars, mixed case, digit, special char, no spaces) and unique username constraint.
- Support username updates via `PATCH /v1/users/:id` (self-only) and profile retrieval via `/v1/users/@me`.
- Discord linking: leverage `GET /v1/users?discordId=` and exposed fields (`discord_id`, `discord_username`) to sync bot membership with API users. Define flow for bot to exchange Discord OAuth or guild data to attach IDs.
- Optional greeting/farewell configuration from web UI using `PUT /v1/users/@me/greeting` and `PUT /v1/users/@me/farewell` so bot can play intro/outro audio.

### 5.6 Client-Specific Requirements

- **Web Frontend**
  - Responsive UI for library browse, waveform player (or HTML5 audio) using streaming endpoint.
  - Upload form with validation reflecting backend constraints before submission.
  - Playlist builder UX (drag/drop or simple add/remove) that mirrors API responses.
  - Authentication state management storing JWT securely (HttpOnly cookie recommended).

- **Discord Bot**
  - Command set covering: login/setup (if required), list tracks/playlists, play track in voice channel, add/remove tracks in playlist when permitted, configure greetings/farewells.
  - Handle API auth via service credentials or bot-specific user token; refresh prior to expiry.
  - Stream audio by fetching `/v1/tracks/:id/stream` and piping into Discord voice connection.
  - Respect rate limits and provide feedback messages on API errors (conflicts, forbidden, validation).

## 6. API Capabilities Reference

| Endpoint                     | Method           | Description                                         | Auth                         |
| ---------------------------- | ---------------- | --------------------------------------------------- | ---------------------------- |
| `/v1/auth/register`          | POST             | Register new user with password policy enforcement. | Public                       |
| `/v1/auth/login`             | POST             | Authenticate and return JWT.                        | Public                       |
| `/v1/users`                  | GET              | Query users by username/Discord metadata.           | Optional                     |
| `/v1/users/@me`              | GET              | Fetch current user profile.                         | Required                     |
| `/v1/users/@me`              | PATCH            | Update own username.                                | Required                     |
| `/v1/users/@me/greeting`     | GET/PUT          | Retrieve or set greeting track/playlist.            | Required                     |
| `/v1/users/@me/farewell`     | GET/PUT          | Retrieve or set farewell track/playlist.            | Required                     |
| `/v1/users/:id`              | GET/PATCH        | Read or update user (admin/self).                   | Mixed                        |
| `/v1/tracks`                 | GET/POST         | List or upload tracks; upload requires multipart.   | GET public, POST auth        |
| `/v1/tracks/:id`             | GET/PATCH/DELETE | Retrieve, rename, or soft delete track.             | GET public, mutations auth   |
| `/v1/tracks/:id/restore`     | PATCH            | Restore soft-deleted track.                         | Required                     |
| `/v1/tracks/:id/download`    | GET              | Download MP3 attachment.                            | Optional                     |
| `/v1/tracks/:id/stream`      | GET              | Stream MP3 with range support.                      | Optional                     |
| `/v1/playlists`              | GET/POST         | List/create playlists.                              | GET optional, POST auth      |
| `/v1/playlists/:id`          | GET/PATCH/DELETE | Read, rename, or soft delete playlist.              | GET optional, mutations auth |
| `/v1/playlists/:id/restore`  | PATCH            | Restore playlist.                                   | Required                     |
| `/v1/playlists/:id/tracks`   | GET/POST/DELETE  | Read or mutate playlist membership.                 | GET optional, mutations auth |
| `/v1/plays/tracks`           | POST             | Log track play with play type.                      | Optional                     |
| `/v1/plays/playlists/random` | POST             | Log random playlist play.                           | Optional                     |
| `/v1/docs`                   | GET              | Swagger UI for API.                                 | Public                       |

## 7. Data Model & Constraints

- **Tracks**: `id`, `name`, `duration`, owner `user_id`, timestamps, optional `deleted_at`, play counters. Names must be lowercase alphanumeric ≤15 chars, unique among active tracks.
- **Playlists**: `id`, `name`, owner, timestamps, optional `deleted_at`. Names share same constraints and uniqueness as tracks.
- **Playlist Membership**: `playlist_tracks` ensures unique track entries; API prevents duplicates and validates existence.
- **Users**: `id`, `username` (unique), optional `discord_id`/`discord_username`, optional password hash. Greetings/farewells link to either a single track or playlist at a time.
- **Audio Files**: Stored in Google Cloud Storage bucket as `{trackId}.mp3` and `{trackId}.original.mp3` (original kept for audit). Normalized output must stay within acceptable loudness band (±2.5 LU from -16 LUFS, peak ≤ -1.5 dBTP).

## 8. Non-Functional Requirements

- **Performance:** Stream endpoint must initiate playback within 2 seconds for 95th percentile requests. Upload processing (normalize + store) should complete within 5 seconds for standard clips.
- **Reliability:** Soft delete/restore ensures recoverability; ensure background clean-up of temp upload files executes even on errors.
- **Security:** Store JWT secret securely; enforce HTTPS between clients and API. Validate all API inputs via existing Zod schemas to prevent injection.
- **Scalability:** Design for horizontal scaling of API service; shared storage bucket must support concurrent uploads/streams.
- **Observability:** Log normalization failures, API errors, and play events. Expose metrics for upload success rate, stream latency, and play counts.
- **Compliance:** Adhere to Discord ToS for bot audio streaming; ensure user-uploaded content meets copyright guidelines.

## 9. Dependencies & Environment

- Express + TypeScript API (existing) hosted with Docker Compose; relies on PostgreSQL (via Kysely) and Google Cloud Storage bucket (emulated locally via `gcloud/` service).
- FFmpeg required for loudness normalization; ensure container image bundles necessary binaries.
- Frontend: Next.js 15 app; update `.env` files to include API base URL and bot-specific configurations.
- Discord bot (planned) should mirror API service pattern under `bot/`, reusing tooling from `tools/`.

## 10. Analytics & Telemetry

- Use `track_play_counts` and `track_play_type_counts` to surface top content in UI dashboards.
- Capture client context (surface = web/discord, guild/channel IDs) via optional metadata in play logs (extend API if needed).
- Monitor playlist creation/deletion rates and correlate with engagement.

## 11. Risks & Open Questions

- How will Discord users authenticate against the API? Need token exchange or service account strategy without storing end-user passwords.
- Is additional rate limiting required to protect `/v1/tracks/:id/stream` when exposed publicly?
- Do we need moderation tools for uploaded audio (e.g., manual review queue)?
- Clarify retention policy for original (unnormalized) MP3s stored alongside normalized versions.
- Determine permission model for shared playlists (owner-only edits versus collaborative editing).

## 12. Milestones & Next Steps

1. Finalize API client contracts and document Swagger references for frontend/bot teams.
2. Implement frontend upload + streaming UI backed by existing routes; add integration tests.
3. Scaffold Discord bot service (`bot/`) with auth client, playback commands, and playlist management.
4. Build shared design system & playback components to reuse between web player and future bot dashboards.
5. Launch closed beta (select Discord guild) to validate end-to-end flow, gather telemetry, and iterate on UX.
