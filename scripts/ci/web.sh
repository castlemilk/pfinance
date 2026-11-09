#!/usr/bin/env bash
# Frontend CI: install exactly the lockfile, run the independent checks in
# parallel, then build. Cuttlefish pfinance-ci-web runs this; `make ci-frontend`
# runs it locally. The checks run together because each is small and mostly
# single-threaded; the build runs after them so the two biggest memory users
# (tsc and next build) never overlap.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root/web"

npm ci --no-audit --no-fund

logs="$(mktemp -d)"
trap 'rm -rf "$logs"' EXIT
names=() pids=()
check() {
  local name="$1"; shift
  ("$@") >"$logs/$name.log" 2>&1 &
  names+=("$name"); pids+=("$!")
}
check type-check npm run type-check
check lint       npm run lint
check unit-tests npx jest --ci --maxWorkers=2
check contracts  node --test ../scripts/*.node-tests.mjs scripts/*.node-tests.mjs

failed=()
for i in "${!pids[@]}"; do
  if wait "${pids[$i]}"; then
    echo "--- ${names[$i]}: passed"
    tail -n 5 "$logs/${names[$i]}.log"
  else
    failed+=("${names[$i]}")
  fi
done
for name in ${failed[@]+"${failed[@]}"}; do
  echo "--- $name: FAILED"
  cat "$logs/$name.log"
done
if ((${#failed[@]})); then
  echo "Failed: ${failed[*]}" >&2
  exit 1
fi

npm run build
