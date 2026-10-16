# Database Management Script

## Hosted migration workflow

Use **[Database] Migrate** with a protected GitHub environment. It builds the
standalone migration image and mounts the checked-out `db/migration` tree
read-only. Ordinary schema migration no longer downloads sensitive GCS fixtures.
Set environment secrets:

- `DB_CONNECTION_STRING`: `mysql://user:URL_ENCODED_PASSWORD@host:port/database`.
  URL-encode reserved characters in credentials. Schema names support letters,
  digits, underscores, dollar signs, and hyphens; DSN queries/fragments are
  rejected rather than silently ignoring TLS options.
- `MYSQL_SSL_CA_CERT`: the PEM CA certificate for the chosen server, required
  by the workflow's default verified-TLS mode. The workflow mounts it temporarily
  and sets the container's `MYSQL_SSL_CA` file path.

Select an explicit `major.minor.patch` target (recommended for an actual upgrade)
or `latest`. `dry_run` defaults to true and performs reads/planning only. Review
the plan and backup/recovery readiness before an authorized non-dry run.
`verify_tls` defaults to true; disabling it is an explicit exception for an
approved target, not a workaround for a broken managed-database certificate.
The bundled Debian MariaDB-compatible `mysql` client uses `--ssl-ca` and
`--ssl-verify-server-cert` for CA and hostname verification. These switches
differ from Oracle MySQL's `--ssl-mode`; use the bundled image for this contract.

Before running against DigitalOcean, confirm whether the target is Managed
MySQL or a self-managed Droplet, its hostname/port, trusted-source access,
certificate, and migration-user privileges. The repository's Droplet workflows
do not establish the live database topology. No hosted migration has been
performed or validated by these changes. See [DigitalOcean's connection guide](https://docs.digitalocean.com/products/databases/mysql/how-to/connect/)
and [the bundled client's TLS options](https://mariadb.com/docs/server/clients-and-utilities/mariadb-client/mariadb-command-line-client).

Failures return a nonzero CLI/container/workflow exit status. Passwords are
passed through a private temporary client option file, not process arguments.
Migrations remain forward-only; a failed DDL script can leave partial changes
and must not be assumed rolled back. Baseline inference, cross-runner locking,
checksums and recovery rehearsal remain separate cutover work. Workflow
concurrency serializes runs for one environment, not arbitrary external clients.

## Diagnostics and CLI output

Migration-manager uses Python's standard [`logging`](https://docs.python.org/3.12/library/logging.html)
library, configured once at the CLI boundary with named component loggers.
It needs no adapter, new dependency, log file, or external logging service.
The package handler does not propagate into the root logger or configure other
libraries. Each invocation creates a fresh run ID and one stderr handler.

`migrate --log-level LEVEL` accepts `DEBUG`, `INFO` (default), `WARNING`, `ERROR`,
or `CRITICAL`, case-insensitively; invalid levels fail argument validation.
`--log-format text|json` selects readable text (default) or one JSON object per
stderr line for Docker/CI collectors. These are CLI options, not environment
settings; the existing env-file/secret configuration is unchanged.

| Level | Events |
| --- | --- |
| DEBUG | Connection check and schema inspection |
| INFO | Run start, connection ready, plan, dry-run, each script start/completion or planned script, already-current state, completion |
| WARNING | Failed connection attempts that will be retried (four at most) |
| ERROR | One final failure, including exhausted connection retries |

Every diagnostic contains a UTC timestamp, severity, component, run ID, event,
target label, dry-run flag, phase, current/target versions, script, and elapsed
milliseconds. Fields not yet known are null. `current_version` is the version
observed at run start; `target_version` is the resolved plan target. Script events
also include script elapsed milliseconds; plan events include script count, and
retries include attempt/max-attempts. The target is `db-` plus the first 12 hex
digits of SHA-256 over `host:port/database`, allowing correlation without emitting
hostnames, schema names, users, or URLs. Script context is a sanitized basename,
never a full path.

Help, the script/status table, the already-current result, and the final
`Database migration complete! <current> --> <target>` result remain on stdout.
The latter preserves API Testcontainers' completion-text consumer; its one-shot
wait also continues to depend on a successful exit. Log-level/format changes do
not change those results. Dry-run rows say `PLANNED`, and failed scripts never
receive a `DONE` row or a successful completion result. Logging errors are
suppressed so a broken diagnostic stream/formatter cannot change migration
success/failure; failure remains exit 1 even if `CRITICAL` filters its diagnostic.
Argument errors remain exit 2, and help remains exit 0.

Failures expose allowlisted `reason`/`cause` categories and, when available, a
numeric MySQL error code parsed from the client error header. For example,
`authentication_failed` / 1045 means check migration-user credentials/privileges;
`connection_unavailable` / 2003 means check reachability;
`tls_error` / 2026 means check the CA/hostname configuration; and
`sql_syntax_error` / 1064 identifies a SQL failure with script context.
Unknown driver errors get `mysql_command_failed`. After five connection attempts,
the single terminal error retains the last safe cause without another sleep.

Neither format, including DEBUG, serializes raw MySQL stderr, SQL bodies, seed
rows, subprocess arguments, option-file contents, arbitrary exception messages,
tracebacks, stack information, or arbitrary log-record extras. Client stderr is
discarded at the error boundary after extracting the numeric code. Known
connection credentials (encoded and decoded) and environment values whose names
contain PASSWORD/SECRET/TOKEN/KEY/CONNECTION_STRING are redacted from script
metadata and table rows; control characters are replaced and names are bounded.
Keep secrets out of filenames: names are intentional operational metadata, and
an unrelated secret not supplied through configuration cannot be identified by
the tool. Driver error detail is deliberately unavailable even in DEBUG; inspect
the identified script locally using appropriately controlled data when needed.
New diagnostic call sites should use a static event from `diagnostics.EVENTS`
and numeric or allowlisted details; formatters omit unrecognized event messages.

Local examples (from this tool directory):

```bash
python -m migration_manager migrate -e ../../../dev.env ../../../db/migration --dry-run --log-level DEBUG
python -m migration_manager migrate -e ../../../dev.env ../../../db/migration --dry-run --log-format json
```

Container example (from the repository root, after building the image):

```bash
docker run --rm --env-file .env -v ./db/migration:/app/migration:ro migration-manager migrate migration --dry-run --log-format json
```

In GitHub Actions, append the same options to the existing container command;
normal runner stdout/stderr capture keeps diagnostics available without a file:

```yaml
- name: Preview migration with JSON diagnostics
  env:
    DB_CONNECTION_STRING: ${{ secrets.DB_CONNECTION_STRING }}
  run: >-
    docker run --rm -e DB_CONNECTION_STRING
    -v "$GITHUB_WORKSPACE/db/migration:/app/migration:ro"
    migration-manager migrate migration --dry-run --log-format json --log-level INFO
```

Retain the protected hosted workflow's existing verified-TLS certificate mount
and options for targets requiring TLS; the example only illustrates logging.

## Local Python environment

Use Python 3.12 and **uv 0.13.1**, the same uv version pinned in both Dockerfiles,
CI and `pyproject.toml`. Install uv with the [official installer](https://docs.astral.sh/uv/getting-started/installation/):

```bash
curl -LsSf https://astral.sh/uv/0.13.1/install.sh | sh
```

From the repository root:

```bash
cd tools/db/migration_manager
uv sync --locked
uv run --locked python -m migration_manager --help
uv run --locked python -m migration_manager migrate --help
```

`.python-version` selects Python 3.12; uv can install it locally if needed.
Images and CI use their existing Python 3.12 and disable Python downloads.
`tool.uv.package = false` preserves execution directly from the source tree,
without building/installing a distribution. To use the existing plain Python
commands, activate `.venv` with `source .venv/bin/activate` first (Windows:
`.venv\Scripts\activate`).

Actual migrations also require a MariaDB-compatible `mysql` executable on `PATH`
(Debian/Ubuntu: `default-mysql-client`). Python dependencies do not supply the
MySQL CLI. Both images already include this client, including the verified-TLS
flags described above. Use `DB_CONNECTION_STRING` or `--env-file` as before.

### Lockfile maintenance

`pyproject.toml` is the dependency source of truth and `uv.lock` is the only
migration-manager lock. The initial lock retains `packaging==24.1` and
`python-dotenv==1.0.1` from the former requirements file. All consumers now use
uv, so migration-manager's `requirements.txt` and pip-compile workflow are
removed. The separate `rename_to_id` tool retains its pip requirements workflow.

Normal setup/builds use `--locked` to fail on missing or stale locks without
rewriting them. To intentionally change dependencies:

```bash
# Edit dependencies in pyproject.toml, then regenerate the lock:
uv lock
# Or intentionally upgrade one dependency (or use uv lock --upgrade for all):
uv lock --upgrade-package packaging
uv sync --locked
uv lock --check
```

Review and commit `pyproject.toml` and `uv.lock` together. When updating uv,
update its exact pin in `pyproject.toml`, both Dockerfiles, CI and this guide
together. See [uv's lock and sync behavior](https://docs.astral.sh/uv/concepts/projects/sync/).

## Migration-manager checks

From `tools/db/migration_manager`, after the locked sync above:

```bash
uv lock --check
uv run --locked python -m unittest discover -s tests -p test_cli.py
uv run --locked python -m unittest discover -s tests -p test_uv.py
```

For the opt-in integration check, Docker and OpenSSL must be installed:

```bash
docker build -t migration-manager:check .
uv run --locked python -m unittest discover -s tests -p test_integration.py
```

The integration check generates an ephemeral TLS certificate and disposable
MySQL database. It verifies dry-run non-mutation, explicit/latest targets,
already-current behavior, invalid/downgrade targets, SQL-failure exit codes,
and CA/hostname-verified TLS. It never uses production credentials/data.
It also checks JSON context, stdout compatibility, real SQL-error redaction,
and authentication retry exhaustion with one terminal error. The unit suite
covers levels, both formats, configuration validation, exception/metadata
redaction, retry recovery, and broken logging streams/formatters. The uv checks
install into fresh temporary directories, check CLI help, and verify missing
or stale locks fail without being created or rewritten. CI also builds the
shared tools image and checks both Python tool invocations and the MySQL client.
The API CI job builds the same standalone Dockerfile for its Testcontainers
search suite; see [API test commands](../../../api/README.md#run-tests-locally).
Both test harnesses accept `MIGRATION_TEST_IMAGE` to select a locally built
image without replacing the default image tag (pass it into the API test
container).

## CLI Help

> [!TIP]
> Run help command yourself to ensure you have latest usage details

```txt
$ uv run --locked python migration_manager -h

usage: migration_manager [-h] {migrate} ...

Tool for managing KevBot MySQL database.

positional arguments:
  {migrate}
    migrate   Migrate the database

options:
  -h, --help  show this help message and exit
```

```txt
$ uv run --locked python migration_manager migrate -h

usage: migration_manager migrate [-h] [--env-file ENV_FILE]
                                 [--version VERSION] [--dry-run]
                                 [--log-level {DEBUG,INFO,WARNING,ERROR,CRITICAL}]
                                 [--log-format {text,json}]
                                 scripts_directory

Migrate the database to the specified version. This command will apply migration scripts located in the specified directory.
A new database will be created called schema_version that will be used to track the current version of the schema. The columns are (id, version, script_name, applied_at)

positional arguments:
  scripts_directory     Directory containing migration scripts. This will be searched recursively.

options:
  -h, --help            show this help message and exit
  --env-file ENV_FILE, -e ENV_FILE
                        Path to the .env file
  --version VERSION, -v VERSION
                        Target database version
  --dry-run             Set to true to not actually apply scripts
  --log-level {DEBUG,INFO,WARNING,ERROR,CRITICAL}
                        Diagnostic severity threshold on stderr (default: INFO)
  --log-format {text,json}
                        Diagnostic format on stderr (default: text)

Script Naming Conventions:
  - Scripts must be named in the format <version>__<name>.sql
  - Optionally, scripts can include a type: <version>__<type>__<name>.sql
    where <type> is 'baseline' or 'seed'.

Examples:
  0.0.0__baseline__pre_existing_schema.sql
  2.0.0__add_users_table.sql
  2.0.0__seed__populate_user_data.sql

Notes:
  - The <version> must follow the semantic versioning format 'major.minor.patch'.
  - The <name> must not contain double underscores '__'.
  - The <name> must be at least one character long.
  - Scripts are applied in version order.
  - Seed scripts are only applied if there is a corresponding migration or baseline script with the same version.

Required environment variables: DB_CONNECTION_STRING
```

## Build Docker Container

```bash
cd tools/db/migration_manager
docker build -t migration-manager .
```

## Example Calls

```bash
uv run --locked python -m migration_manager migrate -e ../../../.env ../../../db/migration/
```

## Running from Docker

```bash
docker run --rm --env-file .env -v ./db/migration:/app/migration migration-manager migrate migration
```

The standalone entrypoint remains `python /app/migration_manager`, now using
the uv environment on `PATH`. The shared tools image retains the explicit
interpreter path used by existing consumers:

```bash
# From the repository root:
docker build --target production -t kevbot_tools tools
docker run --rm --env-file .env \
  -v "$PWD/db/migration:/migration:ro" \
  -w /tools/db/migration_manager kevbot_tools \
  /opt/migration_manager/.venv/bin/python migration_manager migrate /migration
```

Both build contexts exclude host virtual environments, env files and key files.
Neither invocation runs uv or resolves dependencies at container startup; CLI
arguments and nonzero failure statuses pass through unchanged.
