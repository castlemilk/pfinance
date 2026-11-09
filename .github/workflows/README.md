# CI/CD

CI and deploys run on [Cuttlefish](https://app.cuttlefish.sh), project `pfinance`, not on
GitHub Actions. This directory holds no workflows on purpose: Cuttlefish also runs any
workflow file here through its GitHub Actions compatibility layer, so a file added here
would run on every pull request.

The workflow definitions live in the Cuttlefish repository (`workflows/pfinance-*.yaml`)
and are published to the control plane when that repository's `main` changes. The
commands they run live here, in `scripts/ci/`, so CI and local runs are the same.

| Workflow | Runs on | What it does |
|----------|---------|--------------|
| `pfinance-ci-backend` | Every pull request into `main`; pushes to `main` that change `backend/**`, `proto/**`, `scripts/ci/backend.sh` or `scripts/ci/go-proto.sh` | Pinned buf + plugins generate `backend/gen`, then gofmt, `go vet`, `go test -race -short` (`scripts/ci/backend.sh`). |
| `pfinance-ci-web` | Every pull request into `main`; pushes to `main` that change `web/**` or `scripts/**` | `npm ci`, then type-check, lint, Jest and the release contract tests in parallel, then `next build` (`scripts/ci/web.sh`). |
| `pfinance-deploy` | `pfinance-ci-web` passing on a push to `main` | `scripts/deploy-vercel-prebuilt.sh`: `vercel pull` and `vercel build --prod` (install is `npm ci`), output checks, prebuilt upload to Vercel production, then `scripts/verify-production.mjs` checks pfinance.dev serves the commit. |
| `pfinance-backend-deploy` | `pfinance-ci-backend` passing on a push to `main` | ko build in `golang:1.25`, push to `gcr.io/pfinance-app-1748773335/pfinance-backend` (tags `latest` and the commit SHA), `gcloud run deploy pfinance-backend` keeping the service's env vars and secrets, then a `/health` check. |

- Each pull request gets two checks, `Cuttlefish / pfinance-ci-backend` and
  `Cuttlefish / pfinance-ci-web`. A newer push to the same pull request or to `main`
  cancels the older run.
- Deploys wait for CI. Each deploy starts only after its area's CI has passed for that
  commit on `main`, and the CI workflow's push paths decide whether the area deploys at
  all: a web-only commit never redeploys the backend. If CI fails on `main`, nothing
  deploys; re-running the failed check to green starts the deploy then.
- Deploys are "last push wins": a newer deploy cancels an older unfinished one of the same
  workflow.
- A push to `main` that changes neither area (docs only, say) runs no CI and no deploy.
- There are no hosted previews.

## Running CI locally

```bash
make ci-backend    # scripts/ci/backend.sh
make ci-frontend   # scripts/ci/web.sh
```

## Manual deploys

```bash
cd web && npm run deploy   # same release script as pfinance-deploy
make deploy-backend        # Cloud Run
make deploy-indexes        # Firestore indexes (not part of CI)
```

To rerun a deploy on Cuttlefish: `cuttle run start --project pfinance
--workflow-version <published version id>`, or re-run the check on the commit in GitHub.
