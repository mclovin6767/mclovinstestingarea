#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

if [[ -z "${DATABASE_URL:-}" && -f "${ENV_FILE}" ]]; then
  DATABASE_URL="$(node -e "const fs=require('fs'); const text=fs.readFileSync(process.argv[1],'utf8'); const match=text.match(/^DATABASE_URL=(.*)$/m); console.log(match ? match[1].trim().replace(/^['\\\"]|['\\\"]$/g, '') : '')" "${ENV_FILE}")"
  export DATABASE_URL
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required to apply the Supabase schema." >&2
  exit 1
fi

if [[ "${DATABASE_URL}" == *"[YOUR-PASSWORD]"* ]]; then
  echo "DATABASE_URL still contains [YOUR-PASSWORD]. Replace it with your Supabase database password." >&2
  exit 1
fi

psql "${DATABASE_URL}" \
  --set=ON_ERROR_STOP=1 \
  --file="${REPO_ROOT}/apps/backend/supabase/schema.sql" \
  --file="${REPO_ROOT}/apps/backend/supabase/rls.sql"

echo "Supabase schema and RLS policies are installed."
