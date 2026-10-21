# Security policy

## Dependency audit baseline

CI blocks releases with critical Bun audit findings.

As of 2026-10-21, `bun audit` reports no critical vulnerabilities. One high-severity
advisory remains in an installation-time dependency tree:

- Prisma 6 CLI depends on `deepmerge-ts` 7.x, which is affected by a recursive-object
  stack-exhaustion advisory.

The package is used by the Prisma CLI during installation and migration operations, not
to process untrusted HTTP request data. A global major-version override is intentionally
avoided because Prisma has not declared compatibility with `deepmerge-ts` 8. Remove the
exception when Prisma updates that dependency or after a tested Prisma major upgrade.

## Reporting

Do not open a public issue for a suspected vulnerability. Report it privately to the
repository owner with reproduction steps and the affected version.
