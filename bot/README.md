# KevBot Discord service

This service is **not release-ready**. It implements exact-track, typed random,
and raid playback plus playlist management (`newplaylist`, `delplaylist`,
`addtoplaylist`, `delfromplaylist`, `addplayliststo`, and `delplaylistsfrom`)
and user greeting/farewell settings plus typed library listing through the
shared API. Uploads and automatic voice events are separate review slices; full
parity verification remains. The first usable release still requires the full
accepted command set.

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

The bot and frontend install the private local `@kevbot/api-client` package from
`../packages/api-client`. Build the bot image with the repository root as Docker
context so that the package is available; Compose and CI already do this.

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

## Slash commands

The bot registers slash commands separately from startup. Set
`DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID`, then run:

```sh
npm run register:commands
```

For faster development-only updates, also set `DISCORD_GUILD_ID`; registration
then targets that guild. Omit it for global commands. Registration requires the
Discord application's `applications.commands` scope. The runtime continues to
support the configured prefix. Slash results, errors, and mutation confirmations
are ephemeral replies visible only to the invoking user. Prefix-message commands
remain DM-based because Discord does not provide ephemeral replies for them.

Slash inputs expose typed source and playlist fields rather than overloading
track or playlist names. `/search` queries tracks and playlists (or either type)
through the API. Implemented playlist, greeting, and playback operations reuse
the same validators and API-backed handlers as the prefix dispatcher. `/upload`
is registered with attachment and playlist inputs but remains pending until the
upload implementation lands; the slash dispatcher already forwards attachments
for that follow-up.

## Playback command selectors

`pr!` defaults to all active tracks. Virtual sources use an explicit
`source:<type>` selector, for example `pr!source:most_played 25`. Supported types
are `all_tracks`, `most_played`, `my_uploads`, `play_history`, and `upload_history`.
An ordinary selector such as `pr!allcats` selects a playlist by that exact name;
`playlist:<name>` is an explicit equivalent. No playlist or track name is
reserved for a virtual source. Playlist references use the shared API rather
than a separate library resource model.

`list!` pages through the complete active-track, playlist, or personal-upload
source. Ranked and history sources default to 25 entries and accept a length
from 1 through 100. Global play history preserves repeated events and marks
missing/deleted tracks; upload history shows timestamps and unavailable entries.
The command refuses results larger than its page or Discord-DM budget instead
of silently returning only the first page.

Voice playback uses the API's bounded audio stream and reports playback only
after Discord's audio player reaches `Playing`. The voice adapter checks bot
Connect/Speak permissions, allows one active playback per guild, bounds
connection/start/finish waits, and disconnects on completion or failure.
