# KevBot Discord service

This service is **not release-ready**. It implements exact-track, typed random,
and raid playback plus playlist management (`newplaylist`, `delplaylist`,
`addtoplaylist`, `delfromplaylist`, `addplayliststo`, and `delplaylistsfrom`)
and user greeting/farewell settings through the shared API. Uploads, automatic
voice events, and full parity verification remain follow-up work. The first
usable release still requires the full accepted command set.

## Local checks and development

Use Node.js `>=22.12.0 <23`:

```sh
npm ci
npm test
npm run dev
```

`npm test` compiles the TypeScript and runs offline command, playback, API-client,
gateway-lifecycle, redaction, and private-reply tests. `npm run dev` expects the
environment described in `.env.example` to be supplied by the shell or IDE; the
service does not load dotenv files itself. `npm run build` then
`npm run check:config` validates configuration without opening a Discord
connection. Never commit local tokens or API keys.

Required runtime settings are `DISCORD_BOT_TOKEN`, `BOT_AUTH_API_KEY`, and
`API_BASE_URL`. The remaining optional bounds, logging level and prefix are
listed in `.env.example`. The bot has no MySQL, Kysely, or GCS dependency and
must not receive database or storage credentials.

## Compose

The bot is behind the opt-in `bot` Compose profile. From the repository root,
configure `DISCORD_BOT_TOKEN` and `BOT_AUTH_API_KEY` in the untracked local
`dev.env`, then start the normal stack with the bot profile:

```sh
docker compose --env-file dev.env -f docker-compose.dev.yml --profile bot up --build
```

The Compose adapter maps `BOT_API_BASE_URL` (default `http://api:3000`) to the
container's `API_BASE_URL`, and `BOT_LOG_LEVEL` to `LOG_LEVEL`. The bot obtains
acting-user credentials from the API; it never connects directly to MySQL or
GCS. Do not enable this profile with a production Discord token as a local test.

CI builds the production image and runs help/configuration checks with networking
disabled and synthetic values. It performs no Discord gateway login or deployment.

## Playback command selectors

`pr!` defaults to all active tracks. Virtual sources use an explicit
`source:<type>` selector, for example `pr!source:most_played 25`. Supported types
are `all_tracks`, `most_played`, `my_uploads`, `play_history`, and `upload_history`.
An ordinary selector such as `pr!allcats` selects a playlist by that exact name;
`playlist:<name>` is an explicit equivalent. No playlist or track name is
reserved for a virtual source. Playlist references use the shared API rather
than a separate library resource model.

Voice playback uses the API's bounded audio stream and reports playback only
after Discord's audio player reaches `Playing`. The voice adapter checks bot
Connect/Speak permissions, allows one active playback per guild, bounds
connection/start/finish waits, and disconnects on completion or failure.
