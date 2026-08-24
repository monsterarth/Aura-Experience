// scripts/db/sql.mjs
//
// Aplica um arquivo .sql num alvo. É o caminho que faz migration parar de quebrar produção:
// roda no DEV (que é cópia de produção), testa o app, só então roda em produção.
//
//   pnpm db:sql migrations/nova_coisa.sql                 # vai no DEV (padrão seguro)
//   pnpm db:sql migrations/nova_coisa.sql --target prod   # pede confirmação
//   pnpm db:sql migrations/nova_coisa.sql --no-atomic     # para scripts com CREATE INDEX CONCURRENTLY
//
// Por padrão tudo roda dentro de UMA transação: se qualquer comando falhar, nada fica pela
// metade. É a diferença para colar no SQL Editor, onde um erro no meio deixa o schema
// num estado que ninguém sabe descrever.

import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ROOT, parseArgs, resolveTarget, ensureDocker, psqlFile, step, ok, say, fail } from "./_lib.mjs";

const args = parseArgs();
const file = args._[0];
if (!file) fail("Uso: pnpm db:sql <arquivo.sql> [--target dev|prod] [--no-atomic]");

const path = isAbsolute(file) ? file : resolve(ROOT, file);
if (!existsSync(path)) fail(`Arquivo não encontrado: ${path}`);

ensureDocker();
const target = resolveTarget(String(args.target ?? "dev"));
const atomic = !args["no-atomic"];

step(`Aplicar ${file} em ${target.name} (projeto ${target.ref})${atomic ? "" : " — SEM transação"}`);

if (target.isProd && !args.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question("  Isto altera PRODUÇÃO. Digite prod para confirmar: ");
  rl.close();
  if (r.trim() !== "prod") fail("Confirmação não conferiu. Nada foi alterado.");
}

const res = psqlFile(target, path, { atomic });
if (!res.ok) {
  fail(`SQL falhou${atomic ? " — a transação inteira foi desfeita, o banco está como antes" : " (SEM transação: pode ter aplicado parte)"}:\n${res.err}`);
}

if (res.out) say(res.out);
ok("aplicado com sucesso");

if (target.isProd) {
  say("\n  Não esqueça de registrar o arquivo na tabela de migrations/README.md.\n");
} else {
  say(`\n  Deu certo no DEV. Para levar a produção:\n    pnpm db:sql ${file} --target prod\n`);
}
