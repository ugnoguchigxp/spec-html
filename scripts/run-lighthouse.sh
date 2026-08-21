#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports"
PORT="${PORT:-4499}"

mkdir -p "$REPORT_DIR"
"$ROOT_DIR/build-preview.sh" >/dev/null

cd "$ROOT_DIR/.preview"
npx --yes serve . -l "$PORT" > /tmp/spec-html-lp-serve.log 2>&1 &
SERVE_PID=$!

cleanup() {
  kill "$SERVE_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 2

npx --yes lighthouse "http://127.0.0.1:${PORT}/" \
  --quiet \
  --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json \
  --output-path="$REPORT_DIR/lighthouse.json"

cd "$ROOT_DIR"
node scripts/assert-lighthouse.mjs "$REPORT_DIR/lighthouse.json" 90 100
