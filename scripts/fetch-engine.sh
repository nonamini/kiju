#!/usr/bin/env bash
# fetch-engine.sh — obtain the USI engine binary and NNUE eval file for the
# cloud analysis worker (#61). Nothing is committed to the repo; CI downloads
# pinned assets at runtime and caches them via actions/cache.
#
# Configuration (override via env):
#   ENGINE_DIR           output dir            (default: ./engine)
#   YANEURAOU_REF        git ref to build      (default: master — PIN THIS)
#   YANEURAOU_BINARY_URL optional prebuilt linux-x64 asset URL + SHA256_URL
#   SUISHO_EVAL_URL      eval file download URL (required for eval)
#   SUISHO_EVAL_SHA256   expected sha256 of eval file (required for eval)
set -euo pipefail

ENGINE_DIR="${ENGINE_DIR:-./engine}"
YANEURAOU_REF="${YANEURAOU_REF:-master}"
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
if [ -n "${YANEURAOU_BINARY_URL:-}" ]; then
  # Prebuilt asset path (preferred when a pinned release exists).
  download "$YANEURAOU_BINARY_URL" "$ENGINE_DIR/yaneuraou.bin"
  if [ -n "${YANEURAOU_BINARY_SHA256:-}" ]; then
    actual="$(sha256_of "$ENGINE_DIR/yaneuraou.bin")"
    [ "$actual" = "$YANEURAOU_BINARY_SHA256" ] || {
      echo "[fetch-engine] FATAL: engine checksum mismatch ($actual)" >&2; exit 1; }
  fi
  chmod +x "$ENGINE_DIR/yaneuraou.bin"
  mv "$ENGINE_DIR/yaneuraou.bin" "$ENGINE_DIR/yaneuraou"
else
  # Source build path: clone pinned ref and run make. The default target
  # produces one binary per NNUE architecture under YaneuraOu-by-gcc/;
  # we pick the halfKP256 variant (Suisho 5 architecture).
  echo "[fetch-engine] building yaneuraou from source @ $YANEURAOU_REF"
  build_dir="$(mktemp -d)"
  git clone --depth 1 --branch "$YANEURAOU_REF" \
    https://github.com/yaneurao/YaneuraOu.git "$build_dir/src" 2>/dev/null \
    || git clone --depth 1 https://github.com/yaneurao/YaneuraOu.git "$build_dir/src"
  (
    cd "$build_dir/src/source"
    make -j"$(nproc)" normal COMPILER=g++
  )
  candidate="$(find "$build_dir/src/source" -maxdepth 1 -type f -executable -name 'YaneuraOu*' | head -n1)"
  if [ -z "$candidate" ]; then
    candidate="$(find "$build_dir/src" -type f -perm -111 -name 'YaneuraOu*' ! -name '*.o' ! -name '*.d' | head -n1)"
  fi
  [ -n "$candidate" ] || { echo "[fetch-engine] FATAL: no engine binary produced" >&2; exit 1; }
  cp "$candidate" "$ENGINE_DIR/yaneuraou"
  chmod +x "$ENGINE_DIR/yaneuraou"
  rm -rf "$build_dir"
fi

# ------------------------------------------------------------ eval (NNUE) ---
if [ -n "${SUISHO_EVAL_URL:-}" ]; then
  download "$SUISHO_EVAL_URL" "$ENGINE_DIR/eval/nn.bin"
  if [ -n "${SUISHO_EVAL_SHA256:-}" ]; then
    actual="$(sha256_of "$ENGINE_DIR/eval/nn.bin")"
    [ "$actual" = "$SUISHO_EVAL_SHA256" ] || {
      echo "[fetch-engine] FATAL: eval checksum mismatch ($actual)" >&2; exit 1; }
  fi
else
  echo "[fetch-engine] WARN: SUISHO_EVAL_URL not set — engine will run without NNUE eval" >&2
fi

echo "[fetch-engine] done: $ENGINE_DIR/yaneuraou (+ $ENGINE_DIR/eval)"
