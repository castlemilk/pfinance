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
# Never deploy whichever project happens to be linked in a shared checkout.
# CI can supply the standard Vercel IDs; local deploys default to PFinance.
expected_org_id="${VERCEL_ORG_ID:-team_xE5DMN3hIo8aPqyHNkBybg8r}"
expected_project_id="${VERCEL_PROJECT_ID:-prj_TakUttZsa4fdddSwfVp08YFfyAdF}"
expected_binding="$(node -e '
  console.log(JSON.stringify([process.argv[1],process.argv[2]]));
' "$expected_org_id" "$expected_project_id")"
[[ "$binding_before" == "$expected_binding" ]] || {
  echo "Vercel project binding must be document-analyser/pfinance; link deliberately before deploying." >&2
  exit 1
}
cli project inspect >/dev/null
web_env_staged=0
cleanup() {
  rm -f .vercel/.env.production.local
  if [[ "$web_env_staged" == 1 ]]; then
    rm -f web/.env.production.local
  fi
}
trap cleanup EXIT

echo "Pulling Vercel production project settings and env..."
cli pull --yes --environment=production
node -e '
  const fs=require("fs");
  const filename="./.vercel/project.json";
  const p=JSON.parse(fs.readFileSync(filename,"utf8"));
  if(JSON.stringify([p.orgId,p.projectId])!==process.argv[1]) {
    console.error("Vercel project binding changed during pull");process.exit(1);
  }
  if(p.settings?.rootDirectory && p.settings.rootDirectory!=="web") {
    console.error("Vercel root directory must be web");process.exit(1);
  }
  p.settings={...p.settings,rootDirectory:"web"};
  fs.writeFileSync(filename,JSON.stringify(p,null,2)+"\n");
' "$binding_before"

# Vercel pulls env at the repository root, while Next.js loads it from web/.
[[ ! -e web/.env.production.local ]] || {
  echo "Refusing to overwrite an existing web/.env.production.local" >&2
  exit 1
}
web_env_staged=1
cp .vercel/.env.production.local web/.env.production.local
chmod 600 web/.env.production.local

expected_sha="$(git rev-parse HEAD)"

echo "Building Vercel output locally..."
VERCEL_TOKEN= cli build --prod
node -e '
  const fs=require("fs");
  const path=require("path");
  const names=[
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];
  const missing=new Set();
  function walk(directory) {
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      const filename=path.join(directory,entry.name);
      if(entry.isDirectory()) walk(filename);
      else if(entry.isFile()&&filename.endsWith(".js")) {
        const source=fs.readFileSync(filename,"utf8");
        for(const name of names) if(source.includes(name)) missing.add(name);
      }
    }
  }
  walk(".vercel/output/static");
  if(missing.size) {
    console.error(`Public Firebase settings were not inlined: ${[...missing].join(", ")}`);
    process.exit(1);
  }
'
node scripts/validate-vercel-output.mjs

echo "Deploying prebuilt output to Vercel production..."
deploy_args=(--prebuilt --prod --archive=tgz --yes)
if [[ "${PFINANCE_SKIP_DOMAIN:-0}" == 1 ]]; then
  deploy_args+=(--skip-domain)
fi
cli deploy "${deploy_args[@]}"

if [[ "${PFINANCE_SKIP_DOMAIN:-0}" == 1 ]]; then
  echo "Candidate deployment complete; automatic domain promotion was skipped."
else
  echo "Verifying the exact production release and public routes..."
  node scripts/verify-production.mjs "$expected_sha"
fi
