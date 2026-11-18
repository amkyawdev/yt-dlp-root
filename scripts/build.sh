#!/usr/bin/env bash
#
# Local build / package script.
#
# This project is a static web app — there is no compile step. This script
# validates the sources and produces a deployable bundle (the `dist/` folder)
# that can be uploaded to Cloudflare Pages, Netlify, or any static host.
#
# Usage:
#   ./scripts/build.sh            # validate + build ./dist
#   ./scripts/build.sh --serve    # build, then run the dev server
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▸ validating JavaScript syntax"
fail=0
while IFS= read -r f; do
  if ! node --check "$f" >/dev/null 2>&1; then
    echo "  ✗ $f"
    node --check "$f" 2>&1 | head -3
    fail=1
  fi
done < <(find web/js worker/src -name '*.js' | sort)
[ "$fail" -eq 0 ] && echo "  ✓ all modules parse"

echo "▸ validating imports resolve"
node - <<'NODE'
const fs = require('fs');
const path = require('path');
function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
}
let bad = 0;
for (const f of walk('web/js').filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /from\s+["'](\.[^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const p = path.resolve(path.dirname(f), m[1]);
    if (!fs.existsSync(p)) { console.log('  ✗', f, '->', m[1]); bad++; }
  }
}
if (bad) process.exit(1);
console.log('  ✓ all relative imports resolve');
NODE

echo "▸ assembling dist/"
rm -rf dist
mkdir -p dist
cp -r web/* dist/
cp -r worker dist/worker

echo "▸ bundle contents"
du -sh dist 2>/dev/null || true
find dist -type f | wc -l | xargs echo "  files:"

echo "✓ build complete → dist/"

if [ "${1:-}" = "--serve" ]; then
  echo "▸ starting dev server"
  exec node serve.mjs
fi
