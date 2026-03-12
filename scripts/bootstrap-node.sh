#!/usr/bin/env bash
set -euo pipefail

# Downloads and installs Node.js into .tools/node (inside this repo).
# This avoids global installs and keeps everything project-local.

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/.tools" "$ROOT/.downloads"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

PLATFORM="darwin"

echo "Detecting latest Node 20.x for $PLATFORM-$NODE_ARCH..."
NODE_FILE="$(curl -fsSL "https://nodejs.org/dist/latest-v20.x/" | grep -o "node-v20[^\\\" ]*-${PLATFORM}-${NODE_ARCH}\\.tar\\.gz" | head -n1)"
if [[ -z "${NODE_FILE:-}" ]]; then
  echo "Could not determine Node tarball name from nodejs.org." >&2
  exit 1
fi

NODE_URL="https://nodejs.org/dist/latest-v20.x/$NODE_FILE"
TGZ="$ROOT/.downloads/$NODE_FILE"

echo "Downloading: $NODE_URL"
curl -fSL "$NODE_URL" -o "$TGZ"

echo "Installing into: $ROOT/.tools/node"
rm -rf "$ROOT/.tools/node"

EXTRACTED_DIR="$(tar -tzf "$TGZ" | head -n1 | cut -d/ -f1)"
tar -xzf "$TGZ" -C "$ROOT/.tools"
mv "$ROOT/.tools/$EXTRACTED_DIR" "$ROOT/.tools/node"

"$ROOT/.tools/node/bin/node" -v > "$ROOT/.tools/node.version"
echo "Installed Node: $(cat "$ROOT/.tools/node.version")"

echo "If macOS blocks the Node binary, run (inside repo):"
echo "  xattr -dr com.apple.quarantine .tools/node"

