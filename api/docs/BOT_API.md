# Bot API: actors and library policy

Implements the identity/policy gap in [the accepted parity contract](../../specs/bot-parity-decisions.md)
(owner acceptance recorded in [#141](https://github.com/k1dkev/KevBot/issues/141#issuecomment-6207636658), published by #169).
Relevant command rows: upload, add/remove category, delete category and greeting/farewell preferences.
The API, not a Discord guild role or client-side permission flag, is authoritative.

## Service identity versus acting user

1. The trusted bot backend sends `POST /v1/bot/auth` with `x-bot-key: <BOT_AUTH_API_KEY>`.
   The result is a short-lived Bearer JWT with `role: bot` and no acting user.
2. For an actual Discord event, send `POST /v1/bot/actors/resolve` using that service
   Bearer token and JSON `{"discord_id":"1234567890123456789"}`. Pass the gateway
   event's author ID, never a user-provided numeric ID/argument. Snowflakes remain
   strings end to end. The API resolves or atomically provisions the user without
   a website login. The strict body accepts no other fields.
3. The response is `{access_token, token_type: "Bearer", expires_in, role: "bot", user}`.
   Use this actor token on ordinary authenticated endpoints. Renew by resolving
   again when expired; no refresh cookie or website session is created.

An actor token retains bot service provenance, but its signed actor ID/snowflake
must match the current user record on every authenticated request. Browser user
tokens and delegated actor tokens cannot call actor resolution. Forged/expired
tokens and mismatched actors fail authentication. A service-only token cannot
mutate library resources or masquerade as user ID 0. Existing optional-auth play
endpoints may record anonymous plays, but never attribute them to ID 0.

The service API key is a privileged trust boundary: anyone holding it can resolve
actors. Keep it server-only, rotate it if exposed, use HTTPS outside local
development, and use bounded in-memory token caches that never cross actor IDs.
An ordinary website access token cannot opt into delegation with a header/body.

## Shared policy and compatibility

- Authenticated actors may create categories and add existing, nondeleted tracks
  to any active, nonreserved category. Membership records retain the adding actor.
- Only the category creator or configured master may remove members or soft-delete
  an empty category. Deletion returns 409 while any membership remains, including
  a soft-deleted track; explicitly remove that membership first. Membership writes
  and deletion lock the category row so concurrent adds cannot create a deleted,
  nonempty category. Adding/removing members of deleted categories returns 404.
- Configure the optional API `MASTER_DISCORD_ID` to an exact 17–20 digit snowflake
  string. The API compares it with the resolved database identity, not a client
  claim. Unset disables the override. Guild administrator roles are irrelevant.
  Master is **not** a blanket override: track/profile/preferences stay self/owner-only;
  category rename/restore remain creator-only.
- `categories`, `cats`, `emptycats`, `all`, `mostplayed`, `myuploads`, `playhistory`
  and `uploadhistory` are protected virtual names. No actor, including master,
  may create, rename, restore or mutate a real category using these names. Existing
  conflicting rows are not deleted automatically. `allcats` is an ordinary name.
- New/renamed category names are lowercase ASCII letters/digits, up to 45 characters,
  matching the existing MySQL column. Track names remain capped at 15 characters.
  Existing compatible data is not renamed or truncated; no schema migration is needed.
- Greeting references must be active tracks or active, nonempty categories. Farewell
  tracks must be strictly shorter than 4 seconds for everyone, including master.
  The existing HTTP farewell-category form is retained, but every active member must
  meet that limit and the category must be nonempty. Legacy preferences are not
  rewritten; playback must recheck eligibility because membership may later change.
- Strict new-upload duration below 15 seconds is implemented by the shared audio
  pipeline in #151; do not interpret this actor PR as retroactively deleting
  existing 15-second tracks. Bot playback still needs the accepted selection-time checks.

These are intentional API policy changes from permissive deleted-reference writes
and nonempty category deletion. No bot gateway, playback or production deployment
is introduced here. API pool/history/reporting endpoints are the separate #158 step.

## Verification

Run `cd api && npm test -- --runInBand tests/integration/botActors.test.ts`
with Docker running and the migration-manager image built as described in the
[API README](../README.md). Tests use synthetic IDs and disposable MySQL, covering
concurrent first resolution, service/browser/delegated boundaries, forged claims,
creator/master/unrelated policies, protected names, deleted/empty references,
45-character categories, unchanged track-name limits and farewell 3/3.999/4 boundaries.
