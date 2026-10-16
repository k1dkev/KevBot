import os
import argparse
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import logging
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

from migration_manager import __main__ as cli
from migration_manager import diagnostics, errors


class CliTests(unittest.TestCase):
    def test_connection_decodes_credentials_without_putting_password_in_argv(self):
        with patch.dict(os.environ, {}, clear=True):
            client = cli.MySQLClient(
                "mysql://user:p%20a%22ss%5Cword@localhost:3307/test_db"
            )

        def run(cmd, **kwargs):
            self.assertNotIn(client.password, " ".join(cmd))
            options = Path(cmd[1].split("=", 1)[1])
            self.assertEqual(options.stat().st_mode & 0o777, 0o600)
            self.assertIn('password="p a\\"ss\\\\word"', options.read_text())
            self.assertEqual(cmd[-1], "3307")
            return subprocess.CompletedProcess(cmd, 0, "ok", "")

        with patch.object(cli.subprocess, "run", side_effect=run):
            client.run_sql_command("SELECT 1")

    def test_tls_verifies_ca_and_server_identity(self):
        with tempfile.NamedTemporaryFile() as ca:
            with patch.dict(os.environ, {"MYSQL_SSL_CA": ca.name}, clear=True):
                client = cli.MySQLClient("mysql://user:password@localhost/db")
            with patch.object(
                cli.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0, "", ""),
            ) as run:
                client.run_sql_command("SELECT 1")
                self.assertIn("--ssl-verify-server-cert", run.call_args.args[0])
                self.assertIn(
                    f"--ssl-ca={Path(ca.name).resolve()}", run.call_args.args[0]
                )

    def test_invalid_connection_is_rejected_without_echoing_secret(self):
        for connection in [
            "garbage",
            "postgres://u:secret@host/db",
            "mysql://u:secret@host/db?sslmode=required",
        ]:
            with (
                self.subTest(connection=connection),
                self.assertRaises(cli.MigrationManagerError) as error,
            ):
                cli.MySQLClient(connection)
            self.assertNotIn("secret", str(error.exception))

    def test_manager_errors_return_failure(self):
        with (
            patch.object(
                cli,
                "parse_args",
                return_value=argparse.Namespace(
                    log_level="INFO",
                    log_format="text",
                    dry_run=False,
                    env_file="unused",
                ),
            ),
            patch.object(cli, "EnvVars"),
            patch.object(
                cli, "perform_action", side_effect=cli.MigrationManagerError("bad SQL")
            ),
        ):
            with redirect_stderr(io.StringIO()):
                self.assertEqual(cli.main(), 1)


class LoggingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.scripts = Path(self.directory.name)
        (self.scripts / "1.0.0__create.sql").write_text(
            "CREATE TABLE sample (id INT);\n"
        )
        self.connection = (
            "mysql://migration-user:synthetic%20password@private-host/private_db"
        )
        self.environment = patch.dict(
            os.environ,
            {
                "DB_CONNECTION_STRING": self.connection,
                "API_SECRET": "environment-secret",
            },
            clear=True,
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.addCleanup(self.clear_logging)

    def clear_logging(self):
        logger = logging.getLogger("migration_manager")
        for handler in logger.handlers[:]:
            logger.removeHandler(handler)
            handler.close()

    def run_cli(self, *options, sql=None, stream=None):
        stdout = io.StringIO()
        stderr = stream if stream is not None else io.StringIO()
        # Return the same empty-schema/count responses without executing SQL.
        default = subprocess.CompletedProcess([], 0, "count\n0\n", "")
        with (
            patch.object(
                cli.sys,
                "argv",
                [
                    "migration-manager",
                    "migrate",
                    str(self.scripts),
                    "--env-file",
                    str(self.scripts / "absent.env"),
                    *options,
                ],
            ),
            patch.object(
                cli.MySQLClient,
                "run_sql_command",
                side_effect=sql,
                return_value=default,
            ) as run,
            patch.object(cli.time, "sleep") as sleep,
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            status = cli.main()
        return status, stdout.getvalue(), stderr, run, sleep

    def records(self, stream):
        return [json.loads(line) for line in stream.getvalue().splitlines()]

    def test_success_context_and_stdout_contract(self):
        status, stdout, stderr, _, _ = self.run_cli(
            "--log-format", "json", "--log-level", "DEBUG"
        )
        self.assertEqual(status, 0)
        records = self.records(stderr)
        events = {record["event"]: record for record in records}
        self.assertEqual(len({record["run_id"] for record in records}), 1)
        for record in records:
            self.assertRegex(record["timestamp"], r"^\d{4}-.*\+00:00$")
            self.assertRegex(record["run_id"], r"^[a-f0-9]{32}$")
            self.assertEqual(record["component"], "migration_manager.__main__")
            self.assertGreaterEqual(record["elapsed_ms"], 0)
            self.assertFalse(record["dry_run"])
        plan = events["plan_ready"]
        self.assertIsNone(plan["current_version"])
        self.assertEqual(plan["target_version"], "1.0.0")
        self.assertRegex(plan["target"], r"^db-[a-f0-9]{12}$")
        self.assertEqual(plan["schema_state"], "EMPTY")
        self.assertEqual(plan["script_count"], 1)
        script = events["script_completed"]
        self.assertEqual(script["phase"], "execution")
        self.assertEqual(script["script"], "1.0.0__create.sql")
        self.assertGreaterEqual(script["script_elapsed_ms"], 0)
        self.assertEqual(events["run_completed"]["phase"], "completion")
        self.assertIsNone(events["run_completed"]["script"])
        self.assertIn("DONE", stdout)
        self.assertIn("Database migration complete! None --> 1.0.0", stdout)
        self.assertNotIn("run_id", stdout)

    def test_default_is_readable_info_on_stderr(self):
        status, stdout, stderr, _, _ = self.run_cli()
        self.assertEqual(status, 0)
        self.assertIn(" INFO migration_manager.__main__ ", stderr.getvalue())
        self.assertIn('event="plan_ready"', stderr.getvalue())
        self.assertNotIn("connection_check", stderr.getvalue())
        self.assertNotIn("MySQL database is ready", stdout)

    def test_filtering_leaves_cli_results_intact(self):
        for level in ("WARNING", "ERROR", "CRITICAL"):
            with self.subTest(level=level):
                status, stdout, stderr, _, _ = self.run_cli("--log-level", level)
                self.assertEqual(status, 0)
                self.assertEqual(stderr.getvalue(), "")
                self.assertIn("Database migration complete!", stdout)

    def test_dry_run_never_writes_and_reports_planned_scripts(self):
        status, stdout, stderr, run, _ = self.run_cli(
            "--dry-run", "--log-format", "json"
        )
        self.assertEqual(status, 0)
        self.assertEqual(run.call_count, 2)  # readiness and empty-schema read
        records = self.records(stderr)
        self.assertTrue(all(record["dry_run"] for record in records))
        self.assertIn("script_planned", [record["event"] for record in records])
        self.assertNotIn("script_started", [record["event"] for record in records])
        self.assertIn("PLANNED", stdout)
        self.assertNotIn("DONE", stdout)

    def test_already_current_preserves_version_and_has_no_execution(self):
        with patch.object(
            cli,
            "get_schema_status",
            return_value=cli.SchemaStatus(
                cli.SchemaState.VERSIONED,
                cli.Version("1.0.0"),
            ),
        ):
            status, stdout, stderr, run, _ = self.run_cli("--log-format", "json")
        self.assertEqual(status, 0)
        self.assertEqual(run.call_count, 1)
        records = self.records(stderr)
        current = next(
            record for record in records if record["event"] == "already_current"
        )
        self.assertEqual(current["severity"], "INFO")
        self.assertEqual(current["current_version"], "1.0.0")
        self.assertEqual(current["target_version"], "1.0.0")
        self.assertIn("already up to date", stdout)

    def test_retry_recovery_is_warning_then_success(self):
        ok = subprocess.CompletedProcess([], 0, "count\n0\n", "")
        responses = iter(
            [errors.MySQLCommandError("ERROR 2003 (HY000): sensitive payload"), ok]
        )

        def sql(_):
            result = next(responses, ok)
            if isinstance(result, Exception):
                raise result
            return result

        status, _, stderr, _, sleep = self.run_cli("--log-format", "json", sql=sql)
        self.assertEqual(status, 0)
        records = self.records(stderr)
        retry = next(
            record for record in records if record["event"] == "connection_retry"
        )
        self.assertEqual(retry["severity"], "WARNING")
        self.assertEqual(retry["attempt"], 1)
        self.assertEqual(retry["cause"], "connection_unavailable")
        ready = next(
            record for record in records if record["event"] == "connection_ready"
        )
        self.assertEqual(ready["attempt"], 2)
        sleep.assert_called_once_with(2)
        self.assertNotIn("sensitive payload", stderr.getvalue())

    def test_retry_exhaustion_has_one_error_and_safe_useful_final_cause(self):
        for output_format in ("text", "json"):
            with self.subTest(output_format=output_format):
                status, stdout, stderr, run, sleep = self.run_cli(
                    "--log-format",
                    output_format,
                    sql=errors.MySQLCommandError(
                        "ERROR 1045 (28000): Access denied: synthetic password"
                    ),
                )
                self.assertEqual(status, 1)
                self.assertEqual(stdout, "")
                self.assertEqual(run.call_count, 5)
                self.assertEqual(sleep.call_count, 4)
                output = stderr.getvalue()
                self.assertEqual(output.count("Migration failed."), 1)
                self.assertEqual(output.count("MySQL connection failed; retrying"), 4)
                self.assertIn("authentication_failed", output.splitlines()[-1])
                self.assertIn("1045", output.splitlines()[-1])
                self.assertIn("after 5 attempts", output.splitlines()[-1])
                self.assertNotIn("synthetic password", output)
                self.assertNotIn("Traceback", output)

    def test_sql_failure_has_script_context_no_completion_or_payload(self):
        def sql(statement):
            if statement.startswith("CREATE TABLE sample"):
                raise errors.MySQLCommandError(
                    "ERROR 1064 (42000) at line 1: secret seed INSERT INTO data VALUES ('secret-row')"
                )
            return subprocess.CompletedProcess([], 0, "count\n0\n", "")

        status, stdout, stderr, _, _ = self.run_cli("--log-format", "json", sql=sql)
        self.assertEqual(status, 1)
        record = self.records(stderr)[-1]
        self.assertEqual(record["event"], "run_failed")
        self.assertEqual(record["script"], "1.0.0__create.sql")
        self.assertEqual(record["phase"], "execution")
        self.assertEqual(record["cause"], "sql_syntax_error")
        self.assertEqual(record["mysql_code"], 1064)
        self.assertNotIn("DONE", stdout)
        self.assertNotIn("Database migration complete!", stdout)
        for secret in ("secret-row", "INSERT INTO", "secret seed"):
            self.assertNotIn(secret, stdout + stderr.getvalue())

    def test_schema_failure_preserves_safe_cause(self):
        responses = [
            subprocess.CompletedProcess([], 0, "1\n1\n", ""),
            errors.MySQLCommandError("ERROR 1142 (42000): sensitive SQL"),
        ]
        status, _, stderr, _, _ = self.run_cli("--log-format", "json", sql=responses)
        self.assertEqual(status, 1)
        failure = self.records(stderr)[-1]
        self.assertEqual(failure["reason"], "schema_status")
        self.assertEqual(failure["cause"], "command_access_denied")
        self.assertEqual(failure["phase"], "schema")
        self.assertNotIn("sensitive SQL", stderr.getvalue())

    def test_untrusted_exception_payloads_are_never_serialized_even_at_debug(self):
        for error in (
            RuntimeError(self.connection),
            ValueError("SQL seed payload environment-secret"),
            FileNotFoundError(2, "synthetic password", "/sensitive/option-file.cnf"),
            subprocess.CalledProcessError(
                1, ["mysql", "password"], stderr="secret-row"
            ),
            cli.MigrationManagerError("secret-row"),
        ):
            with self.subTest(error=type(error).__name__):
                status, stdout, stderr, _, _ = self.run_cli(
                    "--log-format",
                    "json",
                    "--log-level",
                    "DEBUG",
                    sql=error,
                )
                self.assertEqual(status, 1)
                output = stdout + stderr.getvalue()
                for secret in (
                    self.connection,
                    "synthetic password",
                    "synthetic%20password",
                    "migration-user",
                    "private-host",
                    "private_db",
                    "environment-secret",
                    "SQL seed payload",
                    "option-file.cnf",
                    "secret-row",
                    "Traceback",
                ):
                    self.assertNotIn(secret, output)

    def test_script_metadata_and_table_are_redacted_and_single_line(self):
        (self.scripts / "1.0.0__create.sql").unlink()
        (
            self.scripts / "1.0.0__environment-secret_synthetic password\t.sql"
        ).write_text("sensitive SQL")
        status, stdout, stderr, _, _ = self.run_cli("--dry-run", "--log-format", "json")
        self.assertEqual(status, 0)
        self.assertIn("[redacted]", stdout)
        planned = next(
            record
            for record in self.records(stderr)
            if record["event"] == "script_planned"
        )
        self.assertNotIn("\t", planned["script"])
        for secret in ("environment-secret", "synthetic password", "sensitive SQL"):
            self.assertNotIn(secret, stdout + stderr.getvalue())

    def test_secrets_loaded_from_env_file_are_redacted(self):
        (self.scripts / "settings.env").write_text("ANOTHER_SECRET=file-secret\n")
        (self.scripts / "1.0.1__file-secret.sql").write_text("synthetic SQL")
        status, stdout, stderr, _, _ = self.run_cli(
            "--dry-run",
            "--env-file",
            str(self.scripts / "settings.env"),
        )
        self.assertEqual(status, 0)
        self.assertNotIn("file-secret", stdout + stderr.getvalue())

    def test_invalid_target_is_not_echoed(self):
        status, _, stderr, _, _ = self.run_cli(
            "--version", "environment-secret", "--log-format", "json"
        )
        self.assertEqual(status, 1)
        self.assertEqual(self.records(stderr)[-1]["reason"], "target_version")
        self.assertNotIn("environment-secret", stderr.getvalue())

    def test_invalid_script_failure_sanitizes_name_and_does_not_execute(self):
        (self.scripts / "environment-secret\n.sql").write_text("sensitive seed")
        status, stdout, stderr, run, _ = self.run_cli("--log-format", "json")
        self.assertEqual(status, 1)
        self.assertEqual(run.call_count, 2)
        failure = self.records(stderr)[-1]
        self.assertEqual(failure["reason"], "invalid_script")
        self.assertEqual(failure["script"], "[redacted]_.sql")
        self.assertNotIn("environment-secret", stdout + stderr.getvalue())

    def test_critical_threshold_still_returns_failure(self):
        status, stdout, stderr, _, _ = self.run_cli(
            "--log-level",
            "CRITICAL",
            sql=ValueError("environment-secret"),
        )
        self.assertEqual(status, 1)
        self.assertEqual(stdout + stderr.getvalue(), "")

    def test_missing_environment_is_one_safe_failure(self):
        os.environ.pop("DB_CONNECTION_STRING")
        status, _, stderr, run, _ = self.run_cli("--log-format", "json")
        self.assertEqual(status, 1)
        run.assert_not_called()
        failure = self.records(stderr)[-1]
        self.assertEqual(failure["reason"], "environment")
        self.assertEqual(failure["target"], "unconfigured")

    def test_repeated_invocations_do_not_duplicate_handlers_or_reuse_runs(self):
        root_handlers = logging.getLogger().handlers[:]
        first = self.run_cli("--log-format", "json")[2]
        second = self.run_cli("--log-format", "json")[2]
        self.assertNotEqual(
            self.records(first)[0]["run_id"], self.records(second)[0]["run_id"]
        )
        self.assertEqual(
            sum(record["event"] == "run_completed" for record in self.records(second)),
            1,
        )
        self.assertEqual(logging.getLogger().handlers, root_handlers)

    def test_formatter_omits_raw_records_tracebacks_and_unknown_extras(self):
        stream = io.StringIO()
        with redirect_stderr(stream):
            diagnostics.configure_logging("DEBUG", "json")
            try:
                raise ValueError("secret traceback payload")
            except ValueError:
                cli.logger.error(
                    "run_failed",
                    "secret arg",
                    exc_info=True,
                    stack_info=True,
                    extra={
                        "sql": "secret SQL",
                        "reason": "secret reason",
                        "cause": "secret cause",
                        "script_count": "secret count",
                    },
                )
                cli.logger.debug("secret message %s", "secret arg")
        self.assertNotIn("secret", stream.getvalue())
        self.assertEqual(self.records(stream)[1]["event"], "unknown")

    def test_logging_io_and_formatter_failures_preserve_migration_result(self):
        broken_stream = Mock()
        broken_stream.write.side_effect = OSError("secret broken stream")
        for sql, expected in ((None, 0), (RuntimeError("secret payload"), 1)):
            with self.subTest(expected=expected):
                status, _, _, _, _ = self.run_cli(stream=broken_stream, sql=sql)
                self.assertEqual(status, expected)
                with patch.object(
                    diagnostics.DiagnosticFormatter,
                    "format",
                    side_effect=ValueError("secret formatter"),
                ):
                    status, _, stderr, _, _ = self.run_cli(sql=sql)
                    self.assertEqual(status, expected)
                    self.assertEqual(stderr.getvalue(), "")

    def test_cli_validates_log_options_and_help_without_starting_a_run(self):
        for options, expected in (
            (["--log-level", "environment-secret"], 2),
            (["--log-format", "environment-secret"], 2),
            (["--help"], 0),
        ):
            stdout, stderr = io.StringIO(), io.StringIO()
            with (
                patch.object(
                    cli.sys,
                    "argv",
                    ["migration-manager", "migrate", str(self.scripts), *options],
                ),
                patch.object(cli, "configure_logging") as configure,
                redirect_stdout(stdout),
                redirect_stderr(stderr),
                self.assertRaises(SystemExit) as exit_status,
            ):
                cli.main()
            self.assertEqual(exit_status.exception.code, expected)
            configure.assert_not_called()
            self.assertNotIn(
                "environment-secret", stdout.getvalue() + stderr.getvalue()
            )
        status, _, stderr, _, _ = self.run_cli("--log-level", "warning")
        self.assertEqual(status, 0)
        self.assertEqual(stderr.getvalue(), "")

    def test_both_real_entrypoints_return_one_safe_configuration_error(self):
        for entrypoint in (["-m", "migration_manager"], ["migration_manager"]):
            with self.subTest(entrypoint=entrypoint):
                result = subprocess.run(
                    [
                        cli.sys.executable,
                        *entrypoint,
                        "migrate",
                        str(self.scripts),
                        "--env-file",
                        str(self.scripts / "absent.env"),
                        "--log-format",
                        "json",
                    ],
                    cwd=Path(cli.__file__).resolve().parents[1],
                    env={"DB_CONNECTION_STRING": "malformed-secret"},
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stdout, "")
                records = [json.loads(line) for line in result.stderr.splitlines()]
                self.assertEqual(
                    sum(record["severity"] == "ERROR" for record in records), 1
                )
                self.assertEqual(records[-1]["reason"], "connection_config")
                self.assertEqual(records[-1]["component"], "migration_manager")
                self.assertNotIn("malformed-secret", result.stderr)

    def test_mysql_subprocess_stderr_is_discarded_at_source(self):
        client = cli.MySQLClient(self.connection)
        for stderr, expected_code in (
            ("ERROR 1064 (42000) at line 1: seed-secret\nSQL data", 1064),
            ("client error containing seed-secret", None),
        ):
            with (
                self.subTest(expected_code=expected_code),
                patch.object(
                    cli.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess([], 1, "", stderr),
                ),
                self.assertRaises(errors.MySQLCommandError) as caught,
            ):
                client.run_sql_command("sensitive SQL")
            self.assertEqual(caught.exception.mysql_code, expected_code)
            self.assertNotIn("seed-secret", str(caught.exception))
            self.assertNotIn("SQL data", repr(caught.exception.__dict__))
            self.assertNotIn("sensitive SQL", repr(caught.exception.__dict__))


if __name__ == "__main__":
    unittest.main()
