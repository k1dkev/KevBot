"""Standard logging configuration with an explicit, payload-free output schema."""

from contextvars import ContextVar
from datetime import datetime, timezone
import errno
import hashlib
import json
import logging
import os
import re
import time
from urllib.parse import quote
import uuid

if __package__:
    from .errors import FAILURES, MYSQL_CAUSES
else:
    from errors import FAILURES, MYSQL_CAUSES


EVENTS = {
    "run_started": "Migration run started.",
    "connection_check": "Testing MySQL database connection.",
    "connection_retry": "MySQL connection failed; retrying in 2 seconds.",
    "connection_ready": "MySQL database is ready.",
    "schema_status": "Schema status determined.",
    "plan_ready": "Migration plan ready.",
    "dry_run": "Dry run; scripts will not be applied.",
    "already_current": "No scripts to apply; database is already up to date.",
    "script_started": "Applying script.",
    "script_completed": "Script applied.",
    "script_planned": "Script planned; not applied.",
    "run_completed": "Migration run completed.",
    "run_failed": "Migration failed.",
}
DETAIL_FIELDS = (
    "attempt",
    "max_attempts",
    "script_count",
    "script_elapsed_ms",
    "reason",
    "cause",
    "mysql_code",
)
_context = ContextVar("migration_log_context", default={})
_secrets = ContextVar("migration_log_secrets", default=())


def register_secrets(*values):
    secrets = set(_secrets.get())
    for value in values:
        if value:
            secrets.update((value, quote(value, safe="")))
    _secrets.set(tuple(sorted(secrets, key=len, reverse=True)))


def register_environment_secrets():
    register_secrets(
        *(
            value
            for name, value in os.environ.items()
            if re.search(r"PASSWORD|SECRET|TOKEN|KEY|CONNECTION_STRING", name, re.I)
        )
    )


def safe_script_name(name):
    for secret in _secrets.get():
        name = name.replace(secret, "[redacted]")
    name = re.sub(r"[A-Za-z][A-Za-z0-9+.-]*://\S+", "[redacted-url]", name)
    return re.sub(r"[^A-Za-z0-9_.\[\]-]", "_", name)[:160]


def target_label(host, port, database):
    # Opaque, stable label: no user, password, hostname or database name is emitted.
    digest = hashlib.sha256(f"{host}:{port}/{database}".encode()).hexdigest()[:12]
    return f"db-{digest}"


def update_context(**fields):
    _context.set({**_context.get(), **fields})


class DiagnosticFormatter(logging.Formatter):
    def __init__(self, output_format):
        super().__init__()
        self.output_format = output_format

    def format(self, record):
        context = _context.get()
        event = (
            record.msg
            if isinstance(record.msg, str) and record.msg in EVENTS
            else "unknown"
        )
        fields = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(
                timespec="milliseconds"
            ),
            "severity": record.levelname,
            "component": record.name,
            "run_id": context["run_id"],
            "event": event,
            "message": EVENTS.get(event, "Diagnostic details omitted."),
            **{
                name: context.get(name)
                for name in (
                    "target",
                    "dry_run",
                    "phase",
                    "current_version",
                    "target_version",
                    "schema_state",
                    "script",
                )
            },
            "elapsed_ms": round((time.monotonic() - context["started"]) * 1000, 3),
        }
        if fields["script"] is not None:
            fields["script"] = safe_script_name(fields["script"])
        for name in DETAIL_FIELDS:
            value = getattr(record, name, None)
            if name == "reason" and value not in (*FAILURES, "migration_error"):
                continue
            if name == "cause" and value not in (
                *MYSQL_CAUSES.values(),
                *errno.errorcode.values(),
                "mysql_command_failed",
                "file_or_executable_missing",
                "permission_denied",
                "os_error",
                "invalid_value",
                "migration_error",
            ):
                continue
            if name in ("reason", "cause") or type(value) in (int, float):
                fields[name] = value
        if event == "run_failed" and fields.get("reason") in FAILURES:
            fields["message"] += " " + FAILURES[fields["reason"]]
        # Deliberately ignore args, exc_info/exc_text, stack_info and other extras.
        if self.output_format == "json":
            return json.dumps(fields, ensure_ascii=True, allow_nan=False)
        prefix = f"{fields.pop('timestamp')} {fields.pop('severity')} {fields.pop('component')}"
        message = fields.pop("message")
        return f"{prefix} {message} " + " ".join(
            f"{name}={json.dumps(value, ensure_ascii=True, allow_nan=False)}"
            for name, value in fields.items()
        )


class DiagnosticHandler(logging.StreamHandler):
    def handle(self, record):
        try:
            return super().handle(record)
        except Exception:
            # A broken stream/filter must not replace the migration's exit status.
            return False

    def handleError(self, record):
        # logging's default handler error report includes raw records/tracebacks.
        pass


def configure_logging(level="INFO", output_format="text", *, dry_run=False):
    """Called once per CLI invocation; never modifies the application's root logger."""
    _secrets.set(())
    register_environment_secrets()
    _context.set(
        {
            "run_id": uuid.uuid4().hex,
            "started": time.monotonic(),
            "dry_run": dry_run,
            "target": "unconfigured",
            "phase": "configuration",
        }
    )
    logger = logging.getLogger("migration_manager")
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
        handler.close()
    handler = DiagnosticHandler()  # stderr; no files or external services.
    handler.setFormatter(DiagnosticFormatter(output_format))
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
