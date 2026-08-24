// scripts/db/restore.mjs
//
// Restaura um backup por cima de um banco. É a metade do backup que quase ninguém testa —
// e a única que importa no dia ruim.
//
//   pnpm db:restore --from backups/2026-08-23_1435-prod --target dev
//   pnpm db:restore --from backups/2026-08-23_1435-prod --target prod   # pede confirmação
//
// Para repor só o DEV, prefira `pnpm db:mirror --from-backup <pasta>`: faz o mesmo com
// menos cerimônia. Este script existe para o caso sério — perder dados em produção.
//
// Antes de sobrescrever produção ele tira um backup do estado atual. Restaurar a cópia
// errada é um jeito conhecido de transformar um problema em dois.

import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import {
  ROOT, parseArgs, resolveTarget, ensureDocker, checkServerVersion,
  psqlQuery, psqlTry, psqlFile, pgRestore, tableCounts, step, ok, warn, say, fail,
} from "./_lib.mjs";
import { runBackup } from "./backup.mjs";

const args = parseArgs();
ensureDocker();

if (!args.from) fail("Faltou --from <pasta do backup>. Ex.: --from backups/2026-08-23_1435-prod");
const sourceDir = isAbsolute(args.from) ? args.from : resolve(ROOT, String(args.from));
if (!existsSync(join(sourceDir, "public.dump"))) fail(`Não achei public.dump em ${sourceDir}`);

const target = resolveTarget(String(args.target ?? "dev"));
const manifest = JSON.parse(readFileSync(join(sourceDir, "manifest.json"), "utf8"));
checkServerVersion(target);

step(`Restaurar ${sourceDir}`);
say(`  Backup de : ${manifest.alvo} (projeto ${manifest.projeto}) em ${new Date(manifest.criadoEm).toLocaleString("pt-BR")}`);
say(`  Destino   : ${target.name} (projeto ${target.ref})`);

// ── Confirmação para produção ─────────────────────────────────────────────────

if (target.isProd) {
  const atual = tableCounts(target, 8);
  say("\n  O schema public de PRODUÇÃO será APAGADO e substituído. Hoje ele tem:");
  for (const [t, n] of Object.entries(atual)) say(`    ${t}: ${n}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await rl.question(`\n  Digite RESTAURAR ${target.ref} para confirmar: `);
  rl.close();
  if (resposta.trim() !== `RESTAURAR ${target.ref}`) fail("Confirmação não conferiu. Nada foi alterado.");

  if (!args["skip-safety-backup"]) {
    step("Backup de segurança do estado atual (antes de sobrescrever)");
    const { dir } = runBackup({ targetName: "prod", label: "pre-restore", quiet: true });
    ok(`guardado em ${dir}`);
  }
}

// ── Restauração ───────────────────────────────────────────────────────────────

const schemas = manifest.schemas ?? ["public"];

step("Limpando o destino");
for (const s of schemas) {
  const r = psqlTry(target, `drop schema if exists "${s}" cascade`);
  if (!r.ok) fail(`Não consegui remover o schema "${s}":\n${r.err}`);
}
psqlQuery(target, "create schema public");
psqlTry(target, "alter schema public owner to pg_database_owner");
psqlTry(target, "grant usage on schema public to anon, authenticated, service_role");
psqlTry(target, "grant all on schema public to postgres");

// Extensões DEPOIS da limpeza, nunca antes: parte delas mora dentro de `public` e seria
// levada pelo cascade — junto com opclasses de que índices e constraints dependem.
step("Extensões");
for (const ext of manifest.extensoes ?? []) {
  if (ext.nome === "plpgsql") continue;
  const r = psqlTry(target, `create extension if not exists "${ext.nome}" with schema "${ext.schema}"`);
  if (!r.ok) warn(`extensão "${ext.nome}" não pôde ser criada: ${r.err.split("\n")[0]}`);
}

if (existsSync(join(sourceDir, "auth.dump"))) {
  step("Usuários (auth)");
  const wiped = psqlTry(target, "truncate auth.users cascade");
  if (!wiped.ok) psqlTry(target, "delete from auth.identities; delete from auth.users");
  const r = pgRestore(target, sourceDir, "auth.dump", ["--data-only"]);
  if (r.ok) ok(`${psqlQuery(target, "select count(*) from auth.users")} usuário(s) restaurado(s)`);
  else warn(`auth não restaurado: ${r.err.split("\n")[0]}`);
}

step("Restaurando schema e dados");
const restored = pgRestore(target, sourceDir, "public.dump");
const tabelas = Number(psqlQuery(target, "select count(*) from pg_tables where schemaname='public'"));
if (tabelas === 0) fail(`pg_restore não criou nada:\n${restored.err.split("\n").slice(0, 10).join("\n")}`);
if (!restored.ok) warn("pg_restore terminou com avisos — tabelas criadas mesmo assim.");
ok(`${tabelas} tabela(s) em public`);

// A publicação do realtime não vem no dump do schema — a lista fiel é a que o backup
// anotou. `enable-realtime.sql` fica só como plano B para backups antigos, e está defasado.
step("Realtime");
const publicadas = manifest.realtime ?? [];
if (publicadas.length) {
  psqlTry(target, "create publication supabase_realtime");
  let adicionadas = 0;
  for (const tabela of publicadas) {
    const r = psqlTry(
      target,
      `do $$ begin alter publication supabase_realtime add table public."${tabela}";
         exception when duplicate_object then null; end $$`
    );
    if (r.ok) adicionadas++;
  }
  ok(`${adicionadas} de ${publicadas.length} tabela(s) publicadas`);
} else {
  const realtimeSql = join(ROOT, "migrations", "enable-realtime.sql");
  if (existsSync(realtimeSql)) {
    warn("backup antigo sem a lista de realtime — caindo para enable-realtime.sql (defasado)");
    psqlFile(target, realtimeSql, { atomic: false });
  }
}

step("Conferência");
const depois = tableCounts(target, 20);
for (const [t, esperado] of Object.entries(manifest.contagemPorTabela ?? {})) {
  const obtido = depois[t];
  if (obtido === undefined) warn(`tabela "${t}" não existe no destino`);
}
ok("restauração concluída");

say(`
Restaurado em ${target.name} (projeto ${target.ref}).

  Confira antes de considerar resolvido: abra o app, faça login e veja uma tela com dados.
  Lembre que o dump NÃO traz os arquivos do Storage nem as configurações do painel Supabase.
`);
