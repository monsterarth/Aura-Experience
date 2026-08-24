// scripts/db/env-switch.mjs
//
// Troca o .env.local entre os perfis DEV e PROD.
//
//   pnpm env:dev    # o `pnpm dev` local passa a falar com o banco de DEV
//   pnpm env:prod   # volta a falar com produção (use com parcimônia)
//   pnpm env:qual   # só mostra em qual perfil você está
//
// Existe para eliminar a edição manual de chave colada errada — o tipo de deslize que
// faz um teste rodar contra produção sem ninguém perceber.
//
// Os perfis vivem em .env.dev.local e .env.prod.local (ambos ignorados pelo git). Antes de
// sobrescrever, o .env.local atual é copiado para .env.local.bak: se você tinha editado
// algo ali e esqueceu, dá para recuperar.

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, fail, say, ok } from "./_lib.mjs";

const perfil = process.argv[2];
const local = join(ROOT, ".env.local");

function refDe(arquivo) {
  if (!existsSync(arquivo)) return null;
  const m = /NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?https:\/\/([a-z0-9]+)\./.exec(readFileSync(arquivo, "utf8"));
  return m ? m[1] : null;
}

function nomeDoPerfil() {
  const atual = refDe(local);
  if (!atual) return "desconhecido";
  for (const p of ["dev", "prod"]) {
    if (refDe(join(ROOT, `.env.${p}.local`)) === atual) return p;
  }
  return `projeto ${atual}`;
}

if (!perfil || perfil === "qual") {
  say(`Perfil atual do .env.local: ${nomeDoPerfil()}`);
  process.exit(0);
}

if (perfil !== "dev" && perfil !== "prod") fail(`Perfil inválido: "${perfil}". Use dev ou prod.`);

const origem = join(ROOT, `.env.${perfil}.local`);
if (!existsSync(origem)) {
  fail(`Não achei ${origem}.\n  Crie o perfil copiando o .env.local atual e trocando as três variáveis do Supabase.`);
}

if (existsSync(local)) copyFileSync(local, `${local}.bak`);
copyFileSync(origem, local);

ok(`.env.local agora aponta para ${perfil.toUpperCase()} (cópia do anterior em .env.local.bak)`);
if (perfil === "prod") {
  say("\n  Atenção: com este perfil, envios de WhatsApp/push saem de verdade.");
  say("  Para trabalhar contra produção sem disparar nada, ponha AURA_SAFE_MODE=true no .env.local.\n");
} else {
  say("\n  Reinicie o `pnpm dev` para o Next recarregar as variáveis.\n");
}
