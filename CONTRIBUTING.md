# Contributing to KevBot

Use the [root setup and verification instructions](README.md#local-development)
and [documentation index](docs/README.md). The [roadmap](ROADMAP.md) owns release
scope/order; GitHub owns task status. Give each change a bounded issue and link
implementation, tests and any accepted contract it depends on.

## Changes and review

Work on a focused branch from the intended base. Preserve existing changes and
keep PRs reviewable. Include the problem/result, linked issue, relevant automated
and manual verification, and UI media for visual changes. Call out migrations
and environment changes. Use `Addresses #145` for a partial documentation pass;
use a closing keyword only when the issue's acceptance criteria are satisfied.

Follow [AGENTS.md](AGENTS.md) and the
[formatting guide](docs/FORMATTING.md). Use Conventional Commits for reviewable
commits and PR titles:

```text
feat(api): add a capability
fix(frontend): repair playback behavior
docs: reconcile core documentation
```

[commitlint.config.js](commitlint.config.js) permits optional scopes; when used,
they must be `api`, `frontend`, `db`, `gcloud`, `tools` or `bot`.
Its header limit is 72 characters. PR-title lint runs on PR events, and commit
lint runs on pushes to `main`; see the
[title workflow](.github/workflows/lint-pr-title.yml) and
[commit workflow](.github/workflows/lint-commit.yml).

Repository settings currently allow squash, rebase and merge commits. Do not
assume squash-only enforcement or that branch commits will always be discarded.
For squash merges, verify the resulting commit title; for rebase merges, ensure
the retained commits follow the convention. The
[settings snapshot](.github/REPOSITORY_SETTINGS.md) distinguishes observed
protection from old proposals. Run relevant checks even where they are not
required by branch protection; changes to those settings need an owner decision.

## Tests and operational boundaries

Use the component runbooks linked from the
[root verification section](README.md#verification). API tests need Docker,
the migration image and disposable MySQL. Frontend unit tests and synthetic
Playwright tests cover different behavior from a live OAuth/storage/bot run.

Database migrations remain forward-only `<version>__slug.sql` files. Use the
[migration-manager runbook](tools/db/migration_manager/README.md) for its current
CLI/configuration. Starting Compose does not apply migrations. Historical
sensitive-fixture reseeding instructions are preserved through the
[history index](docs/README.md#history-and-unfinished-reconciliation); they are
not a verified backup/restore procedure. Do not use production data or destructive
resets as ordinary test setup.

## Releases

The [release-please workflow](.github/workflows/release-please.yml) runs on pushes
to `main`, using the [configuration](.github/release-please-config.json) and
[manifest](.github/.release-please-manifest.json). It manages the root app, API,
database, frontend, tools and GCS components.

The automation prepares release PRs containing version/changelog updates. After
an eligible release PR is merged, the workflow can create tags and GitHub
Releases: all six configured packages have `skip-github-release: false`.
The root app uses beta prerelease versioning and no component tag prefix;
components include their names in tags. See the
[upstream manifest behavior](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)
and inspect the actual release PR/run before declaring publication successful.

Generated `CHANGELOG.md` files belong to release-please; do not edit them by
hand. [RELEASE_NOTES.md](RELEASE_NOTES.md) provides human-written highlights.
The release workflow does not publish npm/container artifacts or deploy services.
[Service deployment](.github/workflows/service-deploy.yml) and
[hosted database migration](.github/workflows/database-migrate.yml) are separate
manual workflows.

The older claims that releases are always manual, tags imply deployment, or
all merges must be squashed are superseded. Any future change to release
publication/deletion, merge methods or protections belongs to an explicit owner
decision under [#145](https://github.com/k1dkev/KevBot/issues/145), not a prose-only
assumption or an automatic settings change.
