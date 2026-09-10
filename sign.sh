set -euo pipefail

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

web-ext sign \
  --api-key="$API_KEY" \
  --api-secret="$API_SECRET" \
  --channel unlisted \
  --ignore-files web-ext-artifacts/** .env .env.example AGENTS.md README.md sign.sh test/** package.json package-lock.json playwright.config.js .gitignore
