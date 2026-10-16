import argparse
import os
import re
import subprocess
import tempfile
import time
from dotenv import load_dotenv
from packaging.version import parse as parse_version, Version, InvalidVersion
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
from enum import Enum
from collections import defaultdict
from urllib.parse import urlparse, unquote

VERSION_TABLE_NAME = "schema_version"


class MigrationManagerError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


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
        for env_var in self.get_required_env_vars():
            value = os.getenv(env_var)
            attr = env_var.lower()
            if value is None:
                raise MigrationManagerError(
                    f"Missing required environment variable: {env_var}"
                )
            if hasattr(self, attr):
                setattr(self, attr, value)
            else:
                raise MigrationManagerError(f"Unknown attribute: {attr}")


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
            raise MigrationManagerError(
                "DB_CONNECTION_STRING must be mysql://user:password@host:port/database "
                "with URL-encoded credentials and a simple schema name; configure TLS with MYSQL_SSL_CA."
            ) from None
        self.ssl_ca = os.getenv("MYSQL_SSL_CA")
        if self.ssl_ca and not Path(self.ssl_ca).is_file():
            raise MigrationManagerError(
                "MYSQL_SSL_CA must point to a readable CA certificate file."
            )

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
            raise MigrationManagerError(f"SQL command failed!\n{result.stderr}")
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
        raise MigrationManagerError(f"Invalid script filename: {f.name}")
    name = match.group("name")
    if name in ["baseline", "seed"]:
        raise MigrationManagerError(f"Invalid script filename: {f.name}")
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
        raise MigrationManagerError("Multiple baseline scripts found.")
    elif baseline_scripts:
        baseline_script = baseline_scripts[0]
        lowest_version = min(s.version for s in all_scripts)
        if baseline_script.version != lowest_version:
            raise MigrationManagerError(
                "Baseline script does not have the lowest version."
            )

    migration_versions = [s.version for s in migration_scripts]
    if len(migration_versions) != len(set(migration_versions)):
        raise MigrationManagerError(
            "Multiple migration scripts found for the same version."
        )

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
        check_mysql_connection(client)
        schema_status = get_schema_status(client)
        print(schema_status.describe())
        if not Path(args.scripts_directory).is_dir():
            raise MigrationManagerError(
                "Scripts directory does not exist or is not a directory."
            )
        all_scripts = [
            script
            for f in Path(args.scripts_directory).rglob("*")
            if (script := parse_script_file(f))
        ]
        if not all_scripts:
            raise MigrationManagerError("No SQL scripts found in scripts directory.")
        if args.version == "latest":
            target_version = max(s.version for s in all_scripts)
        else:
            if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
                raise MigrationManagerError(
                    "Target version must be 'latest' or major.minor.patch."
                )
            target_version = parse_version(args.version)
        print(f"Target version: {target_version}")
        if schema_status.version:
            if target_version < schema_status.version:
                raise MigrationManagerError("Target version < current version!")
        if target_version not in [
            s.version
            for s in all_scripts
            if s.type in {ScriptType.MIGRATION, ScriptType.BASELINE}
        ]:
            raise MigrationManagerError(
                "Migration or baseline script with desired target version does not"
                " exist!"
            )
        scripts = get_scripts_to_apply(all_scripts, schema_status, target_version)
        apply_scripts(client, scripts, args.dry_run, schema_status)
        print(
            f"Database migration complete! {schema_status.version} --> {target_version}"
        )


def check_mysql_connection(client: MySQLClient):
    print("Testing MySQL database connection...")
    attempts = 0
    while attempts < 5:
        try:
            client.run_sql_command("SELECT 1")
            print("MySQL database is ready.")
            return
        except Exception:
            print("Waiting for MySQL to be ready...")
            attempts += 1
            time.sleep(2)
    print("Number of attempts exceeded. Could not connect to MySql Database.")
    sys.exit(1)


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
    except Exception:
        raise MigrationManagerError("Failed to determine Schema Status")


def apply_version_to_version_table(script: Script, client):
    check_version_sql = f"""
        SELECT COUNT(*)
        FROM {VERSION_TABLE_NAME}
        WHERE version = '{str(script.version)}';
    """
    result = client.run_sql_command(check_version_sql)
    version_exists = int(result.stdout.split("\n")[1]) > 0

    if version_exists:
        raise MigrationManagerError(
            f"Version '{str(script.version)} has already been applied to database"
        )

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
        raise MigrationManagerError("Version table already exists, not expected")

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
        print("DRY RUN. Scripts will not actually be applied.")
    if not scripts:
        print("No scripts to apply! Database is already up to date.")
        return

    is_versioned = schema_status.state == SchemaState.VERSIONED
    headers = ["Script", "Status"]
    script_names = [s.path.name for s in scripts]
    script_width = max(len(s) for s in script_names + [headers[0]]) + 2
    status_width = max(len(status) for status in ["DONE"] + [headers[1]]) + 2
    print("Applying Scripts...\n")
    print(f"{headers[0]:<{script_width}}{headers[1]:<{status_width}}")
    print("=" * (script_width + status_width))
    for script in scripts:
        print(f"{script.path.name:<{script_width}}", end="")
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
        print(f"{'DONE':<{status_width}}")
    print("")


def main():
    try:
        args = parse_args()
        env_vars = EnvVars(env_file=args.env_file)
        perform_action(env_vars, args)
        return 0
    except MigrationManagerError as e:
        print(
            f"\nMigration failed with the following error: {e.message}", file=sys.stderr
        )
        return 1
    except (OSError, InvalidVersion, ValueError) as e:
        print(f"\nMigration failed: {type(e).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
