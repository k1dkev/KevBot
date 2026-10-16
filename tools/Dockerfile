FROM python:3.12.6-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv

# Set environment variables to avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive \
    UV_PYTHON_DOWNLOADS=never

RUN apt-get update && \
    apt-get install -y --no-install-recommends default-mysql-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /tools

COPY db/migration_manager/pyproject.toml db/migration_manager/uv.lock db/migration_manager/.python-version ./db/migration_manager/
RUN cd ./db/migration_manager && \
    UV_PROJECT_ENVIRONMENT=/opt/migration_manager/.venv \
    uv sync --locked --no-dev --no-cache

COPY . .

RUN cd ./db/rename_to_id && \
    python -m venv /opt/rename_to_id/.venv && \
    /opt/rename_to_id/.venv/bin/python -m pip install --no-cache-dir -r requirements.txt

FROM base as development

RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

FROM base as production
