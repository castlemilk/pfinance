#!/usr/bin/env bash
# Backend CI: generate the Go protobuf code, then gofmt, vet and test.
# Cuttlefish pfinance-ci-backend runs this; `make ci-backend` runs it locally.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

"$root/scripts/ci/go-proto.sh"

cd "$root/backend"
unformatted="$(gofmt -l . | grep -v '^gen/' || true)"
if [[ -n "$unformatted" ]]; then
  echo "gofmt needed (run gofmt -w):" >&2
  echo "$unformatted" >&2
  exit 1
fi
go vet ./...
go test -race -short ./...
