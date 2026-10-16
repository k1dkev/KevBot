# KevBot documentation index

Use each document for its stated purpose. This index reconciles core navigation
against `main` at `41a221b` (2026-10-15); it is a bounded part of
[#145](https://github.com/k1dkev/KevBot/issues/145), not completion of that issue.

## Scope, status and contracts

| Need | Canonical home | How to read it |
| --- | --- | --- |
| Product outcomes and first-release scope | [PRD](../PRD.md) | Intended outcomes; distinguishes implemented foundation from remaining work |
| Service boundaries and source capabilities | [Architecture](../ARCHITECTURE.md) | Current source snapshot, with planned bot integration labeled |
| Delivery scope, order and gates | [Roadmap](../ROADMAP.md) | Release plan, not a live completion checklist; older source observations are dated |
| Task status and evidence | [GitHub issues/PRs](https://github.com/k1dkev/KevBot/issues) | Live implementation/review status |
| Bot compatibility | [Inventory](../specs/bot-parity.md) and [decisions](../specs/bot-parity-decisions.md) | Owner accepted D1–D11, the permission matrix and playback/reporting semantics in [#141](https://github.com/k1dkev/KevBot/issues/141#issuecomment-6207636658); [#169](https://github.com/k1dkev/KevBot/pull/169) records publication. Design acceptance is not runtime acceptance |
| Decision rationale | [DECISIONS](../DECISIONS.md) and accepted specs | Record approved tradeoffs, not unchecked alternatives; #169 carries the parity acceptance update |
| Search contract | [Search spec](../specs/search.md) | Existing prose needs reconciliation with [route](../api/src/routes/searchRoutes.ts), [schema](../api/src/schemas/searchSchemas.ts), [service](../api/src/services/searchService.ts) and [tests](../api/tests/integration/search.test.ts); do not infer access policy from old prose |
| API/auth contract | [Route/schema source](../api/src), [OpenAPI](../api/src/docs/openapi.yml), [security overview](../api/docs/SECURITY_MODEL.md) and [long form](../api/docs/SECURITY_MODEL_LONG.md) | OpenAPI/security prose still has known drift. #157 owns actor/policy public API docs; remaining auth/search/security reconciliation stays under #145 |

The accepted actor/permission and duration/name changes in
[#157](https://github.com/k1dkev/KevBot/issues/157) are not implemented merely by
appearing in these documents. API pools/activity remain
[#158](https://github.com/k1dkev/KevBot/issues/158), the new bot remains
[#159](https://github.com/k1dkev/KevBot/issues/159),
[#160](https://github.com/k1dkev/KevBot/issues/160),
[#161](https://github.com/k1dkev/KevBot/issues/161) and
[#162](https://github.com/k1dkev/KevBot/issues/162), and full verification is
[#163](https://github.com/k1dkev/KevBot/issues/163). Follow the individual issues
for status and dependencies; this index does not introduce new gates.

## Executable instructions

| Task | Instructions / evidence |
| --- | --- |
| Local services and frontend | [Root setup](../README.md#local-development); [Compose includes](../docker-compose.dev.yml); frontend runs separately |
| API build, integration and production-image tests | [API runbook](../api/README.md) |
| Frontend config, lint/unit/build/browser checks | [Frontend runbook](../frontend/README.md#checks-and-browser-smoke-tests) and [config](../frontend/src/lib/config.ts) |
| Schema migration and MySQL client requirements | [Migration manager](../tools/db/migration_manager/README.md); [SQL migrations](../db/migration) |
| Separate legacy audio-object rename | [Rename utility](../tools/db/rename_to_id/README.md); not an automatic schema-migration step |
| Repository formatting | [Formatting guide](FORMATTING.md) |
| Review/merge/release workflow | [Contributing](../CONTRIBUTING.md), [release sources](../.github/RELEASE_PROCESS_IMPLEMENTATION.md), [observed settings](../.github/REPOSITORY_SETTINGS.md) |
| Release history | Generated component changelogs; [human release notes](../RELEASE_NOTES.md). Neither is a task tracker |

Environment examples and full recovery/fixture runbooks are not repaired by this
index. Verify configuration against the [API validator](../api/src/config/config.ts)
and selected Compose files; the tracked API env example is incomplete. Use the
checked-out migration-manager runbook for dependency setup rather than assuming
an unmerged tooling change has landed.

## History and unfinished reconciliation

[PLANNING_AUDIT.md](PLANNING_AUDIT.md) preserves the dated source inventory,
legacy issue mapping and Obsidian reconciliation. [TODOS.md](../TODOS.md),
[scratch design](../scratch-work/DESIGN.md) and [v1 docs](../v1/README.md) remain
historical requirements/evidence, not competing current contracts or release
checklists. Personal notes are not rewritten. Promote surviving tasks to linked
GitHub work and accepted choices to specs/DECISIONS, retaining source links.

The previous root docs and release setup proposals remain available at the
immutable baseline revision:

- [Prior PRD](https://github.com/k1dkev/KevBot/blob/41a221b9cf5515da2b71bd226cd1532704e137f5/PRD.md)
- [Prior architecture](https://github.com/k1dkev/KevBot/blob/41a221b9cf5515da2b71bd226cd1532704e137f5/ARCHITECTURE.md)
- [Prior README](https://github.com/k1dkev/KevBot/blob/41a221b9cf5515da2b71bd226cd1532704e137f5/README.md)
- [Prior contributor guide, including historical reseeding steps](https://github.com/k1dkev/KevBot/blob/41a221b9cf5515da2b71bd226cd1532704e137f5/CONTRIBUTING.md)
- [Prior settings proposal](https://github.com/k1dkev/KevBot/blob/41a221b9cf5515da2b71bd226cd1532704e137f5/.github/REPOSITORY_SETTINGS.md)
- [Prior release implementation summary](https://github.com/k1dkev/KevBot/blob/41a221b9cf5515da2b71bd226cd1532704e137f5/.github/RELEASE_PROCESS_IMPLEMENTATION.md)

Do not execute old sensitive-data/reset recipes as normal setup. Full environment
examples, auth/security/OpenAPI/search alignment, DB setup/restore documentation
and a complete surviving-requirements disposition remain follow-ups under #145.
The audit maps historical [#74](https://github.com/k1dkev/KevBot/issues/74),
[#68](https://github.com/k1dkev/KevBot/issues/68),
[#56](https://github.com/k1dkev/KevBot/issues/56) and
[#54](https://github.com/k1dkev/KevBot/issues/54); this pass does not close them.

Release/protection prose now describes observed configuration. Choosing changes
to those settings or release-retention policy still requires an owner decision.
Public-read/anonymous-play/deleted-content policy is also unresolved; linking
the current routes does not settle it. This work **Addresses #145**, and does
not claim all of its acceptance criteria are complete.
