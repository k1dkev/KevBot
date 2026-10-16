# Repository settings: observed state

Read-only snapshot for [k1dkev/KevBot](https://github.com/k1dkev/KevBot) on
2026-10-15 (America/Chicago). These are observations, not instructions to change
protections or grant permissions. GitHub is authoritative for current settings.

| Setting | Returned value |
| --- | --- |
| Default branch | `main` |
| Allowed merge methods | Merge commits, squash and rebase all enabled |
| Automatic head-branch deletion / auto-merge | Both disabled |
| Squash title / message defaults | `COMMIT_OR_PR_TITLE` / `COMMIT_MESSAGES` |
| Classic main protection | One approving review; stale-review dismissal and last-push approval disabled |
| Admin enforcement / required linear history | Both disabled |
| Required status checks | No required-status-check configuration returned by the main-protection endpoint |
| Main rulesets | Branch-rules endpoint returned an empty list |
| Force pushes / branch deletion | Force pushes allowed; deletions disallowed |
| Actions defaults | Workflow permission `write`; approving PR reviews permitted |

The presence of lint/test workflows does not make their jobs required checks.
The classic protection response also does not establish that every actor is
subject to an approval gate: admin enforcement is disabled. No protection,
security setting, token, secret or environment was changed during this review.

## Read-only evidence and refresh

These commands retrieved the settings above; they make no repository changes:

```sh
gh api repos/k1dkev/KevBot
gh api repos/k1dkev/KevBot/branches/main/protection
gh api repos/k1dkev/KevBot/rules/branches/main
gh api repos/k1dkev/KevBot/actions/permissions/workflow
```

Use the endpoint documentation for
[repository settings](https://docs.github.com/en/rest/repos/repos#get-a-repository)
and [branch protection](https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection).
Recheck before relying on this snapshot. The earlier squash-only/checks-required
configuration document was a proposal that did not match the observed settings;
its full text remains in the
[history index](../docs/README.md#history-and-unfinished-reconciliation).

## Workflow and unresolved choices

[CONTRIBUTING.md](../CONTRIBUTING.md) describes the current contributor/release
workflow. [Release configuration](release-please-config.json) enables GitHub
Releases; the existence of a release does not establish production deployment.

Whether to restrict merge methods, require specific checks, enforce reviews for
admins, disallow force pushes, change Actions defaults or delete published
releases requires an explicit owner decision. Record the choice under
[#145](https://github.com/k1dkev/KevBot/issues/145) or a linked decision before a
separate authorized settings change. This documentation reconciliation makes no
such decision.
