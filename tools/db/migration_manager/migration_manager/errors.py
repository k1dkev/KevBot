"""Public failure summaries contain no driver, SQL, or exception payloads."""

import errno
import re


FAILURES = {
    "environment": "Missing required DB_CONNECTION_STRING environment variable.",
    "connection_config": "Invalid MySQL connection configuration; use URL-encoded credentials and a simple schema name, and configure TLS with MYSQL_SSL_CA.",
    "tls_config": "MYSQL_SSL_CA must point to a readable CA certificate file.",
    "invalid_script": "Invalid script filename; expected major.minor.patch__[baseline__|seed__]name.sql.",
    "multiple_baselines": "Multiple baseline scripts found.",
    "baseline_order": "Baseline script does not have the lowest version.",
    "duplicate_migration": "Multiple migration scripts found for the same version.",
    "scripts_directory": "Scripts directory does not exist or is not a directory.",
    "no_scripts": "No SQL scripts found in scripts directory.",
    "target_version": "Target version must be 'latest' or major.minor.patch.",
    "downgrade": "Target version < current version!",
    "missing_target": "Migration or baseline script with desired target version does not exist!",
    "connection_exhausted": "Could not connect to MySQL after 5 attempts.",
    "schema_status": "Failed to determine schema status.",
    "version_applied": "Version has already been applied to database.",
    "version_table": "Version table already exists, not expected.",
    "sql_command": "MySQL command failed.",
}

MYSQL_CAUSES = {
    1044: "database_access_denied",
    1045: "authentication_failed",
    1049: "unknown_database",
    1062: "duplicate_key",
    1064: "sql_syntax_error",
    1142: "command_access_denied",
    1146: "table_missing",
    2002: "connection_unavailable",
    2003: "connection_unavailable",
    2005: "unknown_host",
    2006: "server_gone_away",
    2013: "connection_lost",
    2026: "tls_error",
}


class MigrationManagerError(Exception):
    def __init__(self, reason):
        self.reason = reason if reason in FAILURES else "migration_error"
        self.message = FAILURES.get(self.reason, "Migration error; details omitted.")
        super().__init__(self.message)


class MySQLCommandError(MigrationManagerError):
    def __init__(self, stderr):
        super().__init__("sql_command")
        # Never retain the raw client output, which can quote credentials or SQL data.
        match = re.search(r"(?m)^ERROR ([0-9]{4})\b", stderr)
        self.mysql_code = int(match[1]) if match else None


def failure_context(error):
    """Allowlisted summaries only, including the safe cause of wrapped failures."""
    fields = {}
    if isinstance(error, MigrationManagerError):
        fields["reason"] = error.reason
    # Our wrappers use explicit causes; ignore implicit exception contexts entirely.
    seen = set()
    while error.__cause__ is not None and id(error) not in seen:
        seen.add(id(error))
        error = error.__cause__
    if isinstance(error, MySQLCommandError):
        fields["cause"] = MYSQL_CAUSES.get(error.mysql_code, "mysql_command_failed")
        if error.mysql_code is not None:
            fields["mysql_code"] = error.mysql_code
    elif isinstance(error, FileNotFoundError):
        fields["cause"] = "file_or_executable_missing"
    elif isinstance(error, PermissionError):
        fields["cause"] = "permission_denied"
    elif isinstance(error, OSError):
        fields["cause"] = errno.errorcode.get(error.errno, "os_error")
    elif isinstance(error, ValueError):
        fields["cause"] = "invalid_value"
    else:
        fields["cause"] = "migration_error"
    return fields
