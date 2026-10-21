# Production-first release verification

Automatic hosted previews are disabled. Pull requests still run the existing native CI build/lint/type/test gates and the dependency-free deployment contract suite. The legacy preview workflow's frontend, backend and cleanup jobs are explicitly disabled. Existing preview resources are not deleted by this change; inventory and review their ownership before cleanup. Git-based Vercel deployments were already disabled in `web/vercel.json`.

## Production path

1. Build the reviewed main commit on the existing runner. `npm run build` writes `web/public/release.json` with the actual full checkout SHA before compiling. It contains no environment values.
2. Use the pinned Vercel CLI 59.13.1 and compressed prebuilt upload. The local production helper requires an existing stable project binding and rejects rebinding during pull. Credentials remain in environment variables, not command arguments, and the pulled production environment cache is removed on exit.
3. Validate Build Output API output before upload: architecture, traced symlinks, accidental environment files, unresolved `[SENSITIVE]` placeholders. This is not a complete secret scanner or libc compatibility test.
4. After successful production deployment, run `node scripts/verify-production.mjs <expected-full-commit-sha>`. It verifies the public release identity, homepage and super calculator HTML. It uses public read-only GETs, refuses redirects, has bounded timeouts and retries for propagation, and stops immediately on authentication/protection errors. It does not submit forms, invoke paid AI or payment endpoints, or modify user data.
5. A failed verification exits nonzero so the deployment check is red, even if the upload succeeded. Preserve the known-good previous deployment and use the existing reviewed rollback process; do not automatically roll back database migrations.

The main Cuttlefish deployment definition must invoke the repository helper or an equivalent blocking verifier after promotion. Source changes in this repository alone do not prove the installed workflow has adopted that contract. Keep rollout incomplete until exact-head main CI and the new version's live verification pass.

These HTTP checks are a baseline, not full browser interaction, authentication or backend qualification. Existing isolated component/E2E tests remain necessary before merge. Telesis can supply independent HTTP/Playwright checks and failure reporting, but no new monitor, ping key, credentials or notification destination has been provisioned here. Wire only a verified existing integration, or obtain the required approval for new persistent access.

## Cost and safety boundaries

Hosted previews may add usage charges; removing previews is not a claim of zero CI or hosting costs. Local prebuilt builds avoid Vercel-hosted compilation, not production serving costs. Inspect account usage to quantify savings. Do not delete old deployments, databases, container images or caches as part of this change.

Run `node --test scripts/*.node-tests.mjs` and `bash -n scripts/deploy-vercel-prebuilt.sh`. Serving tests and native CI must also pass on the final commit. References: https://vercel.com/docs/cli/deploy, https://vercel.com/docs/pricing, https://cloud.google.com/run/pricing.
