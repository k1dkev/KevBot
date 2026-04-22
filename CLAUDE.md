# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is KevBot

KevBot is a Discord bot and music management platform. It is a monorepo with an Express + TypeScript API, a Next.js 15 frontend, MySQL database with versioned migrations, and a local Google Cloud Storage emulator. Both the frontend and Discord bot are thin clients — all business logic, FFmpeg audio normalization, and persistence live in the API.

## Commands

### Full Stack (Docker)
```sh
docker compose --env-file dev.env -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml down -v  # full reset with volume wipe
```

### API (`cd api`)
```sh
npm run dev       # nodemon dev server
npm run build     # TypeScript compile to dist/
npm test          # Jest + Testcontainers integration tests
npm run ci-test   # starts server then runs tests (CI mode)
```

To run a single test file or by name:
```sh
npm test -- tests/integration/auth.test.ts
npm test -- --testNamePattern="your test name"
```

### Frontend (`cd frontend`)
```sh
npm run dev    # Next.js dev server (Turbopack)
npm run build  # production build
npm run lint   # ESLint via next lint
```

### Database (`cd db`)
```sh
docker compose up  # starts MySQL + migration manager
```

## Architecture

```
Clients (Frontend / Discord Bot)
         ↓ REST/JSON
Express API  ←→  MySQL (Kysely ORM)
     ↓
Google Cloud Storage (audio files)
```

**API (`api/src/`)** — modular Express app:
- `services/` — business logic (auth, tracks, playlists, plays, search, users)
- `controllers/` — request handlers per service
- `routes/` — REST endpoints under `/v1/*`; includes `bot/` and `dev/` routes
- `middlewares/` — JWT auth, error handling, CORS
- `schemas/` — Zod input validation
- `db/` — Kysely database connection + query helpers
- `models/` — Kysely TypeScript types for all tables
- `storage/` — GCS bucket operations
- `utils/` — FFmpeg audio normalization (EBU R128 standard)
- `tasks/` + `schedulers/` — node-cron scheduled jobs
- `config/config.ts` — Zod-validated env config (validates all vars at startup)
- `docs/openapi.yml` — OpenAPI spec, served at `/v1/docs`

**Track upload constraints:** `.mp3` only, ≤ 3 MB, ≤ 15 s, name lowercase alphanumeric ≤ 15 chars. FFmpeg normalizes to -16 LUFS (EBU R128), then both the normalized and original MP3s are stored in GCS as `{trackId}.mp3` and `{trackId}.original.mp3`.

**Tests** use Testcontainers to spin up an isolated MySQL 8.0.30 container per test run. No mocking of the database.

**Search** uses MySQL fulltext with the NGRAM parser (token size = 2) on tracks, playlists, and users. All search logic (hybrid ranking, browse vs. search modes, cross-entity merging) lives in `searchService`; `tracksService`, `playlistsService`, and `usersService` are CRUD-only by design — do not add search helpers back to them. The `/v1/search` contract is locked in `specs/search.md`.

**`specs/`** (repo root) holds authoritative cross-component specs. Treat these as source of truth when changing behavior that spans multiple components.

## Database Migrations

- Location: `db/migration/migrations/`
- Naming: `X.Y.Z__description.sql` (semver, forward-only, no rollbacks)
- Current version: `2.14.0`
- Applied automatically by a Docker migration manager container on startup

## Key Environment Variables

Validated by Zod in `api/src/config/config.ts`:

| Variable | Purpose |
|---|---|
| `DB_CONNECTION_STRING` | MySQL connection URL |
| `KEVBOT_API_JWT_SECRET` | JWT signing secret |
| `KEVBOT_API_PORT` / `KEVBOT_API_ADDRESS` | Server binding |
| `GCP_API_ENDPOINT` | GCS endpoint (`http://localhost:4443` locally) |
| `GCP_TRACKS_BUCKET_NAME` | Audio storage bucket |
| `BOT_AUTH_API_KEY` | Bot service token |
| `DEV_AUTH_SECRET` | Dev-mode auth bypass |
| `DISCORD_OAUTH2_CLIENT_ID/SECRET/REDIRECT_URI` | OAuth2 |
| `AUTH_ACCESS_TOKEN_TTL_MINUTES` / `AUTH_REFRESH_SESSION_TTL_DAYS` | Token lifetimes |

Env files: `.env` (symlink to `local_dev.env` locally), `dev.env` (Docker/CI), `local_dev.env` (local overrides, not committed). Keep all three in sync when adding new variables.

## Git & PR Conventions

- **Branch commits:** any format is fine (all squashed on merge)
- **PR titles:** must follow Conventional Commits — `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `chore`, `docs`, `test`, `ci`, `refactor`
  - Scopes: `api`, `frontend`, `db`, `gcloud`, `tools`, `bot`
  - Breaking change: append `!` after scope → `feat(api)!: ...`
- **Merge strategy:** squash merge only (enforced)
- Releases are automated via release-please; do not manually edit `CHANGELOG.md` files

## Component Versioning

Each component is versioned independently. Release tags: `api-v2.x.x`, `db-v1.x.x`, `frontend-v0.x.x`, `tools-v1.x.x`, `gcloud-v1.x.x`. Overall app tag: `v2.x.x-beta.x`. GitHub Releases are created manually from `RELEASE_NOTES.md`.
