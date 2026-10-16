# API

## Standalone audio normalization

`POST /v1/audio/normalize` accepts one multipart `file` and returns normalized
MP3 bytes directly. It uses the same `auth.requireAuth` bearer policy as track
upload; supply the authenticated user's access token. No track name, playlist,
database record, playback event, or permanent storage object is created.

```bash
curl --fail --show-error \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --form "file=@clip.mp3;type=audio/mpeg" \
  http://localhost:3000/v1/audio/normalize \
  --output clip-normalized.mp3
```

Supported input is actual MP3 audio with a case-sensitive `.mp3` filename,
at most **3,000,000 bytes**, and a positive FFprobe duration **strictly less
than 15 seconds**. Probed duration includes MP3 encoder padding. The exclusive
duration bound applies to new library uploads too, per accepted
[decision D3](../specs/bot-parity-decisions.md); existing library data is unchanged.
Send only the `file` field. Additional files or text fields are rejected.

Both endpoints share the existing two-pass FFmpeg pipeline: target **-16 LUFS**,
maximum **-1.5 dBTP**, verified within **±2.5 LUFS**, with no true-peak overshoot
and at most **0.01 seconds** duration change. Silence or other audio whose output
cannot satisfy verification produces an error. Targets/tolerances come from the
existing audio constants and API config; no additional environment is required.

A successful response is `200 audio/mpeg`, with `Content-Length`,
`Cache-Control: no-store` and an attachment filename derived from the basename:
ASCII letters/digits/underscore/hyphen only, at most 80 stem characters, followed
by `-normalized.mp3`. Unsafe characters become underscores; an empty stem uses
`audio`. Paths from the client never become server processing paths.

Errors use `{statusCode, error, message}`: `400` for missing/extra fields,
malformed multipart, corrupt/unsupported audio or duration violations; `401` for
missing/invalid authentication; `403` when the shared authentication policy
rejects the caller; `413` for oversized files; and `500` for normalization,
verification or local I/O failures. The shared upload handler now uses HTTP 413
as well as JSON `statusCode: 413` for oversized library uploads. Processing
errors are reported before binary streaming begins. If streaming fails after
headers are sent, the connection closes and the incomplete download must be
discarded.

Uploads are buffered within the byte limit, then written into a private,
request-specific temporary directory. Input and output stay available until
processing/streaming finishes. Disconnects cancel active FFmpeg work and the
response stream; cleanup waits for them to stop before removing the directory.
Partial multipart uploads create no disk files. Cleanup failures are logged.

The [OpenAPI document](src/docs/openapi.yml) describes the binary request/response.
`npm test -- --runInBand tests/integration/audio.test.ts tests/unit/audioService.test.ts`
runs real FFmpeg/FFprobe audio checks, HTTP disconnect/concurrency cases,
temporary-file cleanup, unchanged MySQL library rows and fake-GCS objects,
and precise duration-boundary checks. It requires the disposable test
infrastructure described below; no production services are used.

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
