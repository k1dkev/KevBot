# Repository formatting

Use one formatter per language: **Prettier 3.9.10** for active JS/TS/TSX and
**Ruff 0.17.0 stable** for Python. Versions are pinned in the root npm lockfile
and `requirements-format.txt`; `ruff.toml` also rejects a mismatched Ruff version.
These repository tools do not replace service-local npm dependency installs.
The frontend explicitly keeps its output-file tracing root at `frontend/` so
the new repository lockfile does not change the application's packaging boundary.

## Setup and commands

From the repository root, using Node 22 and Python 3.12+:

```sh
npm ci
python3.12 -m venv .venv-format
source .venv-format/bin/activate
python -m pip install -r requirements-format.txt
npm run format:check
```

With that environment active:

```sh
npm run format          # rewrite JS/TS and Python
npm run format:js       # Prettier only
npm run format:python   # Ruff formatter only
npm run format:check    # read-only checks, nonzero on formatting differences
npm run format:verify   # prove both check modes reject bad input and accept fixes
```

CI installs the same pinned tools, checks without rewriting files, and verifies
the failure/fix contracts using stdin-only fixtures. A second `format:check`
after `format` must pass without additional rewrites. Formatting is a separate
workflow and runs on PRs targeting any branch, including stacked PRs.

## Style and scope

- Prettier uses 120 columns, two spaces, double quotes, semicolons, trailing
  commas and LF endings. The width matches the observed personal VS Code setting.
- Ruff uses 88 columns, four-space indentation, double quotes, LF, stable
  formatting and Python 3.12 syntax. No Python 120-column setting was observed;
  88 preserves the existing Black default rather than copying Prettier's width.
- Active API/frontend sources and tests, helper JavaScript, root commitlint
  config, Python under `tools/`, and future `bot/` code are included. Archived
  `v1/` is explicitly excluded to avoid unrelated legacy churn. Changes there
  need a separate scope decision; they are not silently covered by this check.
- Dependencies, virtual environments, generated output/types, Next output,
  coverage/browser reports, database SQL/data, minified bundles and fake-GCS
  data are excluded. Python package `pyproject.toml` files have no nested Ruff
  settings, so root `ruff.toml` applies consistently.
- This rollout deliberately does **not** run `ruff check`, sort imports, expand
  ESLint rules, or enable Python auto-fixes. Frontend ESLint correctness/framework
  checks continue separately. Ruff format is not a JavaScript formatter.

## Black compatibility decision

The personal VS Code settings used Black with `--preview` and
`--enable-unstable-feature string_processing`. Ruff is not byte-for-byte
equivalent to those unstable settings, and alternating formatters causes churn.
This rollout chooses pinned **stable Ruff** rather than enabling preview or
claiming equivalent string processing.

Compared Black 26.10.1 with those flags against Ruff 0.17.0 on both Python CLI
implementations. The existing rename tool was already acceptable to Ruff;
the migration manager showed concrete differences: Black preview reflowed long
adjacent error-message strings and multiline SQL-call layout, while Ruff retained
those string boundaries and used different parentheses and f-string expression
quotes. These are intentional formatting differences, not new string semantics.
Do not retain Black as the workspace Python formatter after this change.

See [Ruff's formatter](https://docs.astral.sh/ruff/formatter/) and
[documented Black differences](https://docs.astral.sh/ruff/formatter/black/).
Black was used only for the comparison; it is not an additional CI dependency.

## VS Code

Recommended extensions and language-specific formatters are checked in under
`.vscode/`. Prettier uses the root installed package/config; Ruff points to
`.venv-format/bin/ruff`, with Python lint/automatic import fixes disabled.
Install the tools above before formatting. On Windows, override `ruff.path`
locally to `.venv-format/Scripts/ruff.exe` and use the corresponding activation
command. Personal tasks/settings other than the two shared files remain ignored.

The baseline reformat is a separate formatting-only commit from configuration
and CI setup. It intentionally follows the migration execution fix so reviewers
can inspect behavior before reviewing whitespace/layout changes.
