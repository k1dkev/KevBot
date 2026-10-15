# TODOS

> Historical backlog and design sketches. Use [ROADMAP.md](ROADMAP.md) for the
> consolidated v2 plan and GitHub issues for execution after triage. Several
> unchecked items below are already implemented or superseded; see the
> [planning audit](docs/PLANNING_AUDIT.md) before treating them as requirements.

## High Priority

- [ ] implement OAuth2 with discord on all api endpoints [OAuth2 for API](#oauth2-for-api)
- [ ] add dev-only auth helpers + env docs (AUTH_ALLOW_DEV_LOGIN, DEV_AUTH_SECRET)
- [ ] is the factory pattern I have established any good? I want to review this
- [ ] consider storing UUID in mysql as 16 bytes instead of 36 chars. Can us functions `UUID_TO_BIN` and `BIN_TO_UUID`.
- [ ] consider using `express-session`
- [ ] review maybe in more detail the tracking of ip address and user-agent in the sessions
- [ ] is the factory pattern I have good?

## Medium Priority

- [ ] remove `start-server-and-test` dependency from `api/package.json`

## Low Priority

- [ ] Release notes
  - upload should be more consistent with normalization as well as not cutting off audio

## Designs

### OAuth2 for API

Here’s a clean, moderately detailed “do-this” plan you can build against.

#### 1) Data model (DB)

- `users(id uuid pk, email nullable, created_at)`
- `auth_providers(user_id fk -> users.id, provider ENUM('discord', ...), provider_user_id varchar, pk(provider, provider_user_id), linked_at)`
- `sessions(id uuid pk, user_id fk, created_at, expires_at, is_revoked boolean default false, user_agent, ip)`
- (Optional) `discord_profiles(user_id fk, username, global_name, avatar, last_seen_at)` for display only.

#### 2) Tokens & cookies

- **Access token**: JWT (HS256 fine), TTL 15–20 min, claims: `sub=<user_id>`, `role=('user'|'bot')`, `sid=<session_id>`, `iat`, `exp`, `aud='api'`.
- **Refresh cookie**: `refresh_session=<opaque session_id>`; HttpOnly, Secure, SameSite=Lax, Max-Age ~60–90 days (sliding), Path `/auth`.
- Generate `session_id` with UUIDv4 or 128–256-bit CSPRNG. Never expose it outside the HttpOnly cookie.

#### 3) Auth endpoints (API)

**/auth/exchange (user login via Discord)**

- **Request**: `{ "provider":"discord", "provider_access_token":"<discord_access_token>" }`
- **Server**:

  1. Call Discord `GET /users/@me` with the access token; read authoritative `id`.
  2. Upsert `auth_providers(provider='discord', provider_user_id=id)` → get/create `users.id`.
  3. Create `sessions` row (id, user_id, expires_at = now + 90d).
  4. Set cookie `refresh_session=<session_id>` (HttpOnly, Secure, SameSite=Lax).
  5. Return `{ access_token, expires_in, user: { id } }`.

- **Notes**: API performs the Discord verification (don’t trust client-provided IDs).

**/auth/dev-exchange (dev-only user login)**

- **Enabled** only when `AUTH_ALLOW_DEV_LOGIN=true` and `DEV_AUTH_SECRET` is configured.
- **Request**: Header `x-dev-auth-secret: <DEV_AUTH_SECRET>` and body `{ user_id?, discord_user_id?, email?, username? }`.
- **Server**: Validate header + flag, upsert stubbed user + provider rows, create session, reuse access token issuance from `/auth/exchange`.
- **Notes**: Log a prominent warning; reject when `NODE_ENV==='production'` regardless of the flag.

**/auth/refresh**

- **Request**: Cookie `refresh_session=<session_id>`
- **Server**: Validate session (exists, not revoked, not expired) → issue new access JWT; optionally “slide” `expires_at` if near end → return `{ access_token, expires_in }`.

**/auth/logout**

- **Request**: Cookie present
- **Server**: `is_revoked = true`, clear cookie, `204`.

**/me**

- **Auth**: Bearer access token
- **Server**: Return minimal user summary; good wiring test.

**/auth/login** & **/auth/register**

- Keep legacy username/password endpoints temporarily, but mark as deprecated once OAuth + sessions ship.

#### 4) Bot auth

**/bot/auth**

- Option A (simple): header `x-bot-key: <API_KEY>` → issue access JWT with `role='bot'`, TTL 20–30 min.
- Option B (stronger): header `Authorization: Bearer <bot_service_jwt>` (bot-signed) → verify with bot public key → issue access JWT `role='bot'`.
- Bot re-calls `/bot/auth` to refresh; no refresh cookie for the bot.

##### Better way to handle the secret.

headers

```
X-Bot-Id: discord-bot
X-Timestamp: 2025-10-23T15:05:00Z
X-Signature: <hex HMAC-SHA256(secret, timestamp + "\n" + body)>
```

maybe add kevbot to headers to make the scoping clear.

server flow:

```ts
const botId = req.header("X-Bot-Id");
const secret = lookupSecret(botId);
verifyHmac(secret, timestamp, body, signature);
```

#### 5) Unified media endpoints

**/tracks/upload-url (one endpoint for user & bot)**

- **Auth**: Bearer access token
- **Body**:

  - If `role='user'`: `{ filename, content_type }` (owner = `req.auth.userId`)
  - If `role='bot'`: `{ discord_user_id, filename, content_type }` (API resolves/creates user by Discord ID → owner)

- **Resp**: `{ url, expires_in }` (GCS signed PUT URL, 1–5 min)
- Enforce: Forbid `discord_user_id` when `role='user'`; require it when `role='bot'`.

**/tracks/:id/play-url**

- **Auth**: user or bot
- **Server**: Check authorization (owner or allowed) → return GCS signed GET URL (short TTL).

#### 6) Request flow (user)

1. **Login** in Next.js via Discord OAuth (NextAuth or custom PKCE).
2. Next.js sends `provider_access_token` → `/auth/exchange`.
3. API verifies with Discord, sets **HttpOnly refresh cookie**, returns **access JWT**.
4. API calls include `Authorization: Bearer <access>`; refresh:

   - Proactively when `<2 min` left, or reactively on first `401`:
   - Call `/auth/refresh` (cookie auto-sent), replace access token, retry once.

#### 7) Request flow (bot)

1. Call `/bot/auth` with API key or service JWT → get **bot access token** (`role='bot'`).
2. For user-owned actions (e.g., uploads): include `discord_user_id` in body; API maps to `user_id`.
3. Re-auth to refresh when token expiring.

#### 8) Middleware (API)

- **requireAuth**: parse `Authorization: Bearer`, verify JWT (HS256), check `aud`, `exp`; attach `req.auth = { userId: sub, role, sessionId: sid }`.
- **requireRole(...roles)**: 403 if caller role not allowed.
- Input validation (zod/joi) on every endpoint.

#### 8a) Environment flags & secrets

- `JWT_ACCESS_TTL_MINUTES=15` (configurable short-lived access tokens).
- `SESSION_TTL_DAYS=90` (sliding, refresh cookie lifetime).
- `JWT_SECRET` (existing) + `JWT_AUDIENCE=api`, `JWT_ISSUER=kevbot-api`.
- `AUTH_ALLOW_DEV_LOGIN=false` by default; enable locally only.
- `DEV_AUTH_SECRET=<random>` required when dev login enabled.
- `BOT_AUTH_API_KEY=<random>` (for `/bot/auth`).

#### 9) Security & platform settings

- **Cookies**: HttpOnly + Secure + SameSite=Lax; scope to `/auth`.
- **CORS**: Allow only your Next.js origin(s); block `*`.
- **CSRF**:

  - If browser calls API directly with cookies for state-changing routes: add CSRF protection (double-submit or custom header + SameSite=Strict).
  - If routing calls through Next.js server with Bearer tokens, CSRF exposure is minimal.

- **Rate limiting**: Per IP + per user/bot; stricter on `/auth/*`.
- **Key mgmt**:

  - HS256: one strong secret (`JWT_SECRET`) in the API.
  - Keep option to migrate to RS256 later (no flow changes—just signing/verify code).

- **Revocation**: Flip `sessions.is_revoked` → refresh fails; access tokens expire quickly by design.
- **GCS access**: Always via short-TTL signed URLs (no raw keys in clients).
- **Audit logs**: user_id/discord_user_id, action, object id, timestamp, IP/UA.

#### 10) Next.js wiring (practical)

- Use server route/handler to complete OAuth; do **not** expose Discord tokens to the browser.
- From that handler, call `/auth/exchange`; the refresh cookie is set by the API; store access token **server-side** and refresh when needed.
- For client components:

  - Prefer proxying via Next.js route handlers (keeps tokens server-side), or
  - If calling API directly, use the access token in `Authorization` and a small refresh helper that calls `/auth/refresh` when needed (cookie is auto-sent).

#### 11) Nice-to-haves (later)

- JWKS endpoint (if you move to RS256) for future microservices.
- Sliding session with hard cap (e.g., 90d max).
- `/id/resolve?discord_user_id=...` (bot/admin only) for one-time mapping.
- Structured logs and observability (request id, user id, role, route, latency, outcome).

That’s it—implement these endpoints/middleware, wire Next.js OAuth → `/auth/exchange`, and swap your bot’s DB calls for API calls using `role='bot'` + `discord_user_id`. You’ll have one consistent auth story and a single, enforceable authorization layer at the API.
