import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from migration_manager import __main__ as cli


class CliTests(unittest.TestCase):
    def test_connection_decodes_credentials_without_putting_password_in_argv(self):
        with patch.dict(os.environ, {}, clear=True):
            client = cli.MySQLClient("mysql://user:p%20a%22ss%5Cword@localhost:3307/test_db")
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
            with patch.object(cli.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "", "")) as run:
                client.run_sql_command("SELECT 1")
                self.assertIn("--ssl-verify-server-cert", run.call_args.args[0])
                self.assertIn(f"--ssl-ca={ca.name}", run.call_args.args[0])

    def test_invalid_connection_is_rejected_without_echoing_secret(self):
        for connection in ["garbage", "postgres://u:secret@host/db", "mysql://u:secret@host/db?sslmode=required"]:
            with self.subTest(connection=connection), self.assertRaises(cli.MigrationManagerError) as error:
                cli.MySQLClient(connection)
            self.assertNotIn("secret", str(error.exception))

    def test_manager_errors_return_failure(self):
        with patch.object(cli, "parse_args"), patch.object(cli, "EnvVars"), patch.object(cli, "perform_action", side_effect=cli.MigrationManagerError("bad SQL")):
            self.assertEqual(cli.main(), 1)


if __name__ == "__main__":
    unittest.main()
