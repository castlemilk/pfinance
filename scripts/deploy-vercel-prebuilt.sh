#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel CLI is required. Install it with: npm i -g vercel@latest" >&2
  exit 1
fi

vercel_args=()
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  vercel_args+=("--token=${VERCEL_TOKEN}")
fi
if [[ -n "${VERCEL_SCOPE:-}" ]]; then
  vercel_args+=("--scope=${VERCEL_SCOPE}")
elif [[ -n "${VERCEL_ORG_ID:-}" ]]; then
  vercel_args+=("--scope=${VERCEL_ORG_ID}")
fi

# Local Codex checkouts may have the Vercel project link under web/.vercel,
# but this project is configured with rootDirectory=web and must be built from
# the repository root.
if [[ ! -f ".vercel/project.json" && -f "web/.vercel/project.json" ]]; then
  mkdir -p .vercel
  cp web/.vercel/project.json .vercel/project.json
fi

echo "Pulling Vercel production project settings and env..."
vercel pull --yes --environment=production "${vercel_args[@]}"

echo "Building Vercel output locally..."
vercel build --prod "${vercel_args[@]}"

echo "Deploying prebuilt output to Vercel production..."
vercel deploy --prebuilt --prod --archive=tgz --yes "${vercel_args[@]}"
