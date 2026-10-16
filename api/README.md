# API

Application logging configuration, redaction and correlation conventions are in
[docs/LOGGING.md](../docs/LOGGING.md).

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
