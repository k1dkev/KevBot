# KevBot

A Discord bot and music management platform with a modern web interface, RESTful API, and automated audio processing capabilities.

## Current Planning

Start with the [consolidated v2 roadmap](ROADMAP.md) for release scope, milestone
order, and the proposed GitHub issue/design workflow. The first usable v2 release
requires the legacy bot's full command set; its [parity specification](specs/bot-parity.md)
is currently a draft.

The [planning audit](docs/PLANNING_AUDIT.md) maps older GitHub issues, Obsidian
notes, and conflicting documentation to current implementation. Some setup,
architecture, and release instructions below still need the reconciliation
identified there. Use GitHub issues for task status once the backlog is triaged.

## Overview

KevBot is a monorepo containing multiple components that work together:

- **API**: Express + TypeScript backend with JWT authentication, file uploads, and streaming
- **Frontend**: Next.js 15 application with modern UI
- **Database**: MySQL with versioned migrations
- **Tools**: Helper scripts and development utilities
- **GCloud**: Local Google Cloud Storage emulator

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js >= 20.17.0 (for local development without Docker)

### Starting the Full Stack

```sh
docker compose --env-file dev.env -f docker-compose.dev.yml up --build
```

### Starting Individual Services

```sh
# API
cd api && npm run dev

# Frontend
cd frontend && npm run dev

# Database
cd db && docker compose up

# Tools
cd tools && docker compose -f docker-compose.dev.yml up
```

### Stopping Services

```sh
docker compose -f docker-compose.dev.yml down

# Full reset (removes volumes)
docker compose -f docker-compose.dev.yml down -v
```

## Project Structure

```
KevBot/
├── .github/           # CI/CD workflows and release automation
├── api/               # Express + TypeScript backend
│   ├── src/           # Source code
│   ├── tests/         # Integration and unit tests
│   └── docs/          # API documentation
├── db/                # Database migrations (semver)
│   └── migration/     # SQL migration scripts
├── frontend/          # Next.js 15 App Router application
│   └── src/
│       ├── app/       # Next.js pages
│       ├── components/# React components
│       └── lib/       # Utilities and types
├── gcloud/            # Local GCS emulator
│   └── data/          # Storage fixtures
├── tools/             # Development tools and scripts
│   └── db/            # Database utilities
└── v1/                # Legacy Discord bot (archived)
```

## Versioning & Releases

### Component Versions

Each component is versioned independently using [Semantic Versioning](https://semver.org/):

- `api@2.0.0` - Backend API
- `db@1.0.0` - Database migrations
- `frontend@0.1.0` - Frontend application
- `tools@1.0.0` - Development tools
- `gcloud@1.0.0` - GCS emulator

### Release Process

We use [release-please](https://github.com/googleapis/release-please) for semi-automated releases:

1. **Development**: Make changes in feature branches, commit freely (WIP commits are fine!)
2. **Pull Request**: Open PR with a [conventional commit](https://www.conventionalcommits.org/) title
3. **Merge**: Squash merge to `main` (all commits become one)
4. **Automation**: release-please creates/updates a Release PR with changelogs
5. **Release**: Merge the Release PR to publish new versions and create tags

### Documentation

- **[RELEASE_NOTES.md](RELEASE_NOTES.md)**: User-facing highlights for major releases
- **Component CHANGELOGs**: Technical details in each component's `CHANGELOG.md`
  - [API Changelog](api/CHANGELOG.md)
  - [Database Changelog](db/CHANGELOG.md)
  - [Frontend Changelog](frontend/CHANGELOG.md)

## Development

### Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on:

- Development workflow and branch strategy
- PR title requirements (conventional commits)
- Testing guidelines
- Release process

### Key Points

- **PR Titles Matter**: Use conventional commit format (enforced by CI)
- **WIP Commits OK**: Branch commits don't need special formatting
- **Squash Merge Only**: All PRs are squash merged to keep history clean
- **Automated Releases**: release-please handles changelog generation

### Example PR Titles

```
feat(api): add track streaming endpoint
fix(frontend): resolve player controls issue
chore(db): update migration scripts
docs(project): improve setup instructions
feat(api)!: breaking change to auth system
```

### Environment Configuration

The project uses multiple environment files:

- `.env` - General configuration
- `dev.env` - Development-specific settings
- `local_dev.env` - Local overrides (not committed)

Keep these aligned and document any new variables.

## Testing

### API Tests

```sh
cd api
npm test
```

Uses Jest + Testcontainers to spin up isolated databases for testing.

### Frontend Linting

```sh
cd frontend
npm run lint
```

### CI/CD

All tests and linting run automatically on pull requests via GitHub Actions.

## Containers & Tools

### Tools Container

The development docker compose file mounts the root of KevBot to `src-dev` for live development. There's also a `src` directory with a copy of `/tools/` and `db/migration/`.

### Docker Compose Files

- `docker-compose.dev.yml` - Full development stack
- `api/docker-compose.dev.yml` - API service only
- `db/docker-compose.yml` - Database only
- `frontend/docker-compose.yml` - Frontend only
- `tools/docker-compose.dev.yml` - Tools container

## Architecture

For detailed architecture information, see [ARCHITECTURE.md](ARCHITECTURE.md).

## License

ISC

## Contact

GitHub: [@Kunedawg](https://github.com/Kunedawg)
