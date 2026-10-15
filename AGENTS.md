# Repository Guidelines

## Layout Overview
- `.github`: CI workflows for linting, database migrations, and deploy/reset jobs.
- `api/`: Express + TypeScript backend (`src/`, `docs/`, `dist/`).
- `db/`: semver SQL migrations and optional seeds governing schema.
- `frontend/`: Next.js 15 App Router (`src/app`, `src/components`, `src/lib`).
- `gcloud/`: fake GCS service with fixtures in `data/`.
- `tools/`: helper container and scripts; reuse this pattern for the planned `bot/` service.

## Docker & Environment
- Start the stack with `docker compose --env-file dev.env -f docker-compose.dev.yml up --build`; use `down -v` for a full reset.
- Run `docker compose -f <compose file> up` inside a service directory for focused work (API, DB, gcloud, tools, soon bot).
- Keep `.env`, `dev.env`, and `local_dev.env` aligned, document new vars, and add `bot/` compose files before linking them at the root.

## Build, Test, Run
- `api/`: `npm run dev`, `npm run test`, `npm run build && npm start`.
- `frontend/`: `npm run dev`, `npm run lint`, `npm run build`, `npm run start` (configure `NEXT_PUBLIC_API_URL` when containerized).
- `db/`: `docker compose -f db/docker-compose.yml up`; apply migrations sequentially.
- `gcloud/`: `docker compose -f gcloud/docker-compose.yml up` (service listens on 4443).
- `tools/`: `docker compose -f tools/docker-compose.dev.yml up`.
- `bot/` (planned): mirror the API scripts and include them in compose and CI.

## Coding Practices
- Prefer TypeScript and shared contracts (`api/src/`, `frontend/src/lib/types.ts`); keep modules small and reusable.
- From the repository root, use `npm run format:check` with the formatting Python environment activated. Prettier covers active JS/TS/TSX at 120 columns; Ruff formats Python at 88 columns targeting 3.12. See `docs/FORMATTING.md` for setup and exclusions.
- Frontend correctness/framework linting remains `cd frontend && npm run lint`. Formatting CI does not enable Ruff lint/import fixes or add backend ESLint rules.
- SQL migrations stay forward-only and named `<version>__slug.sql`; keep generated seeds out of version control.
- Place reusable scripts in `tools/` with execute bits and README notes.

## Testing
- API: Jest + Testcontainers against disposable databases.
- Frontend: add Playwright or RTL when ready; colocate specs and register scripts in `package.json`.
- DB: run migrations against the compose database before PRs and capture findings in review notes.
- Bot: plan to stub Discord APIs and reuse the API testing stack.

## Git & PR Workflow
- Conventional Commits with directory scopes (`feat(api):`, `chore(db):`, `ci(.github):`, etc.).
- Keep commits small and run the relevant lint/test/build or docker checks before pushing.
- PRs need a clear summary, linked work items, manual verification, UI media when visual, and callouts for migrations or env updates.
- Adjust `.github/workflows` whenever service pipelines change.
