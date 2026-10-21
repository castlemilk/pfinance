#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

vercel_args=()
if [[ -n "${VERCEL_SCOPE:-}" ]]; then
  vercel_args+=("--scope=${VERCEL_SCOPE}")
elif [[ -n "${VERCEL_ORG_ID:-}" ]]; then
  vercel_args+=("--scope=${VERCEL_ORG_ID}")
fi
cli() { npx --yes vercel@59.13.1 "$@" "${vercel_args[@]}" --non-interactive; }

# Local Codex checkouts may have the Vercel project link under web/.vercel,
# but this project is configured with rootDirectory=web and must be built from
# the repository root.
if [[ ! -f ".vercel/project.json" && -f "web/.vercel/project.json" ]]; then
  mkdir -p .vercel
  cp web/.vercel/project.json .vercel/project.json
fi
[[ -f .vercel/project.json ]] || {
  echo "An existing Vercel project binding is required; link deliberately before deploying." >&2
  exit 1
}
binding_before="$(node -e '
  const p=require("./.vercel/project.json");
  if(!p.orgId||!p.projectId)process.exit(1);
  console.log(JSON.stringify([p.orgId,p.projectId]));
')"
cli project inspect >/dev/null
trap 'rm -f .vercel/.env.production.local' EXIT

echo "Pulling Vercel production project settings and env..."
cli pull --yes --environment=production
node -e '
  const p=require("./.vercel/project.json");
  if(JSON.stringify([p.orgId,p.projectId])!==process.argv[1]) {
    console.error("Vercel project binding changed during pull");process.exit(1);
  }
' "$binding_before"

expected_sha="$(git rev-parse HEAD)"

echo "Building Vercel output locally..."
VERCEL_TOKEN= cli build --prod
node scripts/validate-vercel-output.mjs

echo "Deploying prebuilt output to Vercel production..."
cli deploy --prebuilt --prod --archive=tgz --yes

echo "Verifying the exact production release and public routes..."
node scripts/verify-production.mjs "$expected_sha"
