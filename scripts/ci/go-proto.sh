#!/usr/bin/env bash
# Generates the Go protobuf + Connect code into backend/gen (not committed).
#
# One place for the generator versions: Cuttlefish CI, the backend deploy and
# local runs all call this, so they produce the same code. web/src/gen is
# committed, so only the Go template runs here (`make proto` regenerates both).
# Tools go into a private cache directory, never onto the caller's PATH.
set -euo pipefail

BUF_VERSION=1.75.0
PROTOC_GEN_GO_VERSION=v1.36.12        # matches the header of the checked-in *.pb.go
PROTOC_GEN_CONNECT_GO_VERSION=v1.19.1 # matches connectrpc.com/connect in backend/go.mod

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tools="${PFINANCE_TOOLS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/pfinance-tools}"
mkdir -p "$tools"

buf="$tools/buf-$BUF_VERSION"
if [[ ! -x "$buf" ]]; then
  curl -fsSL --retry 3 -o "$buf.tmp" \
    "https://github.com/bufbuild/buf/releases/download/v$BUF_VERSION/buf-$(uname -s)-$(uname -m)"
  chmod +x "$buf.tmp" && mv "$buf.tmp" "$buf"
fi

export GOBIN="$tools/go-plugins"
go install "google.golang.org/protobuf/cmd/protoc-gen-go@$PROTOC_GEN_GO_VERSION"
go install "connectrpc.com/connect/cmd/protoc-gen-connect-go@$PROTOC_GEN_CONNECT_GO_VERSION"

cd "$root/proto"
PATH="$tools/go-plugins:$PATH" "$buf" generate --template buf.gen.go.yaml
