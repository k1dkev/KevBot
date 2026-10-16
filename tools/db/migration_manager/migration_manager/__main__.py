import argparse
import logging
import os
import re
import subprocess
import tempfile
import time
from dotenv import load_dotenv
from packaging.version import parse as parse_version, Version
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
from enum import Enum
from collections import defaultdict
from urllib.parse import urlparse, unquote

# Support both `python -m migration_manager` and the existing directory entrypoint.
if __package__:
    from .diagnostics import (
        configure_logging,
        register_environment_secrets,
        register_secrets,
        safe_script_name,
        target_label,
        update_context,
    )
    from .errors import MigrationManagerError, MySQLCommandError, failure_context
else:
    from diagnostics import (
        configure_logging,
        register_environment_secrets,
        register_secrets,
        safe_script_name,
        target_label,
        update_context,
    )
    from errors import MigrationManagerError, MySQLCommandError, failure_context

logger = logging.getLogger("migration_manager" if __name__ == "__main__" else __name__)
VERSION_TABLE_NAME = "schema_version"


@dataclass
class EnvVars:
    env_file: str = field(default=".env")
    db_connection_string: str = field(default="", init=False)
    # mysql_host: str = field(default=None, init=False)
    # mysql_database: str = field(default=None, init=False)
    # mysql_root_user: str = field(default=None, init=False)
    # mysql_root_password: str = field(default=None, init=False)
    # mysql_tcp_port: str = field(default=None, init=False)

    @staticmethod
    def get_required_env_vars():
        required_env_vars = ["DB_CONNECTION_STRING"]
        return required_env_vars

    def __post_init__(self):
        load_dotenv(self.env_file)
        register_environment_secrets()
        for env_var in self.get_required_env_vars():
            value = os.getenv(env_var)
            attr = env_var.lower()
            if value is None:
                raise MigrationManagerError("environment")
            if hasattr(self, attr):
                setattr(self, attr, value)
            else:
                raise MigrationManagerError("environment")


class SchemaState(Enum):
    EMPTY = "Empty Schema (no baseline applied)"
    NOT_EMPTY = "Not Empty Schema (baseline assumed applied)"
    VERSIONED = "Has version (database has version table and version)"


@dataclass
class SchemaStatus:
    state: SchemaState
    version: Optional[Version] = field(default=None)

    def describe(self) -> str:
        if self.state == SchemaState.VERSIONED and self.version:
            return f"Schema is versioned with version: {self.version}"
        return f"Schema state is: {self.state.value}"


def log_level(value):
    level = value.upper()
    if level not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
        raise argparse.ArgumentTypeError(
            "log level must be DEBUG, INFO, WARNING, ERROR or CRITICAL"
        )
    return level


def log_format(value):
    if value not in ("text", "json"):
        raise argparse.ArgumentTypeError("log format must be text or json")
    return value


def parse_args():
    parser = argparse.ArgumentParser(
        description="Tool for managing KevBot MySQL database."
    )
    subparsers = parser.add_subparsers(dest="action", required=True)
    subparser = subparsers.add_parser(
        "migrate",
        help="Migrate the database",
        formatter_class=argparse.RawTextHelpFormatter,
        description=(
            "Migrate the database to the specified version. This command will apply"
            " migration scripts located in the specified directory.\nA new database"
            f" will be created called {VERSION_TABLE_NAME} that will be used to track"
            " the current version of the schema. The columns are (id, version,"
            " script_name, applied_at)"
        ),
        epilog=(
            "Script Naming Conventions:\n  - Scripts must be named in the format"
            " <version>__<name>.sql\n  - Optionally, scripts can include a type:"
            " <version>__<type>__<name>.sql\n    where <type> is 'baseline' or"
            " 'seed'.\n\nExamples:\n  0.0.0__baseline__pre_existing_schema.sql\n "
            " 2.0.0__add_users_table.sql\n "
            " 2.0.0__seed__populate_user_data.sql\n\nNotes:\n  - The <version>"
            " must follow the semantic versioning format 'major.minor.patch'.\n  - The"
            " <name> must not contain double underscores '__'.\n  - The <name> must be"
            " at least one character long.\n  - Scripts are applied in version order.\n"
            "  - Seed scripts are only applied if there is a corresponding migration or"
            " baseline script with the same version.\n\n"
            "Required environment variables:"
            f" {', '.join(EnvVars.get_required_env_vars())}"
        ),
    )
    subparser.add_argument(
        "--env-file",
        "-e",
        type=lambda s: Path(s).resolve(),
        default=".env",
        help="Path to the .env file",
    )
    subparser.add_argument(
        "scripts_directory",
        type=lambda s: Path(s).resolve(),
        help=(
            "Directory containing migration scripts. This will be searched recursively."
        ),
    )
    subparser.add_argument(
        "--version",
        "-v",
        type=str,
        required=False,
        help="Target database version",
        default="latest",
    )
    subparser.add_argument(
        "--dry-run",
        action="store_true",
        help="Set to true to not actually apply scripts",
    )
    subparser.add_argument(
        "--log-level",
        type=log_level,
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        default="INFO",
        help="Diagnostic severity threshold on stderr (default: INFO)",
    )
    subparser.add_argument(
        "--log-format",
        type=log_format,
        choices=["text", "json"],
        default="text",
        help="Diagnostic format on stderr (default: text)",
    )
    return parser.parse_args()


class MySQLClient:
    def __init__(self, connection_string: str):
        try:
            parsed = urlparse(connection_string)
            self.host = parsed.hostname
            self.user = unquote(parsed.username or "")
            self.password = unquote(parsed.password or "")
            self.port = parsed.port or 3306
            self.database = unquote(parsed.path.lstrip("/"))
            if parsed.scheme != "mysql" or not all(
                [self.host, self.user, self.database]
            ):
                raise ValueError()
            if (
                parsed.query
                or parsed.fragment
                or not re.fullmatch(r"[A-Za-z0-9_$-]+", self.database)
            ):
                raise ValueError()
        except ValueError:
            raise MigrationManagerError("connection_config") from None
        register_secrets(
            connection_string,
            parsed.username,
            parsed.password,
            self.user,
            self.password,
        )
        self.ssl_ca = os.getenv("MYSQL_SSL_CA")
        if self.ssl_ca and not Path(self.ssl_ca).is_file():
            raise MigrationManagerError("tls_config")

    def run_sql_command(self, sql_cmd):
        # Keep passwords out of process arguments and preserve spaces/URL-encoded characters.
        password = (
            self.password.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
        )
        with tempfile.NamedTemporaryFile(mode="w", suffix=".cnf") as options:
            options.write(f'[client]\npassword="{password}"\n')
            options.flush()
            cmd = [
                "mysql",
                f"--defaults-extra-file={options.name}",
                "--protocol=TCP",
                "--host",
                self.host,
                "--user",
                self.user,
                "--database",
                self.database,
                "--port",
                str(self.port),
            ]
            if self.ssl_ca:
                cmd.extend(
                    [
                        f"--ssl-ca={Path(self.ssl_ca).resolve()}",
                        "--ssl-verify-server-cert",
                    ]
                )
            result = subprocess.run(cmd, capture_output=True, text=True, input=sql_cmd)
        if result.returncode != 0:
            raise MySQLCommandError(result.stderr)
        return result


class ScriptType(Enum):
    BASELINE = "BASELINE"
    MIGRATION = "MIGRATION"
    SEED = "SEED"


@dataclass(order=True)
class Script:
    version: Version = field(compare=True)
    type: ScriptType = field(compare=False)
    name: str = field(compare=False)
    path: Path = field(compare=False)


def parse_script_file(f: Path):
    if not f.is_file() or f.suffix != ".sql":
        return None

    pattern = (
        r"^(?P<version_str>\d+\.\d+\.\d+)__"
        r"(?:(?P<type_name>seed|baseline)__)?"
        r"(?P<name>(?:(?!__).)+)\.sql$"
    )
    match = re.match(pattern, f.name)
    if not match:
        update_context(script=f.name)
        raise MigrationManagerError("invalid_script")
    name = match.group("name")
    if name in ["baseline", "seed"]:
        update_context(script=f.name)
        raise MigrationManagerError("invalid_script")
    version = parse_version(match.group("version_str"))

    match match.group("type_name"):
        case "baseline":
            script_type = ScriptType.BASELINE
        case "seed":
            script_type = ScriptType.SEED
        case _:
            script_type = ScriptType.MIGRATION

    return Script(version=version, type=script_type, name=name, path=f)


def passes_schema_state_and_version_filter(
    script: Script, target_version: Version, schema_status: SchemaStatus
):
    filter_conditions = {
        SchemaState.EMPTY: lambda s: s.version <= target_version,
        SchemaState.NOT_EMPTY: (
            lambda s: s.version <= target_version and s.type != ScriptType.BASELINE
        ),
        SchemaState.VERSIONED: (
            lambda s: (
                s.version <= target_version
                and s.type != ScriptType.BASELINE
                and schema_status.version < s.version
            )
        ),
    }
    return filter_conditions[schema_status.state](script)


def is_not_seed_or_has_matching_script(
    script: Script, scripts_by_version: defaultdict[Version, List[Script]]
):
    if script.type != ScriptType.SEED:
        return True
    scripts_in_version = scripts_by_version[script.version]
    has_migration_or_baseline = any(
        s.type in {ScriptType.MIGRATION, ScriptType.BASELINE}
        for s in scripts_in_version
    )
    return has_migration_or_baseline


def script_sort_key(script: Script):
    type_order = {
        ScriptType.BASELINE: 0,
        ScriptType.MIGRATION: 1,
        ScriptType.SEED: 2,
    }
    return (script.version, type_order[script.type])


def get_scripts_to_apply(
    all_scripts: List[Script], schema_status: SchemaStatus, target_version: Version
):
    baseline_scripts = [s for s in all_scripts if s.type == ScriptType.BASELINE]
    migration_scripts = [s for s in all_scripts if s.type == ScriptType.MIGRATION]

    if len(baseline_scripts) > 1:
        raise MigrationManagerError("multiple_baselines")
    elif baseline_scripts:
        baseline_script = baseline_scripts[0]
        lowest_version = min(s.version for s in all_scripts)
        if baseline_script.version != lowest_version:
            raise MigrationManagerError("baseline_order")

    migration_versions = [s.version for s in migration_scripts]
    if len(migration_versions) != len(set(migration_versions)):
        raise MigrationManagerError("duplicate_migration")

    scripts_to_apply = [
        s
        for s in all_scripts
        if passes_schema_state_and_version_filter(s, target_version, schema_status)
    ]
    scripts_by_version = defaultdict(list)
    for script in scripts_to_apply:
        scripts_by_version[script.version].append(script)
    scripts_to_apply = [
        s
        for s in scripts_to_apply
        if is_not_seed_or_has_matching_script(s, scripts_by_version)
    ]

    scripts_to_apply.sort(key=script_sort_key)
    return scripts_to_apply


def perform_action(env_vars: EnvVars, args):
    if args.action == "migrate":
        client = MySQLClient(env_vars.db_connection_string)
        update_context(
            target=target_label(client.host, client.port, client.database),
            phase="connection",
        )
        check_mysql_connection(client)
        update_context(phase="schema")
        schema_status = get_schema_status(client)
        update_context(
            current_version=str(schema_status.version)
            if schema_status.version
            else None,
            schema_state=schema_status.state.name,
            phase="planning",
        )
        logger.debug("schema_status")
        if not Path(args.scripts_directory).is_dir():
            raise MigrationManagerError("scripts_directory")
        all_scripts = [
            script
            for f in Path(args.scripts_directory).rglob("*")
            if (script := parse_script_file(f))
        ]
        if not all_scripts:
            raise MigrationManagerError("no_scripts")
        if args.version == "latest":
            target_version = max(s.version for s in all_scripts)
        else:
            if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
                raise MigrationManagerError("target_version")
            target_version = parse_version(args.version)
        update_context(target_version=str(target_version))
        if schema_status.version:
            if target_version < schema_status.version:
                raise MigrationManagerError("downgrade")
        if target_version not in [
            s.version
            for s in all_scripts
            if s.type in {ScriptType.MIGRATION, ScriptType.BASELINE}
        ]:
            raise MigrationManagerError("missing_target")
        scripts = get_scripts_to_apply(all_scripts, schema_status, target_version)
        logger.info("plan_ready", extra={"script_count": len(scripts)})
        apply_scripts(client, scripts, args.dry_run, schema_status)
        update_context(phase="completion", script=None)
        logger.info("run_completed")
        print(
            f"Database migration complete! {schema_status.version} --> {target_version}"
        )


def check_mysql_connection(client: MySQLClient):
    logger.debug("connection_check")
    for attempt in range(1, 6):
        try:
            client.run_sql_command("SELECT 1")
            logger.info("connection_ready", extra={"attempt": attempt})
            return
        except Exception as error:
            if attempt == 5:
                raise MigrationManagerError("connection_exhausted") from error
            logger.warning(
                "connection_retry",
                extra={
                    "attempt": attempt,
                    "max_attempts": 5,
                    **failure_context(error),
                },
            )
            time.sleep(2)


def get_schema_status(client: MySQLClient) -> SchemaStatus:
    try:
        result = client.run_sql_command(
            f"""
            SELECT count(*) FROM information_schema.tables
            WHERE table_schema = '{client.database}';
            """
        )
        if result.stdout.split("\n")[1] == "0":
            return SchemaStatus(SchemaState.EMPTY)

        result = client.run_sql_command(
            f"""
            SELECT count(*) FROM information_schema.tables
            WHERE table_schema= '{client.database}' AND
            table_name = '{VERSION_TABLE_NAME}'
            LIMIT 1;
            """
        )
        if result.stdout.split("\n")[1] != "1":
            return SchemaStatus(SchemaState.NOT_EMPTY)

        result = client.run_sql_command(
            f"""
            SELECT version FROM {VERSION_TABLE_NAME}
            ORDER BY id DESC
            LIMIT 1;
            """
        )
        return SchemaStatus(
            SchemaState.VERSIONED, parse_version(result.stdout.split("\n")[1])
        )
    except Exception as error:
        raise MigrationManagerError("schema_status") from error


def apply_version_to_version_table(script: Script, client):
    check_version_sql = f"""
        SELECT COUNT(*)
        FROM {VERSION_TABLE_NAME}
        WHERE version = '{str(script.version)}';
    """
    result = client.run_sql_command(check_version_sql)
    version_exists = int(result.stdout.split("\n")[1]) > 0

    if version_exists:
        raise MigrationManagerError("version_applied")

    insert_version_sql = f"""
        INSERT INTO {VERSION_TABLE_NAME} (version, script_name) VALUES
        ('{str(script.version)}', '{script.path.name}');
    """
    client.run_sql_command(insert_version_sql)


def create_version_table(script: Script, client):
    check_table_sql = f"""
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = '{client.database}'
        AND table_name = '{VERSION_TABLE_NAME}';
    """
    result = client.run_sql_command(check_table_sql)
    table_exists = int(result.stdout.split("\n")[1]) > 0
    if table_exists:
        raise MigrationManagerError("version_table")

    create_table_sql = f"""
        CREATE TABLE {VERSION_TABLE_NAME} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            version VARCHAR(50) NOT NULL,
            script_name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """
    client.run_sql_command(create_table_sql)

    apply_version_to_version_table(script, client)


def apply_scripts(
    client: MySQLClient, scripts: List[Script], dry_run, schema_status: SchemaStatus
):
    if dry_run:
        logger.info("dry_run")
    if not scripts:
        logger.info("already_current")
        print("No scripts to apply! Database is already up to date.")
        return

    is_versioned = schema_status.state == SchemaState.VERSIONED
    headers = ["Script", "Status"]
    script_names = [safe_script_name(s.path.name) for s in scripts]
    script_width = max(len(s) for s in script_names + [headers[0]]) + 2
    status = "PLANNED" if dry_run else "DONE"
    status_width = max(len(status), len(headers[1])) + 2
    print("Planning Scripts...\n" if dry_run else "Applying Scripts...\n")
    print(f"{headers[0]:<{script_width}}{headers[1]:<{status_width}}")
    print("=" * (script_width + status_width))
    for script, script_name in zip(scripts, script_names):
        update_context(
            phase="planning" if dry_run else "execution", script=script.path.name
        )
        started = time.monotonic()
        if not dry_run:
            logger.info("script_started")
        script_path = script.path.resolve()
        if not dry_run:
            with open(script_path, "r") as file:
                script_str = file.read()
                client.run_sql_command(script_str)
            if script.type == ScriptType.MIGRATION:
                if is_versioned:
                    apply_version_to_version_table(script, client)
                else:
                    create_version_table(script, client)
                    is_versioned = True
        logger.info(
            "script_planned" if dry_run else "script_completed",
            extra={
                "script_elapsed_ms": round((time.monotonic() - started) * 1000, 3),
            },
        )
        print(f"{script_name:<{script_width}}{status:<{status_width}}")
    print("")


def main():
    args = parse_args()
    configure_logging(args.log_level, args.log_format, dry_run=args.dry_run)
    logger.info("run_started")
    try:
        env_vars = EnvVars(env_file=args.env_file)
        perform_action(env_vars, args)
        return 0
    except Exception as error:
        # One terminal diagnostic, without traceback, raw SQL or driver stderr.
        logger.error("run_failed", extra=failure_context(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
