# API

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

With Docker running, from the repository root:

```bash
docker build -t migration-manager tools/db/migration_manager
docker build --target production -t kevbot_api_production:smoke api
cd api
npm ci
npm run test:production
```

This starts disposable MySQL, applies repository migrations, starts the actual
production image, and checks database access, Swagger UI assets, FFmpeg, and
runtime packaging. It uses synthetic credentials and no real GCS/Discord calls;
it is not an end-to-end storage or OAuth test. CI runs the same smoke probe from
the test image, separately from the existing API integration suite.

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
