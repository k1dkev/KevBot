# Frontend build-tool advisory review

Reviewed 2026-10-16 against `frontend/package-lock.json` with `npm audit`.
This is a development/build dependency review; it does not change the Next.js 15
or Tailwind CSS 3 baselines.

## Patched selector-parser advisory

[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)
affects `postcss-selector-parser` versions below 7.1.6. The frontend lockfile
previously resolved 6.1.4 through Tailwind CSS and `postcss-nested`. The advisory
identifies 7.1.6 as the fix and reports byte-identical parsing on its
differential selector corpus. Since Tailwind CSS 3 still requests the 6.x range,
`frontend/package.json` narrowly overrides the parser to `^7.1.6` rather than
forcing a Tailwind major upgrade.

Validation against the existing app found no generated CSS change: the sole
Next.js CSS artifact had SHA-256
`26f0fdbbfdafe2afd47e2de09a94eb4ed101c76eeb93f550e6cbf8e751629dab` both before
and after the override. The production build and all six Playwright browser tests
also passed. Recheck this override when Tailwind or its PostCSS plugins change.

## Unresolved `braces` advisory

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
covers `braces` through 3.0.3; GitHub currently lists no patched version. The
lockfile's affected paths are development/build tooling (including Tailwind,
Next's ESLint config, `fast-glob`, `micromatch`, and `chokidar`), not shipped
frontend dependencies. Accordingly, `npm audit --omit=dev` reports zero
vulnerabilities, while the full audit continues to report high-severity
development-tool package entries through this advisory.

Do not pin the already-installed 3.0.3 as a purported fix, suppress the audit,
or accept npm's suggested downgrade of `eslint-config-next` to 14.2.35: that
would break the Next 15 baseline and does not patch `braces`. Keep the residual
visible and revisit it when an upstream fix is available. Any Tailwind 4 or
broader tooling migration needs its own scoped compatibility and visual review.

## Verification

- `npm audit --omit=dev`: 0 vulnerabilities; full audit: 8 high package entries
  and no remaining moderate entries after the selector-parser override.
- `npm run lint`: passed with the existing `login-button.tsx` `<img>` warning.
- `npm run test:unit`: 3 passed.
- `npm run build` with the documented synthetic frontend variables: passed.
- `npm run test:e2e`: 6 passed.
