# API

## Library pools and playback events

The API exposes global list/random queries at `GET /v1/library/pools/{name}`
and `GET /v1/library/pools/{name}/random`. Global reads retain the access
behavior of existing routes; `myuploads` requires an authenticated actor.
Lists return stable pages with total counts; `all`, categories and `myuploads`
can be fully paged. Ranked/history pools default to 25 and cap at 100. Random
selection evaluates the full eligible set for `all`, categories and `myuploads`,
and samples unique tracks; `playhistory` samples recent events so repeats retain
their weight. Deleted/unavailable history entries include a reason in list output
and are excluded from random candidates.

Bot reporting uses `POST /v1/plays/events` with a delegated bot actor and a
stable UUID `event_id`. Send the report only after playback enters Playing and
reuse that UUID on retries. The API atomically records the event, ordinary
activity rows/counters and any real category selection. Replaying the same
identity and payload is idempotent; reusing it for a different actor or payload
returns 409. Virtual pools do not create synthetic playlist selections. The
server trusts the authenticated bot process for the playback-state assertion.
See [OpenAPI](src/docs/openapi.yml) and the [accepted bot contract](../specs/bot-parity-decisions.md).

## Production build

From `api/`, run `npm ci && npm run build && npm start` with the runtime
environment configured. The build compiles TypeScript and copies the OpenAPI
document into `dist/docs/openapi.yml`.

From the repository root, build the runtime image entirely from tracked sources:

```bash
docker build --target production -t kevbot_api_production:smoke api
docker run --rm --env-file /path/to/runtime.env -p 3000:3000 kevbot_api_production:smoke
```

Set `KEVBOT_API_ADDRESS=0.0.0.0` and `KEVBOT_API_PORT=3000` for this port mapping.
Supply the required database, GCS, bot, and Discord configuration at runtime
(see `src/config/config.ts`); never bake environment files or credentials into
the image. The database must already be at the API's expected schema version.
The image defaults to `NODE_ENV=production`, includes FFmpeg, compiled code and
production dependencies, and excludes local `dist`, source/tests, and env files.
The `development` and `test` Docker targets remain available.

### Production-image smoke test

With Docker running, from the repository root (no host Node/npm install needed):

```bash
docker build -t migration-manager tools/db/migration_manager
docker build --target production -t kevbot_api_production:smoke api
docker build --target test -t kevbot_api_test api
docker run --rm \
  --network host \
  -v "$PWD/db/migration:/db/migration:ro" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e DOCKER_HOST=unix:///var/run/docker.sock \
  --entrypoint npm kevbot_api_test run test:production
```

The test image runs the Testcontainers orchestration, which starts disposable
MySQL, applies repository migrations, and boots the **actual production image**.
It copies the checked-in `scripts/production-probe.cjs` into that disposable API
container and runs it there to check database access, Swagger UI assets, FFmpeg,
and runtime packaging. The probe/test dependencies are not baked into the
production image. CI uses this same containerized command, separately from the
existing API integration suite.

Each build has a different purpose: the production image is the artifact under
test; the test image supplies Node/Testcontainers and test scripts; and the
migration image prepares the disposable schema. Build from source changes, then
reuse these images for repeat runs; Docker caches unchanged build layers. The
smoke test catches broken packaging/startup, not just Docker build failures.
Prebuilt migration-tool distribution is tracked separately in #154.

This uses synthetic credentials and no real GCS/Discord calls; it is not an
end-to-end storage or OAuth test. The runner is trusted test code with access to
the local Docker daemon through the mounted socket. On Docker Desktop, enable
host networking for the Linux/CI-equivalent `--network host` command above.

## Bot actors and shared library permissions

See [the bot API contract](docs/BOT_API.md) for the service-token/acting-user
exchange, shared category rules and compatibility changes. `MASTER_DISCORD_ID`
is an optional, exact Discord snowflake string; unset means no master override.
Forward it explicitly to the API container. Do not give the bot database or GCS
credentials, or place `BOT_AUTH_API_KEY` in browser configuration.

## Prerequisites

This application depends on FFmpeg being installed on your system.

### Install FFmpeg

- **macOS**: `brew install ffmpeg`
- **Ubuntu/Debian**: `sudo apt install ffmpeg`
- **Windows**: [Download FFmpeg](https://ffmpeg.org/download.html)

Ensure FFmpeg is accessible via your system's `PATH`. Verify with `which ffmpeg`.

## Run tests locally

Ensure the needed images are built

```bash
cd tools/db/migration_manager
docker build -t migration-manager .
```

```bash
cd api
docker build --target test -t kevbot_api_test .
```

```bash
cd api
docker run --rm \
--network host \
-v ./../db/migration:/db/migration \
-v /var/run/docker.sock:/var/run/docker.sock \
-e DOCKER_HOST=unix:///var/run/docker.sock \
kevbot_api_test
```
