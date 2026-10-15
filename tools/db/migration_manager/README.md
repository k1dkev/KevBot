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

## Migration-manager checks

From `tools/db/migration_manager`, install `requirements.txt` into Python 3.12+
and run unit tests with:

```bash
python -m unittest discover -s tests -p test_cli.py
```

For the opt-in integration check, Docker and OpenSSL must be installed:

```bash
docker build -t migration-manager:check .
python -m unittest discover -s tests -p test_integration.py
```

The integration check generates an ephemeral TLS certificate and disposable
MySQL database. It verifies dry-run non-mutation, explicit/latest targets,
already-current behavior, invalid/downgrade targets, SQL-failure exit codes,
and CA/hostname-verified TLS. It never uses production credentials/data.

## CLI Help

> [!TIP]
> Run help command yourself to ensure you have latest usage details

```txt
$ python migration_manager -h

usage: migration_manager [-h] {migrate} ...

Tool for managing KevBot MySQL database.

positional arguments:
  {migrate}
    migrate   Migrate the database

options:
  -h, --help  show this help message and exit
```

```txt
$ python migration_manager migrate -h

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
python -m migration_manager migrate -e ../../../.env ../../../db/migration/
```

## Running from Docker

```bash
docker run --rm --env-file .env -v ./db/migration:/app/migration migration-manager migrate migration
```
