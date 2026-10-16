# Repository command runner investigation

Recommendation, 2026-10-16: **defer adopting `just`**. Complete the setup-command
reconciliation in [#145](https://github.com/k1dkev/KevBot/issues/145) and rebase
the Python command map after [uv PR #170](https://github.com/k1dkev/KevBot/pull/170)
lands. Then consider the bounded, optional developer-only follow-up below.
This document completes the investigation requested by
[#168](https://github.com/k1dkev/KevBot/issues/168); it authorizes no adoption,
workflow migration, deployment, or production execution.

## Evidence and choice

Reviewed `origin/main` at `789bfc4`, the [roadmap](../ROADMAP.md), the historical
[planning audit](PLANNING_AUDIT.md), current scripts/Compose/CI, and #168 in full.
Audit findings are historical: production packaging, frontend checks, migration
failure exits, and formatting now have implementations on this main snapshot.
PR #170 is still open: main uses migration-manager `requirements.txt`, not uv.
The owner-accepted bot contract was merged by
[PR #169](https://github.com/k1dkev/KevBot/pull/169); there is still no `bot/`
service. A command runner does not alter that accepted scope.

| Repeated command surface | Current source and concrete friction |
| --- | --- |
| Setup and local stack | [README](../README.md), [contributing](../CONTRIBUTING.md), [AGENTS](../AGENTS.md), [root Compose](../docker-compose.dev.yml): repeated `cd`/env-file instructions; generic service filenames disagree. Root includes DB, fake GCS, API, tools only; no frontend/bot Compose file or automatic migration step. |
| Formatting and frontend | [root scripts](../package.json), [format guide](FORMATTING.md), [frontend scripts](../frontend/package.json), [frontend guide](../frontend/README.md): formatting already has one npm entrypoint; frontend lint/unit/build/browser checks remain separate. Old prose still calls frontend tests planned. |
| API tests and images | [API scripts](../api/package.json), [API guide](../api/README.md), [Dockerfile](../api/Dockerfile), [CI](../.github/workflows/continuos-integration.yml): duplicate migration/test/production-image builds and Docker-socket invocation. Jest uses Testcontainers; production smoke has its own npm script. |
| Python checks | [tool guide](../tools/db/migration_manager/README.md), [integration harness](../tools/db/migration_manager/tests/test_integration.py), [CI](../.github/workflows/continuos-integration.yml): tool-directory unittest commands, Python environment, Docker image and OpenSSL prerequisites. PR #170 changes installation and adds lock checks. |
| Operator actions | [migration workflow](../.github/workflows/database-migrate.yml), [service cleanup](../.github/workflows/service-stop-and-clean-up.yml), [Droplet reset](../.github/workflows/droplet-reset-docker-services.yml), [dump utilities](../tools/db/dump/README.md): protected targets, volume deletion, remote credentials, or sensitive exports; unsuitable setup dependencies. |

`just` would provide a discoverable recipe list and run commands relative to its
root file even when invoked below it. These directly address working-directory
mistakes across languages. Its [working-directory](https://just.systems/man/en/working-directory.html)
and [listing](https://just.systems/man/en/command-line-options.html) rules support
that use. They do not resolve missing configuration or incompatible runtimes.

Improving the command table in existing runbooks is cheaper now. For example,
`npm --prefix frontend run test:unit` already removes a `cd`, while
`npm run format:check` already delegates both formatters. Additional root npm
aliases could cover the small Node-focused subset without another installation.
However, Python/Compose orchestration would still be shell wrappers, and npm
would become an unnecessary prerequisite for container-only users. An optional
`just` layer becomes worthwhile if a reconciled command table still leaves
frequent cross-service invocation mistakes. Maintaining recipes, pins, quoting
tests, and duplicate command documentation before that adds avoidable drift.

## Proposed thin command map

These are proposed names, **not available commands**. All direct commands below
are relative to repository root unless stated otherwise; scripts remain the
source of truth. `check` means no real service/data changes, not zero filesystem
writes: caches/reports may be generated. Installs, builds, servers and disposable
container tests are separate explicit actions, never hidden check dependencies.

| Proposed recipe | Existing delegation / proposed behavior | Effect |
| --- | --- | --- |
| default / `help` | `just --list`, with comments pointing to component runbooks | Read-only; requires no env files or daemon |
| `setup` | Print per-component install/prerequisite instructions; do not install tools or generate/overwrite env files | Read-only |
| `doctor` | Check executable versions and required file existence; print names/status only | Read-only; no environment dump or Compose expansion |
| `dev-up env-file` | `docker compose --env-file FILE -f docker-compose.dev.yml up --build` | Explicit local containers/builds; data persists |
| `dev-down env-file` | Same env file/Compose selection, then `down` without volume flags | Explicit local stop; retains named volumes |
| `service-up service env-file` | Fixed mapping: `api` → `api/docker-compose.dev.yml`, `db` → `db/docker-compose.yml`, `gcloud` → `gcloud/docker-compose.yml`, `tools` → `tools/docker-compose.dev.yml`; run `docker compose --env-file FILE -f SELECTED_FILE up` | Explicit focused local service; reject other names |
| `dev service` | `npm --prefix api run dev` or `npm --prefix frontend run dev` | Explicit foreground server; reject other names |
| `format` | `npm run format` | Explicit source rewrite |
| `check` | `npm run format:check`, then `npm --prefix frontend run lint` and `npm --prefix frontend run test:unit` | Checks; no install/build/DB/hosted credentials |
| `build service` | `npm --prefix api run build` or `npm --prefix frontend run build` | Explicit local build; correct runtime/config required |
| `api-test *args` | `npm --prefix api test -- ARGS` | Disposable Testcontainers; prebuilt `migration-manager:latest` |
| `api-smoke` | `npm --prefix api run test:production` | Disposable actual production-image test; see image prerequisites below |
| `frontend-test kind` | `unit` → `npm --prefix frontend run test:unit`; `browser` → `npm --prefix frontend run test:e2e` | Browser mode explicitly requires synthetic production build/browser install |
| `migration-check kind` | In `tools/db/migration_manager`: after #170 merges, use `uv run --locked python -m unittest discover -s tests -p test_cli.py` or `test_integration.py` | Unit check or explicitly selected disposable integration; #170 is currently open |

Keep image preparation explicit. API tests need
`docker build -t migration-manager tools/db/migration_manager`; API smoke also
needs `docker build --target production -t kevbot_api_production:smoke api`.
Containerized execution additionally needs the API test image; use the existing
[API runbook](../api/README.md#production-image-smoke-test) rather than copying
socket/host-network orchestration into recipes. Migration integration requires
`docker build -t migration-manager:check tools/db/migration_manager`, or its
existing `MIGRATION_TEST_IMAGE` override. Builds may pull images/dependencies.
Do not overwrite shared image tags silently as a prerequisite of `check`.

## Runtime, installation and environment policy

- Support macOS and Linux with POSIX `sh` recipes; WSL2 is the proposed Windows
  path, with tools and Docker integration inside WSL. Native PowerShell/CMD is
  outside the first follow-up. `just` defaults to `sh -cu`, including on Windows;
  its [shell rules](https://just.systems/man/en/shell.html) do not make Unix
  command bodies portable automatically. Existing Bash dump scripts stay outside.
- If approved later, pin/test **just 1.59.0**, the
  [official stable release checked on this date](https://github.com/casey/just/releases/tag/1.59.0).
  Record an exact tested version and checksum-verified upstream binary install
  instructions for macOS/Linux architectures. Package managers such as
  `brew install just` or distro packages are optional alternatives only after
  checking `just --version`; they do not guarantee that pin. See upstream
  [installation](https://just.systems/man/en/installation.html) and
  [packages](https://just.systems/man/en/packages.html). Never install globally or
  pipe an installer into a shell from setup/check. Update the pin and verification
  together; use stable features only, with a clear unsupported-version error.
- Existing prerequisites remain: Docker Engine/Desktop and Compose v2 with
  `include` support; API local Node **>=20.17.0 <21** per its engines range
  and image; Node **22** for frontend/formatting as in CI;
  Python **3.12** in an explicit isolated environment for migration checks and
  Ruff **0.17.0**, plus root Prettier **3.9.10**. One host Node version is not a
  validated universal setup. Prefer the existing API containers or separate
  per-service Node environments. Do not change runtime versions in this ticket.
- Install npm dependencies separately at root/API/frontend. On this main snapshot,
  install migration `requirements.txt` into a Python 3.12 venv; bare host
  `python3` may select another version without dotenv. After #170 merges, the
  adapter should use its documented `uv sync --locked` setup and
  `uv run --locked python ...`, including its new lock checks, without preserving
  a second pip workflow. Actual migrations additionally need the compatible
  MySQL client; integration checks need OpenSSL and Docker. Local API runtime
  needs FFmpeg, already provided by its images.
- Browser tests need Playwright Chromium, available ports **4300/4301**, and a
  prior frontend build with the synthetic `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_FRONTEND_URL` and client ID from the [frontend guide](../frontend/README.md#checks-and-browser-smoke-tests).
  Build/check must not load hosted credentials. Live frontend dev needs its
  `.env.local`; API dev needs the environment described by
  [its config validator](../api/src/config/config.ts), including local DB/GCS
  and synthetic auth settings. API dev does not load an env file itself on this
  snapshot: Compose injects it, or the caller must export the required values.
- Leave `just` dotenv loading disabled. Pass an explicit env-file **path** only
  to the selected Compose/tool entrypoint; do not source arbitrary env files as
  shell code. Resolve relative paths against repository root, including from
  subdirectories. Preserve the entrypoint's environment precedence; don't merge
  `.env`, `dev.env`, and `local_dev.env`. Upstream [dotenv settings](https://just.systems/man/en/dotenv-settings.html)
  can search ancestors and override existing values when enabled: avoid that
  extra source of target/credential ambiguity. Test harnesses retain their
  existing synthetic configuration; forwarded test arguments must not override
  target/environment configuration or turn a check into an operator action.
- Use allowlisted service/mode parameters and
  [positional argument forwarding](https://just.systems/man/en/positional-arguments.html)
  with quoted `"$@"` for test filters, rather than interpolating `{{args}}` into
  shell code. Forward npm arguments after `--`. Verify spaces, quotes and shell
  metacharacters as literal arguments. No DSNs/passwords as recipe arguments or
  printed values; no `set -x`, `env`, or expanded `docker compose config` output.
  [Quiet recipes](https://just.systems/man/en/quiet-recipes.html) can suppress
  command echo, but cannot redact output emitted by underlying tools.

## Destructive actions and CI

Default/setup/check must never depend on installs, `up`, migrations, resets,
exports or deploys, or run shell commands during recipe-file evaluation.
Local lifecycle commands must check the Docker context/project and reject remote
daemon targets. Initial follow-up excludes operator recipes. If separately
authorized later, reserve explicit names such as `dev-reset-volumes`,
`hosted-migrate`, and `deploy`; require a named local Compose project or protected
hosted environment, an explicit confirmation flag, and a displayed nonsecret
target. A local volume reset must require an isolated project and remove only
its named volumes; no daemon-wide prune or GCS deletion. Hosted dry-run still
contacts a real target and is an operator action, not a safe local check.
The current Compose files use fixed `container_name` values: project naming
alone does not isolate concurrent stacks; reject collisions rather than deleting
containers. Existing protected workflows remain the operator entrypoints.

Keep [CI](../.github/workflows/continuos-integration.yml) and
[formatting CI](../.github/workflows/formatting.yml) on their direct npm/Python/
Docker commands. A local convenience runner should not add another CI runtime
or replace protected workflow controls. Prevent drift by keeping recipe bodies
to delegation/argument validation, linking the underlying scripts, and reviewing
the map/recipe checks whenever an underlying entrypoint changes. If orchestration
outgrows a short delegation, move it into a maintained component script shared
by direct callers; don't copy the migration engine or smoke harness into recipes.

## Bounded follow-up specification (not created or approved)

After #145's setup reconciliation and #170's merged Python commands, reconsider
one optional developer-only PR: at most the **14 named recipes** above (default
aliases help), a short runbook/install section, and focused contract checks.
No runtime/dependency upgrades, bot stubs, operator actions, env-file generation,
root product/architecture rewrites, or CI conversion. Keep direct commands usable.

Acceptance: default/list/setup work without secrets or Docker; missing prerequisites
identify the tool and relevant runbook; invalid services fail before subprocesses;
root/subdirectory invocations select the same paths; argument boundaries and
nonzero exits survive; synthetic secret sentinels never appear in runner output.
Use stub commands to verify delegation and prove setup/check cannot reach
destructive actions. Then verify representative direct-versus-recipe checks on
macOS, Linux and WSL2; run explicit integration/smoke recipes only with disposable
resources. Require evidence before claiming those platforms supported. Retain
the docs/npm approach if the pilot shows no useful reduction in invocation errors.

Investigation validation: source/command inventory, local-link checks, official
documentation/release checks and repository formatting checks only. No `just`
installation/recipe execution, stack startup, test containers, migrations,
workflow dispatch, repository settings change or production access was needed.
