#!/usr/bin/env bash
# One-command setup: install dependencies, create .env, run migrations.
# Safe to re-run — every step is idempotent.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on your PATH."
  echo "Install Node.js 20 or newer from https://nodejs.org/ (or via nvm/Homebrew), then re-run this script."
  exit 1
fi

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 20 ]; then
  echo "Node.js 20+ is required (found $(node -v)). See .nvmrc / https://nodejs.org/."
  exit 1
fi

echo "==> Using $(node -v)"

echo "==> Installing dependencies (npm install)..."
echo "    This can take 1-3 minutes on first run (downloads ~335 packages plus two native"
echo "    modules) — deprecation warnings below are normal noise, not errors. Please wait."
npm install

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example..."
  cp .env.example .env
else
  echo "==> .env already exists, leaving it as-is."
fi

echo "==> Running database migrations..."
npm run migrate

cat <<'EOF'

Setup complete. Next steps:
  npm run dev      # start the server at http://localhost:3000
  npm run verify   # typecheck + lint + full test suite

Then open http://localhost:3000 in a browser for the built-in web UI,
or see README.md for the curl-based API walkthrough.
EOF
