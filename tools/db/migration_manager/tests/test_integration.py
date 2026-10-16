"""Opt-in Docker integration check: python -m unittest discover -s tests -p test_integration.py."""

from pathlib import Path
import json
import os
import subprocess
import tempfile
import time
import unittest
import uuid


def docker(*args, check=True):
    return subprocess.run(
        ["docker", *args], text=True, capture_output=True, check=check
    )


class MigrationIntegration(unittest.TestCase):
    def test_targets_dry_run_failures_and_verified_tls(self):
        suffix = uuid.uuid4().hex[:10]
        network = f"migration-check-{suffix}"
        database = f"migration-db-{suffix}"
        image = os.getenv("MIGRATION_TEST_IMAGE", "migration-manager:check")
        with tempfile.TemporaryDirectory(prefix="migration-check-") as directory:
            root = Path(directory)
            tls = root / "tls"
            tls.mkdir()
            subprocess.run(
                [
                    "openssl",
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-keyout",
                    str(tls / "server-key.pem"),
                    "-out",
                    str(tls / "server-cert.pem"),
                    "-days",
                    "1",
                    "-subj",
                    "/CN=migration-db",
                    "-addext",
                    "subjectAltName=DNS:migration-db",
                ],
                capture_output=True,
                check=True,
            )
            (tls / "server-key.pem").chmod(0o644)
            scripts = root / "scripts"
            scripts.mkdir()
            (scripts / "1.0.0__baseline__empty.sql").write_text(
                "CREATE TABLE sample (id INT PRIMARY KEY);\n"
            )
            (scripts / "1.1.0__add_name.sql").write_text(
                "ALTER TABLE sample ADD name VARCHAR(20);\n"
            )
            (scripts / "1.2.0__bad.sql").write_text(
                "THIS IS NOT VALID SQL 'synthetic-seed-secret';\n"
            )
            docker("network", "create", network)
            try:
                docker(
                    "run",
                    "-d",
                    "--name",
                    database,
                    "--network",
                    network,
                    "--network-alias",
                    "migration-db",
                    "-e",
                    "MYSQL_ROOT_PASSWORD=smoke-only",
                    "-e",
                    "MYSQL_ROOT_HOST=%",
                    "-e",
                    "MYSQL_DATABASE=smoke",
                    "--mount",
                    f"type=bind,source={tls},target=/tls,readonly",
                    "mysql:8.0.30",
                    "--ssl-ca=/tls/server-cert.pem",
                    "--ssl-cert=/tls/server-cert.pem",
                    "--ssl-key=/tls/server-key.pem",
                    "--require-secure-transport=ON",
                )
                for _ in range(120):
                    ready = docker(
                        "exec",
                        database,
                        "mysql",
                        "--protocol=TCP",
                        "-h127.0.0.1",
                        "-uroot",
                        "-psmoke-only",
                        "-e",
                        "SELECT 1",
                        check=False,
                    )
                    if ready.returncode == 0:
                        break
                    time.sleep(1)
                else:
                    self.fail(docker("logs", database).stdout)

                def query(sql):
                    return docker(
                        "exec",
                        database,
                        "mysql",
                        "-uroot",
                        "-psmoke-only",
                        "--batch",
                        "--skip-column-names",
                        "smoke",
                        "-e",
                        sql,
                    ).stdout.strip()

                def migrate(*args, password="smoke-only"):
                    return docker(
                        "run",
                        "--rm",
                        "--network",
                        network,
                        "-e",
                        f"DB_CONNECTION_STRING=mysql://root:{password}@migration-db:3306/smoke",
                        "-e",
                        "MYSQL_SSL_CA=/tls/server-cert.pem",
                        "--mount",
                        f"type=bind,source={tls},target=/tls,readonly",
                        "--mount",
                        f"type=bind,source={scripts},target=/migration,readonly",
                        image,
                        "migrate",
                        "/migration",
                        *args,
                        check=False,
                    )

                def records(result):
                    rows = [json.loads(line) for line in result.stderr.splitlines()]
                    self.assertEqual(len({row["run_id"] for row in rows}), 1)
                    self.assertTrue(
                        all(row["component"] == "migration_manager" for row in rows)
                    )
                    for secret in (
                        "smoke-only",
                        "wrong-password",
                        "mysql://",
                        "synthetic-seed-secret",
                        "THIS IS NOT VALID SQL",
                        "Traceback",
                    ):
                        self.assertNotIn(secret, result.stdout + result.stderr)
                    return rows

                dry = migrate("--version", "1.1.0", "--dry-run", "--log-format", "json")
                self.assertEqual(dry.returncode, 0, dry.stderr)
                dry_records = records(dry)
                self.assertTrue(all(row["dry_run"] for row in dry_records))
                self.assertIn("script_planned", [row["event"] for row in dry_records])
                self.assertIn("PLANNED", dry.stdout)
                self.assertNotIn("DONE", dry.stdout)
                self.assertEqual(
                    query(
                        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='smoke'"
                    ),
                    "0",
                )
                applied = migrate("--version", "1.1.0", "--log-format", "json")
                self.assertEqual(applied.returncode, 0, applied.stderr)
                self.assertEqual(records(applied)[-1]["event"], "run_completed")
                # API Testcontainers readiness still consumes this exact stdout result.
                self.assertIn(
                    "Database migration complete! None --> 1.1.0", applied.stdout
                )
                self.assertEqual(
                    query(
                        "SELECT version FROM schema_version ORDER BY id DESC LIMIT 1"
                    ),
                    "1.1.0",
                )
                current = migrate("--version", "1.1.0", "--log-format", "json")
                self.assertEqual(current.returncode, 0, current.stderr)
                self.assertIn("already up to date", current.stdout)
                current_record = next(
                    row for row in records(current) if row["event"] == "already_current"
                )
                self.assertEqual(current_record["current_version"], "1.1.0")
                self.assertEqual(current_record["target_version"], "1.1.0")
                for target in ["bogus", "1.9.0", "1.0.0", "1.2.0"]:
                    failed = migrate("--version", target, "--log-format", "json")
                    self.assertNotEqual(failed.returncode, 0, target)
                    failure_records = records(failed)
                    self.assertEqual(
                        sum(row["severity"] == "ERROR" for row in failure_records), 1
                    )
                    self.assertEqual(failure_records[-1]["event"], "run_failed")
                    self.assertNotIn("Database migration complete!", failed.stdout)
                    if target == "1.2.0":
                        self.assertEqual(
                            failure_records[-1]["cause"], "sql_syntax_error"
                        )
                        self.assertEqual(failure_records[-1]["mysql_code"], 1064)
                        self.assertEqual(
                            failure_records[-1]["script"], "1.2.0__bad.sql"
                        )
                denied = migrate(
                    "--log-format",
                    "json",
                    "--log-level",
                    "DEBUG",
                    password="wrong-password",
                )
                self.assertNotEqual(denied.returncode, 0)
                denied_records = records(denied)
                self.assertEqual(
                    sum(row["event"] == "connection_retry" for row in denied_records), 4
                )
                self.assertEqual(
                    sum(row["severity"] == "ERROR" for row in denied_records), 1
                )
                self.assertEqual(denied_records[-1]["cause"], "authentication_failed")
                self.assertEqual(denied_records[-1]["reason"], "connection_exhausted")
                self.assertEqual(denied_records[-1]["mysql_code"], 1045)
                self.assertEqual(
                    query(
                        "SELECT version FROM schema_version ORDER BY id DESC LIMIT 1"
                    ),
                    "1.1.0",
                )
                (scripts / "1.2.0__bad.sql").write_text(
                    "ALTER TABLE sample ADD finished INT;\n"
                )
                latest = migrate()
                self.assertEqual(latest.returncode, 0, latest.stderr)
                self.assertIn(" INFO migration_manager ", latest.stderr)
                self.assertEqual(
                    query(
                        "SELECT version FROM schema_version ORDER BY id DESC LIMIT 1"
                    ),
                    "1.2.0",
                )
            finally:
                docker("rm", "-f", "-v", database, check=False)
                docker("network", "rm", network, check=False)


if __name__ == "__main__":
    unittest.main()
