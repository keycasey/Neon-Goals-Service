# 2026-03-22 Session Summary

## Scope

This session added a temporary Finicity probe path on the service side and used it to validate how Mastercard Data Connect behaves for account linking.

## Backend Changes

- Added a Finicity module with:
  - service logic for partner authentication, testing customer creation, and Connect URL generation
  - authenticated probe endpoints for status and Connect URL creation
  - helper utilities and tests for probe-specific request shaping
- Registered the Finicity module in the application.
- Added README notes for the required Finicity environment variables.

## Live Findings

- Partner authentication succeeds with the corrected Finicity app key.
- Testing customer creation succeeds.
- Connect URL generation succeeds.
- The hosted Connect flow opens into Finicity's own account-link flow and proceeds to an institution search screen.
- Attempting to preselect an institution by sending `institutionSettings.institutionId` to `/connect/v2/generate` fails with a `400` response stating that the field is not allowed.

## Product Conclusion

The current Finicity Connect path can be used as an alternate linking provider, but it does not support the tested direct-to-institution preselection approach. For now, provider selection should happen in the Neon Goals UI before launching Plaid or Finicity, while each provider continues to own its own institution search flow.

## Verification

- `bun test src/modules/finicity/finicity.helpers.test.ts`
- `bun run build`
- Live Finicity API calls against `api.finicity.com`

## Notes

- Service builds regenerated `prompts/generated/nest-prompts.json` during verification.
- Credentials supplied during the session were treated as runtime-only and were not written into tracked files.
