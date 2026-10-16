# Release automation documentation

Current contributor and release behavior is documented in
[CONTRIBUTING.md](../CONTRIBUTING.md#releases). The
[repository settings snapshot](REPOSITORY_SETTINGS.md) records the read-only
GitHub observations used to reconcile that guide.

The earlier implementation summary mixed historical setup, unchecked proposals
and incorrect active claims about squash-only merges, disabled GitHub Releases
and automatic deployment. Its full text remains available at the
[pre-reconciliation revision](https://github.com/k1dkev/KevBot/blob/41a221b9cf5515da2b71bd226cd1532704e137f5/.github/RELEASE_PROCESS_IMPLEMENTATION.md).
Use it as history, not executable setup or an accepted settings decision.

Source of truth: [workflow](workflows/release-please.yml),
[configuration](release-please-config.json) and
[manifest](.release-please-manifest.json). Publication/deletion policy and
protection changes require a separate owner decision under
[#145](https://github.com/k1dkev/KevBot/issues/145). Generated changelogs remain
untouched; this page does not authorize releases or deployment.
