"""Exercise locked uv installs in fresh directories, without touching a database."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]


class LockedEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="migration-uv-")
        self.addCleanup(self.directory.cleanup)
        self.project = Path(self.directory.name)
        for name in ("pyproject.toml", "uv.lock", ".python-version"):
            shutil.copy2(PROJECT / name, self.project / name)
        shutil.copytree(
            PROJECT / "migration_manager", self.project / "migration_manager"
        )
        self.lock = self.project / "uv.lock"
        self.original_lock = self.lock.read_bytes()

    def sync(self, *args):
        return subprocess.run(
            ["uv", "sync", "--locked", *args],
            cwd=self.project,
            env={
                **os.environ,
                "UV_PROJECT_ENVIRONMENT": str(self.project / ".venv"),
                "UV_PYTHON": "3.12",
                "UV_PYTHON_DOWNLOADS": "never",
                "VIRTUAL_ENV": "",
            },
            text=True,
            capture_output=True,
        )

    def test_clean_install_and_cli_help_without_lock_changes(self):
        result = self.sync()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.lock.read_bytes(), self.original_lock)
        python = (
            self.project
            / ".venv"
            / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        )
        for args in (("--help",), ("migrate", "--help")):
            help_result = subprocess.run(
                [str(python), "-m", "migration_manager", *args],
                cwd=self.project,
                text=True,
                capture_output=True,
            )
            self.assertEqual(help_result.returncode, 0, help_result.stderr)
            self.assertIn("migrate", help_result.stdout)

    def test_stale_lock_fails_without_rewriting_it(self):
        manifest = self.project / "pyproject.toml"
        manifest.write_text(
            manifest.read_text().replace('version = "0.1.0"', 'version = "0.1.1"')
        )
        result = self.sync("--offline")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertIn("lockfile", result.stderr)
        self.assertEqual(self.lock.read_bytes(), self.original_lock)

    def test_missing_lock_fails_without_generating_it(self):
        self.lock.unlink()
        result = self.sync("--offline")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertIn("lockfile", result.stderr)
        self.assertFalse(self.lock.exists())


if __name__ == "__main__":
    unittest.main()
