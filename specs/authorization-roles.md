# API authorization roles and abilities

Status: v2 implementation in #181; fixed role-to-ability mapping.

## Identity and policy boundary

The API JWT `role` describes the authentication path (`user` or `bot`); it is
not an application privilege. A delegated bot actor resolves to the same
`users` row as a browser account and receives the same authorization checks.
There is no persistent actors table. Store the application's role on `users`,
never trust a client-supplied role, and read the current role from MySQL when
checking privileged operations so demotion takes effect immediately.

## V2 roles

| Role | Abilities beyond existing ownership rules |
| --- | --- |
| `user` | Existing behavior: manage one's own tracks, playlists, and preferences; use shared-library operations already available to authenticated users. |
| `moderator` | `tracks.rename.any`, `tracks.delete.any`, `playlists.remove_tracks.any`, `playlists.delete_empty.any`. |
| `admin` | All Moderator abilities, plus `users.list` and `users.assign_role`. |

The role-to-ability map is explicit and centralized in API code. Ownership
checks stay in force unless a named ability allows a cross-owner operation; an
Admin does not receive a blanket bypass.

Playlist membership removal and deletion follow the current resource rules:
only empty playlists can be soft-deleted, and playlist rename/restore stays
creator-only. There are no reserved playlist or track names, virtual
name-based pools, or alternate collection resources. Special library sources use the typed
pool API and do not reserve words such as `allcats`.

Cross-owner track deletion remains soft-delete only. Cross-owner restore,
ownership transfer, playlist rename/restore, account deletion, Discord identity
changes, impersonation, and arbitrary content editing are outside v2.

## Admin endpoints

- `GET /v1/admin/users` lists users and their current application roles; requires
  `users.list`.
- `PATCH /v1/admin/users/{id}/role` accepts `{ "role": "user" | "moderator" | "admin" }`;
  requires `users.assign_role`.

An Admin cannot change their own role. The API serializes role changes and
prevents demotion of the final Admin. Role changes are logged with actor,
target, and old/new roles; tokens and secrets are never logged. No admin UI is
included.

## Initial Admin and recovery

Existing users migrate to `user`. An operator with database access runs
`npm run build` and then, from `api/`,
`DB_CONNECTION_STRING=... npm run bootstrap:admin -- <discord-user-id>` after
the intended account has been provisioned. Run it from a trusted operations
environment and avoid putting the connection string in shell history. The
command locks a singleton bootstrap row, promotes exactly the matching account,
and marks bootstrap complete in one transaction. Re-running it after success
does not change any role, so a demoted account is never silently re-promoted.

For recovery after an operator has intentionally removed every Admin, first
verify the target account out of band, take a database backup, then use a
reviewed operator SQL transaction to restore an Admin role. Do not reset the
bootstrap marker or expose a public bootstrap endpoint. The `MASTER_DISCORD_ID`
runtime override is removed; role bootstrap is not a permanent exception.

## Post-v2 extension

Keep ability names stable where practical. Only after concrete use cases,
consider database-backed role definitions, multiple roles/grants, explicit
deny precedence, scoped grants, durable audit history, expiry/delegation,
account suspension, and an admin UI. These are not part of v2.

## Verification contract

Test migration defaults, browser and delegated-bot parity, normal-user denies,
Moderator cross-owner track and playlist operations, Admin listing/assignment,
self-role protection, final-Admin safety, bootstrap idempotency, and live role
demotion. Forged body fields and stale JWT application-role claims must not
grant authority.
