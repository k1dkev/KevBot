# KevBot

A shared audio library with an Express/TypeScript API, MySQL, GCS audio storage,
and a Next.js website. The website currently supports login, browse/search,
profiles, playlist detail and single-track playback. Web management flows and the
replacement Discord bot remain work; the legacy bot lives in `v1/`.

Start with the [documentation index](docs/README.md),
[product requirements](PRD.md), [architecture](ARCHITECTURE.md) and
[roadmap](ROADMAP.md). GitHub issues track delivery, rather than copied checklists.

The first usable v2 release requires full legacy bot parity. The owner accepted
the [parity contract](specs/bot-parity-decisions.md) in
[#141](https://github.com/k1dkev/KevBot/issues/141#issuecomment-6207636658);
[#169](https://github.com/k1dkev/KevBot/pull/169) records publication. Design
acceptance is separate from API/bot implementation and release verification.

## Local development

Commands here match `main` at `41a221b` (2026-10-15). Use Docker with Compose
`include` support for the service stack. For host development, the API declares
Node `>=20.17.0 <21` (its image uses 20.17.0); frontend/formatting CI uses Node 22.
Python tools use Python 3.12; host audio processing also requires FFmpeg/ffprobe.

Supply your own ignored `dev.env` before running Compose. Its variables must
satisfy the [included service files](docker-compose.dev.yml) and
[API runtime validator](api/src/config/config.ts); the old
[`api/.env.example`](api/.env.example) is incomplete and is not a full stack
template. Environment-example cleanup remains under
[#145](https://github.com/k1dkev/KevBot/issues/145).

From the repository root:

```sh
docker compose --env-file dev.env -f docker-compose.dev.yml config --services
docker compose --env-file dev.env -f docker-compose.dev.yml up --build
```

This starts MySQL, fake GCS, API and tools. It does **not** start frontend/bot or
apply migrations. An empty database needs an explicit migration before the API
can satisfy its schema-version check. Use the
[migration-manager instructions](tools/db/migration_manager/README.md) with an
explicitly selected disposable/local database; sensitive fixture copying is not
a prerequisite for automated tests. Do not treat the historical reseeding
recipe as a production or recovery runbook.

Run the frontend separately after configuring its ignored `.env.local` according
to [frontend configuration](frontend/README.md#environment-variables) and
[the validator](frontend/src/lib/config.ts). Give the API a distinct port from
Next's default 3000, and set the browser API URL and Discord redirect to match
your chosen local addresses.

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

For a host API, install its dependencies with `npm --prefix api ci`, provide its
required environment and run `npm --prefix api run dev`. Container and host
database/storage addresses can differ; do not copy URLs blindly between them.
See the [API runbook](api/README.md) for build/start and container testing.

To stop this Compose project while retaining database volumes:

```sh
docker compose --env-file dev.env -f docker-compose.dev.yml down
```

## Verification

Install the pinned repository formatters using
[docs/FORMATTING.md](docs/FORMATTING.md), activate `.venv-format`, then run from
the root:

```sh
npm ci
npm run format:check
npm --prefix frontend run lint
npm --prefix frontend run test:unit
```

The [frontend runbook](frontend/README.md#checks-and-browser-smoke-tests) provides
the configured build, browser installation and `test:e2e` commands. Those checks
use synthetic fixtures. The [API runbook](api/README.md#run-tests-locally) builds
the migration/test images and runs Jest/Testcontainers against disposable MySQL;
[production smoke instructions](api/README.md#production-image-smoke-test) verify
the actual runtime image. `npm test` alone does not prepare those dependencies.

CI is configured for these checks on PRs to `main`; see the
[workflow](.github/workflows/continuos-integration.yml) and
[formatting workflow](.github/workflows/formatting.yml). Configured checks and
checks required by branch protection are different; see the
[observed repository settings](.github/REPOSITORY_SETTINGS.md).

## Contributing and releases

Use [CONTRIBUTING.md](CONTRIBUTING.md) for Conventional Commit titles, review,
merge choices and [release behavior](CONTRIBUTING.md#releases). Component versions
come from package/version files and the
[release manifest](.github/.release-please-manifest.json), rather than examples
copied into this README. Generated changelogs are release history;
[RELEASE_NOTES.md](RELEASE_NOTES.md) contains human-written highlights.

## License

ISC
