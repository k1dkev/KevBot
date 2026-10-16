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
The uv checks install into fresh temporary directories, check CLI help, and
verify missing/stale locks fail without being created or rewritten. CI also
builds the shared tools image and checks both Python tool invocations and the
MySQL client. The API CI job builds the same standalone Dockerfile for its
Testcontainers search suite; see [API test commands](../../../api/README.md#run-tests-locally).
Both test harnesses accept `MIGRATION_TEST_IMAGE` to select a locally built image
without replacing the default image tag (pass it into the API test container).

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
