#!/usr/bin/env bash
# fetch-engine.sh — obtain a user-configured USI engine binary and NNUE eval file
# for the cloud analysis worker. Nothing is committed to the repo; CI obtains
# user-configured assets at runtime and caches them via actions/cache.
#
# Configuration (override via env):
#   ENGINE_DIR                 output dir (default: ./engine)
#   Method A (Prebuilt binary):
#     USI_ENGINE_BINARY_URL    prebuilt linux-x64 USI engine binary URL
#     USI_ENGINE_BINARY_SHA256 optional expected sha256 of engine binary
#   Method B (Generic source build, used when USI_ENGINE_BINARY_URL is unset):
#     USI_ENGINE_REPO_URL      Git repository URL of an open-source USI engine
#     USI_ENGINE_REF           optional Git branch, tag, or ref
#     USI_ENGINE_BUILD_CMD     shell command executed inside cloned repo that
#                              produces an executable at $ENGINE_DIR/usi-engine
#   Optional NNUE / eval file:
#     USI_EVAL_URL             optional eval file download URL
#     USI_EVAL_SHA256          optional expected sha256 of eval file
set -euo pipefail

ENGINE_DIR="${ENGINE_DIR:-./engine}"
mkdir -p "$ENGINE_DIR/eval"
ENGINE_DIR="$(cd "$ENGINE_DIR" && pwd)"
export ENGINE_DIR

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1;
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

download() { # url dest
  echo "[fetch-engine] downloading $1"
  curl -fL --retry 3 -o "$2" "$1"
}

# ---------------------------------------------------------------- engine ---
if [ -n "${USI_ENGINE_BINARY_URL:-}" ]; then
  download "$USI_ENGINE_BINARY_URL" "$ENGINE_DIR/usi-engine.bin"
  if [ -n "${USI_ENGINE_BINARY_SHA256:-}" ]; then
    actual="$(sha256_of "$ENGINE_DIR/usi-engine.bin")"
    [ "$actual" = "$USI_ENGINE_BINARY_SHA256" ] || {
      echo "[fetch-engine] FATAL: engine checksum mismatch ($actual)" >&2; exit 1; }
  fi
  chmod +x "$ENGINE_DIR/usi-engine.bin"
  mv "$ENGINE_DIR/usi-engine.bin" "$ENGINE_DIR/usi-engine"
elif [ -n "${USI_ENGINE_REPO_URL:-}" ]; then
  if [ -z "${USI_ENGINE_BUILD_CMD:-}" ]; then
    echo "[fetch-engine] ERROR: USI_ENGINE_BUILD_CMD is required when USI_ENGINE_REPO_URL is set." >&2
    exit 1
  fi
  BUILD_TMP="$(mktemp -d)"
  trap 'rm -rf "$BUILD_TMP"' EXIT
  CLONE_ARGS=(--depth 1)
  if [ -n "${USI_ENGINE_REF:-}" ]; then
    CLONE_ARGS+=(--branch "$USI_ENGINE_REF")
  fi
  echo "[fetch-engine] cloning $USI_ENGINE_REPO_URL"
  git clone "${CLONE_ARGS[@]}" "$USI_ENGINE_REPO_URL" "$BUILD_TMP/src"
  echo "[fetch-engine] building engine via USI_ENGINE_BUILD_CMD"
  (
    cd "$BUILD_TMP/src"
    bash -euo pipefail -c "$USI_ENGINE_BUILD_CMD"
  )
  if [ ! -f "$ENGINE_DIR/usi-engine" ]; then
    echo "[fetch-engine] ERROR: USI_ENGINE_BUILD_CMD did not produce $ENGINE_DIR/usi-engine" >&2
    exit 1
  fi
  chmod +x "$ENGINE_DIR/usi-engine"
  rm -rf "$BUILD_TMP"
  trap - EXIT
else
  echo "[fetch-engine] ERROR: Engine source is not configured." >&2
  echo "[fetch-engine] Set either USI_ENGINE_BINARY_URL or (USI_ENGINE_REPO_URL + USI_ENGINE_BUILD_CMD)." >&2
  exit 1
fi

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
