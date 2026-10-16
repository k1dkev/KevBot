FROM python:3.12.6-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    default-mysql-client \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/migration_manager/.venv \
    PATH="/opt/migration_manager/.venv/bin:$PATH"

COPY pyproject.toml uv.lock .python-version ./

RUN uv sync --locked --no-dev --no-cache

COPY migration_manager ./migration_manager

ENTRYPOINT ["python", "/app/migration_manager"]
