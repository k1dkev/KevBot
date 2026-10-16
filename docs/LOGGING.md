# Application logging

Active API and frontend application diagnostics use **Pino 10** (currently locked
to 10.4.0), a maintained logger with TypeScript types, level filtering, child
bindings and JSON output. It supports the API's Node 20 runtime. The browser
adapter explicitly imports `pino/browser`, not the Node entry point. There is no
provider, remote transport, browser telemetry, log storage or new infrastructure.

Official references reviewed for this implementation:

- [Pino releases and runtime support](https://github.com/pinojs/pino/releases)
- [Pino API, levels, children and destinations](https://github.com/pinojs/pino/blob/main/docs/api.md)
- [Browser entry and console behavior](https://github.com/pinojs/pino/blob/main/docs/browser.md)
- [Redaction and its case-sensitive path limitations](https://github.com/pinojs/pino/blob/main/docs/redaction.md)
- [pino-pretty development usage](https://github.com/pinojs/pino-pretty#usage)
- [Node async context](https://nodejs.org/api/async_context.html#class-asynclocalstorage)
- [Next instrumentation and request errors](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)

## Configuration and output

`LOG_LEVEL` is optional on the API and Next Node server. Accepted values are
`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` (case-sensitive).
The default is `info`, or `silent` in tests. API configuration validates the
optional field without requiring existing typed Config fixtures to supply it.
An invalid level fails startup without echoing its value. No environment files
are tracked except `api/.env.example`; add the optional variable to local/runtime
environment files only when overriding the default.

Production/container logs are newline-delimited JSON on stdout, with ISO `time`,
numeric Pino `level` (10/20/30/40/50/60), `service`, `component` and `msg` (a stable
event name). The startup listening message retains its existing human-readable
text. Standard stdout/stderr collection is sufficient; nothing requires a
sidecar or credential. API development terminals use `pino-pretty`; redirected
output and containers remain JSON. For readable Next development output, pipe
its stdout through the installed development-only `pino-pretty` CLI. Do not pipe
production logs through a development formatter.

Browser logs stay in the local console as Pino objects with timestamp, level,
service/component and event. Production defaults to `warn`; development to
`debug`. There is deliberately no `NEXT_PUBLIC_LOG_LEVEL` or other public logging
configuration. `createBrowserLogger(level)` allows explicit local diagnostics.
`server.ts` is guarded by `server-only` and loaded only for the Next Node runtime.
Next instrumentation records startup and sanitized request errors; Next's own
framework diagnostics remain framework-owned.

## Call sites and correlation

Use a stable event name and a small object of explicitly chosen diagnostic fields:

```ts
getLogger().child({ component: "uploads" }).warn({ err }, "upload.cleanup.failed");
```

The API request middleware generates a local UUID, returns `X-Request-ID`, and
keeps its child logger in `AsyncLocalStorage` across awaited calls. Incoming IDs
are not trusted or logged. Each request emits one completion event with method,
static API prefix + registered route template, status and duration. Unknown
routes use `unmatched`; raw paths, parameters and query values are omitted.
Successful responses use info, 4xx/aborted requests warn, 5xx error. CORS and
response/auth behavior are unchanged apart from the diagnostic response header.

Error middleware attaches only unexpected exceptions to that completion event;
expected validation/auth failures log no exception input. Callers that rethrow
must not also log the same failure. Upload cleanup is independently warn-worthy.
The hourly aggregation has a unique `jobId` and job child context per invocation,
one info summary after commit, debug per-item updates and one error on failure.
Its existing failure-swallowing behavior and schedule remain unchanged. Startup
database version failures propagate to the one startup fatal log. Diagnostic
logging never replaces database-backed play/activity records.

Future `bot/` code should follow the same Pino adapter, stable event, service +
component + generated job/request ID convention. This change does not scaffold it.

## Safety boundary

Adapters sanitize before Pino receives fields, events or child bindings. They
recursively redact case/punctuation variants of authorization, cookies, bot/API
keys, tokens, passwords, OAuth code/state, connection strings, environment/config
dumps, bodies, headers, queries and file/audio buffers. Opaque objects (including
DOM events, streams and Headers) are omitted. Request/response bodies and upload
contents must never be passed to logging.

Ordinary errors retain sanitized type, message, stack, error code and bounded,
cycle-safe causes (including Boom's `data.cause`). Recognized SQL-bearing driver
errors replace message and stack with generic text, since either may quote SQL
values. Recognition covers `sql`/`sqlMessage`/`sqlState`, MySQL `ER_` codes, SQLite
codes and PostgreSQL SQLSTATE codes, including nested ORM properties/driver errors,
causes and aggregates. Wrappers containing those errors also suppress their own
prose. Type/code and sanitized causes remain useful; arbitrary driver properties
such as SQL, parameters, response bodies and headers are not copied. Serialized
SQL error objects with message/stack receive the same treatment. Text sanitization strips
URL query/fragment values (also relative/encoded URLs), credential URLs, Bearer/
Basic credentials, JWTs and credential assignment lines. Server adapters also
replace known secret environment values in otherwise unlabelled prose. Config
validation logs only field paths and issue types, never Zod issue values/messages
or raw config. OAuth provider error query text is omitted at the browser call site.

This is defense in depth, not permission to log arbitrary user text: an unknown,
unlabelled secret cannot be recognized reliably. Use static events and explicit
non-sensitive fields. Logger/sanitizer exceptions are swallowed; stdout stream
errors are handled so a failed diagnostic does not change application behavior.
Structured Node output uses synchronous writes to preserve fatal logs before
existing `process.exit(1)` calls.

The portable typed safety module is mirrored in the two service roots because
the API Docker build and Next packaging are independent. A frontend unit test
enforces byte-for-byte parity; keep both copies aligned. Pino still owns levels,
children and destinations; this is a safety adapter, not a new logging framework.

## Migration and verification

Migrated operational console calls cover API startup/config, middleware, upload
cleanup, scheduling/aggregation/database checks, frontend config/auth/OAuth,
search, playlist/profile/sidebar loading and playback. Archived `v1/` is untouched.
Reviewed helper JavaScript exceptions are intentional CLI/test output:
`tools/check-formatting.mjs` prints the formatter contract result;
`api/scripts/production-smoke.cjs` and `production-probe.cjs` print synthetic test
results/failures. Frontend fixture server output is test-owned. No blanket console
lint ban is introduced. Python migration logging belongs to #166; collection,
retention and alerts to #140; legacy #32 is not closed by this migration.

Run `cd api && npm run test:logging` for focused tests without Docker (it builds
the compiled startup fixture first). `npm test` retains the existing disposable
database suite. `cd frontend && npm run test:unit` checks browser defaults,
redaction and module boundaries; after `npm run build`, run
`CHECK_LOGGING_BUNDLE=1 npm run test:unit` to inspect actual browser chunks for
Node logger modules. CI runs both checks plus existing builds and regressions.
The existing production-image smoke waits on HTTP `/v1/docs/`, not log text;
its readiness contract is retained. These tests use only synthetic credentials.
