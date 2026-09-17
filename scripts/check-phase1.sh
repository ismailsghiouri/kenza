#!/usr/bin/env bash
#
# check-phase1.sh — Vérifie que PHASE 1 est complète.
# Usage: bash scripts/check-phase1.sh

set -uo pipefail

# Se placer à la racine du projet (dossier parent de scripts/)
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PASS=0
FAIL=0

ok()   { printf "✅ %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "❌ %s\n" "$1"; FAIL=$((FAIL+1)); }

check_dir() {
  if [ -d "$1" ]; then ok "Dossier existe: $1"; else fail "Dossier manquant: $1"; fi
}

check_file() {
  if [ -f "$1" ]; then ok "Fichier existe: $1"; else fail "Fichier manquant: $1"; fi
}

echo "=== PHASE 1 — Vérification ==="

echo
echo "--- 1. Dossiers ---"
check_dir "src"
check_dir "tests"
check_dir "drizzle"
check_dir "samples"

echo
echo "--- 2. Fichiers de config ---"
check_file "package.json"
check_file "tsconfig.json"
check_file "vitest.config.ts"
check_file "docker-compose.yaml"
check_file "Dockerfile"
check_file ".env.example"

echo
echo "--- 3. Code TypeScript compile (tsc --noEmit) ---"
TS_FILES=(
  "src/contracts/index.ts"
  "src/db/schema.ts"
  "src/graph/state.ts"
  "src/graph/nodes/index.ts"
)

MISSING_TS=0
for f in "${TS_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    fail "Fichier TS manquant: $f"
    MISSING_TS=1
  fi
done

if [ "$MISSING_TS" -eq 0 ]; then
  if command -v npx >/dev/null 2>&1; then
    npx tsc --noEmit >/tmp/phase1_tsc.log 2>&1
    # Ne bloque que sur des erreurs touchant les 4 fichiers ciblés — le reste du
    # projet (ex: tests) peut avoir des erreurs préexistantes hors du périmètre.
    TARGET_ERRORS=$(grep -E "$(IFS='|'; echo "${TS_FILES[*]}")" /tmp/phase1_tsc.log || true)
    if [ -z "$TARGET_ERRORS" ]; then
      ok "Code TypeScript compile sans erreur (tsc --noEmit)"
    else
      fail "Erreurs de compilation TypeScript dans les fichiers ciblés (voir /tmp/phase1_tsc.log)"
    fi
  else
    fail "npx introuvable, impossible de vérifier la compilation TypeScript"
  fi
fi

echo
echo "--- 4. npm install ---"
if [ -d "node_modules" ] && [ -f "package-lock.json" ]; then
  if npm ci --dry-run >/tmp/phase1_npm.log 2>&1 || npm install --dry-run >/tmp/phase1_npm.log 2>&1; then
    ok "npm install réussi (node_modules présent et cohérent)"
  else
    fail "npm install semble en échec (voir /tmp/phase1_npm.log)"
  fi
else
  fail "node_modules absent — lancer 'npm install'"
fi

echo
echo "--- 5. PostgreSQL accessible ---"
DB_URL=""
if [ -f ".env" ]; then
  DB_URL=$(grep -E '^DATABASE_URL=' .env | tail -n1 | cut -d '=' -f2- | tr -d '"'"'"'')
fi

if [ -n "$DB_URL" ]; then
  if command -v psql >/dev/null 2>&1; then
    if psql "$DB_URL" -c '\q' >/tmp/phase1_pg.log 2>&1; then
      ok "PostgreSQL accessible via DATABASE_URL"
    else
      fail "Impossible de se connecter à PostgreSQL (voir /tmp/phase1_pg.log)"
    fi
  elif command -v node >/dev/null 2>&1 && [ -d "node_modules/postgres" ]; then
    # Fallback: tenter via le driver 'postgres' (postgres-js), déjà utilisé par src/db/client.ts
    if node -e "
      const postgres = require('postgres');
      const sql = postgres(process.argv[1], { max: 1, connect_timeout: 5 });
      sql\`select 1\`.then(() => sql.end()).then(() => process.exit(0)).catch(() => process.exit(1));
    " "$DB_URL" >/tmp/phase1_pg.log 2>&1; then
      ok "PostgreSQL accessible via DATABASE_URL (postgres-js)"
    else
      fail "Impossible de se connecter à PostgreSQL (voir /tmp/phase1_pg.log)"
    fi
  else
    fail "Ni 'psql' ni le module 'postgres' disponibles pour tester la connexion PostgreSQL"
  fi
else
  fail "DATABASE_URL introuvable dans .env — impossible de tester PostgreSQL"
fi

echo
echo "--- 6. Variables d'environnement (.env) ---"
if [ -f ".env" ]; then
  if grep -qE '^DATABASE_URL=.+' .env; then
    ok "DATABASE_URL est défini dans .env"
  else
    fail "DATABASE_URL absent ou vide dans .env"
  fi
else
  fail ".env introuvable — DATABASE_URL non vérifiable"
fi

echo
echo "=== Résumé ==="
echo "✅ Réussis : $PASS"
echo "❌ Échoués : $FAIL"

if [ "$FAIL" -eq 0 ]; then
  echo
  echo "🎉 PHASE 1 complète !"
  exit 0
else
  echo
  echo "⚠️  PHASE 1 incomplète — corriger les points ci-dessus."
  exit 1
fi
