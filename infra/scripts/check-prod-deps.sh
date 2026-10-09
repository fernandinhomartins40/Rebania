#!/usr/bin/env bash
# Monta api e worker como na imagem (pnpm deploy --prod) e confere que todo
# import de terceiros do bundle resolve. Evita "Cannot find package" só em
# produção quando um pacote interno empacotado usa algo que está em devDependencies.
# Uso: infra/scripts/check-prod-deps.sh   (depois de `pnpm turbo run build`)
set -euo pipefail
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
check() {
  local pkg="$1" entry="$2" dir="$OUT/$1"
  pnpm --filter "@rebania/$pkg" deploy --prod --legacy "$dir" >/dev/null
  (cd "$dir" && ENTRY="$entry" node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const src = readFileSync(process.env.ENTRY, "utf8");
    const mods = [...new Set([...src.matchAll(/from ["\x27]([^"\x27.][^"\x27]*)["\x27]/g)].map((m) => m[1]))]
      .filter((m) => !m.startsWith("node:"));
    const bad = [];
    for (const m of mods) { try { await import(m); } catch (e) { bad.push(`${m} (${e.code ?? e.message})`); } }
    if (bad.length) { console.error(`ERRO: imports sem pacote de produção: ${bad.join(", ")}`); process.exit(1); }
    console.log(`ok: ${mods.length} imports de terceiros resolvem`);
  ')
  echo "  ^ $pkg ($entry)"
}
check api dist/server.js
check worker dist/main.js
