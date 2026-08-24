// scripts/db/backup.mjs
//
// Backup manual do banco. O plano free do Supabase não faz backup nenhum ("Free Plan does
// not include project backups"), então este arquivo é a única cópia que existe do banco.
//
//   pnpm db:backup                      # produção → backups/<data>/
//   pnpm db:backup --target dev         # o mesmo, mas do DEV
//   pnpm db:backup --label antes-do-x   # sufixo no nome da pasta, para achar depois
//   pnpm db:backup --keep 30            # quantas pastas manter (padrão: 14)
//
// O que entra:
//   public.dump    schema + dados de tudo que é seu (estrutura, RLS, funções, triggers)
//   auth.dump      só os dados de auth.users/auth.identities — é o que faz o login existir
//   storage.dump   só as LINHAS de storage (os arquivos em si ficam no Supabase/Vercel Blob)
//   manifest.json  data, versão do servidor, tamanhos e contagem por tabela
//
// O que NÃO entra: os binários do Storage e as configurações do painel (chaves de API,
// URLs de auth, políticas de e-mail). Restaurar recria o banco, não o projeto inteiro.

import { mkdirSync, writeFileSync, readdirSync, rmSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  BACKUP_DIR, parseArgs, resolveTarget, ensureDocker, checkServerVersion,
  psqlQuery, pgDump, pgRestoreList, tableCounts, humanSize, step, ok, warn, say, fail,
} from "./_lib.mjs";

/** Schemas que o Supabase administra sozinho — não são nossos para copiar. */
const SUPABASE_SCHEMAS = [
  "auth", "storage", "extensions", "graphql", "graphql_public", "realtime", "_realtime",
  "supabase_functions", "supabase_migrations", "vault", "pgbouncer", "net", "cron",
  "pgsodium", "pgsodium_masks", "_analytics", "_supavisor",
];

/** Carimbo de data legível e ordenável: 2026-08-23_1435. */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Schemas de aplicação: public + qualquer outro que você tenha criado. */
export function appSchemas(target) {
  const list = SUPABASE_SCHEMAS.map((s) => `'${s}'`).join(",");
  const out = psqlQuery(
    target,
    `select nspname from pg_namespace
      where nspname not in (${list})
        and nspname not like 'pg\\_%'
        and nspname not in ('information_schema')
      order by nspname`
  );
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function runBackup({ targetName = "prod", label = "", keep = 14, quiet = false } = {}) {
  ensureDocker();
  const target = resolveTarget(targetName);

  const version = checkServerVersion(target);
  const schemas = appSchemas(target);
  const counts = tableCounts(target, 20);
  // O dump por schema não carrega os CREATE EXTENSION; sem esta lista, uma função que usa
  // uuid_generate_v4() ou pgcrypto não restaura do outro lado.
  const extensoes = psqlQuery(
    target,
    "select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1"
  )
    .split("\n")
    .filter(Boolean)
    .map((l) => ({ nome: l.split("|")[0], schema: l.split("|")[1] }));
  // Quais tabelas estão no realtime: isso vive na publicação, fora do dump do schema.
  const realtime = psqlQuery(
    target,
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1"
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const dbSize = psqlQuery(target, "select pg_size_pretty(pg_database_size(current_database()))");

  const dir = join(BACKUP_DIR, `${stamp()}-${target.name}${label ? `-${label}` : ""}`);
  mkdirSync(dir, { recursive: true });

  if (!quiet) {
    step(`Backup de ${target.name} (projeto ${target.ref}, Postgres ${version}, ${dbSize})`);
    ok(`schemas: ${schemas.join(", ")}`);
    ok(`realtime: ${realtime.length} tabela(s) publicadas`);
  }

  // 1. Estrutura + dados do que é nosso.
  pgDump(target, dir, "public.dump", schemas.flatMap((s) => ["--schema", s]));
  const listed = pgRestoreList(dir, "public.dump");
  if (!listed.ok || listed.lines === 0) fail("O dump saiu vazio ou ilegível. Nada foi guardado como válido.");
  if (!quiet) ok(`public.dump — ${humanSize(statSync(join(dir, "public.dump")).size)}, ${listed.lines} objetos`);

  // 2. Logins. Sem isso, o banco restaurado não tem por onde entrar.
  //    Só users+identities: sessões e refresh tokens são descartáveis por natureza.
  let authRows = 0;
  try {
    pgDump(target, dir, "auth.dump", ["--data-only", "--table", "auth.users", "--table", "auth.identities"]);
    authRows = Number(psqlQuery(target, "select count(*) from auth.users"));
    if (!quiet) ok(`auth.dump — ${authRows} usuário(s)`);
  } catch {
    warn("Não consegui copiar auth.users (permissão). O backup do schema público está íntegro, mas os logins não vêm junto.");
  }

  // 3. Linhas do Storage (os arquivos em si não cabem num dump SQL).
  let storageRows = null;
  try {
    pgDump(target, dir, "storage.dump", ["--data-only", "--table", "storage.buckets", "--table", "storage.objects"]);
    storageRows = Number(psqlQuery(target, "select count(*) from storage.objects"));
    if (!quiet) ok(`storage.dump — ${storageRows} registro(s) (sem os binários)`);
  } catch {
    warn("Storage não copiado (permissão) — sem impacto se os uploads vão para o Vercel Blob.");
  }

  const manifest = {
    criadoEm: new Date().toISOString(),
    alvo: target.name,
    projeto: target.ref,
    postgres: version,
    tamanhoBanco: dbSize,
    schemas,
    extensoes,
    realtime,
    authUsers: authRows,
    storageObjects: storageRows,
    objetosNoDump: listed.lines,
    contagemPorTabela: counts,
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const total = readdirSync(dir).reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
  if (!quiet) ok(`total em disco: ${humanSize(total)}`);

  rotate(keep, quiet);
  return { dir, manifest };
}

/** Mantém as N pastas mais recentes. Backup que só cresce vira problema de disco. */
function rotate(keep, quiet) {
  if (!existsSync(BACKUP_DIR)) return;
  const dirs = readdirSync(BACKUP_DIR)
    .filter((d) => statSync(join(BACKUP_DIR, d)).isDirectory())
    .sort()
    .reverse();
  const excess = dirs.slice(keep);
  for (const d of excess) rmSync(join(BACKUP_DIR, d), { recursive: true, force: true });
  if (excess.length && !quiet) ok(`rotação: ${excess.length} backup(s) antigo(s) removido(s), ${keep} mantidos`);
}

// Só executa quando chamado direto (o mirror importa runBackup como função).
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const args = parseArgs();
  const { dir } = runBackup({
    targetName: args.target ?? "prod",
    label: typeof args.label === "string" ? args.label.replace(/[^\w-]/g, "-") : "",
    keep: Number(args.keep ?? 14),
  });
  say(`\nBackup pronto: ${dir}\n`);
}
