#!/usr/bin/env bash
# fetch-engine.sh — obtain a user-configured USI engine binary and NNUE eval file
# for the cloud analysis worker. Nothing is committed to the repo; CI downloads
# user-provided assets at runtime and caches them via actions/cache.
#
# Configuration (override via env):
#   ENGINE_DIR                 output dir (default: ./engine)
#   USI_ENGINE_BINARY_URL      prebuilt linux-x64 USI engine binary URL (required)
#   USI_ENGINE_BINARY_SHA256   optional expected sha256 of engine binary
#   USI_EVAL_URL               optional eval file download URL
#   USI_EVAL_SHA256            optional expected sha256 of eval file
set -euo pipefail

ENGINE_DIR="${ENGINE_DIR:-./engine}"
mkdir -p "$ENGINE_DIR/eval"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1;
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

download() { # url dest
  echo "[fetch-engine] downloading $1"
  curl -fL --retry 3 -o "$2" "$1"
}

# ---------------------------------------------------------------- engine ---
if [ -z "${USI_ENGINE_BINARY_URL:-}" ]; then
  echo "[fetch-engine] ERROR: USI_ENGINE_BINARY_URL is not set." >&2
  echo "[fetch-engine] Set repository Variable USI_ENGINE_BINARY_URL to a Linux x64 USI engine binary URL." >&2
  exit 1
fi

download "$USI_ENGINE_BINARY_URL" "$ENGINE_DIR/usi-engine.bin"
if [ -n "${USI_ENGINE_BINARY_SHA256:-}" ]; then
  actual="$(sha256_of "$ENGINE_DIR/usi-engine.bin")"
  [ "$actual" = "$USI_ENGINE_BINARY_SHA256" ] || {
    echo "[fetch-engine] FATAL: engine checksum mismatch ($actual)" >&2; exit 1; }
fi
chmod +x "$ENGINE_DIR/usi-engine.bin"
mv "$ENGINE_DIR/usi-engine.bin" "$ENGINE_DIR/usi-engine"

# ------------------------------------------------------------ eval (NNUE) ---
if [ -n "${USI_EVAL_URL:-}" ]; then
  download "$USI_EVAL_URL" "$ENGINE_DIR/eval/nn.bin"
  if [ -n "${USI_EVAL_SHA256:-}" ]; then
    actual="$(sha256_of "$ENGINE_DIR/eval/nn.bin")"
    [ "$actual" = "$USI_EVAL_SHA256" ] || {
      echo "[fetch-engine] FATAL: eval checksum mismatch ($actual)" >&2; exit 1; }
  fi
else
  echo "[fetch-engine] WARN: USI_EVAL_URL not set — engine will run without external NNUE eval" >&2
fi

echo "[fetch-engine] done: $ENGINE_DIR/usi-engine (+ $ENGINE_DIR/eval)"
