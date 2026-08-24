// scripts/db/_lib.mjs
//
// Base compartilhada das ferramentas de banco. Duas decisões explicam o resto do arquivo:
//
// 1. O cliente Postgres roda em CONTÊINER. Nada de instalar psql/pg_dump no Windows, e a
//    versão do cliente fica pregada (um pg_dump mais velho que o servidor recusa o dump).
// 2. A senha NUNCA vai na linha de comando do docker — ela sai da URL e entra como
//    PGPASSWORD, para não aparecer em `docker ps` nem no histórico do shell.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const BACKUP_DIR = join(ROOT, "backups");

/** Cliente Postgres 17: fala com servidores mais antigos, mas não com mais novos. */
const PG_IMAGE = "postgres:17-alpine";

// ── Saída ─────────────────────────────────────────────────────────────────────

export const say = (msg) => console.log(msg);
export const step = (msg) => console.log(`\n▸ ${msg}`);
export const warn = (msg) => console.warn(`  ! ${msg}`);
export const ok = (msg) => console.log(`  · ${msg}`);

export function fail(msg) {
  console.error(`\nERRO: ${msg}\n`);
  process.exit(1);
}

// ── Argumentos ────────────────────────────────────────────────────────────────

/** `--chave valor` e `--flag` viram { chave: "valor", flag: true, _: [posicionais] }. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { out[key] = next; i++; } else { out[key] = true; }
  }
  return out;
}

// ── Alvos (.env.db) ───────────────────────────────────────────────────────────

function loadEnvDb() {
  const file = join(ROOT, ".env.db");
  if (!existsSync(file)) {
    fail(
      "Não achei o arquivo .env.db.\n" +
      "  Copie o modelo e preencha as connection strings:\n" +
      "    cp .env.db.example .env.db"
    );
  }
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/** Ref do projeto Supabase, embutida no usuário do pooler (postgres.<ref>) ou no host. */
function projectRef(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("Connection string inválida no .env.db. Se a senha tiver caracteres especiais, use a versão codificada (%40 no lugar de @, etc).");
  }
  const user = decodeURIComponent(parsed.username || "");
  if (user.includes(".")) return user.split(".").pop();
  return parsed.hostname.split(".")[0];
}

/**
 * Resolve "prod" ou "dev" para uma conexão utilizável.
 *
 * A conferência de que os dois bancos são diferentes mora aqui: um copy-paste distraído no
 * .env.db apontando o DEV para produção transformaria o espelho num `DROP SCHEMA public` no
 * banco de verdade. Barato de checar, caríssimo de descobrir depois.
 */
export function resolveTarget(name) {
  if (name !== "prod" && name !== "dev") fail(`Alvo inválido: "${name}". Use --target prod ou --target dev.`);
  const env = loadEnvDb();
  const prodUrl = env.PROD_DB_URL;
  const devUrl = env.DEV_DB_URL;
  const key = name === "prod" ? "PROD_DB_URL" : "DEV_DB_URL";
  const url = name === "prod" ? prodUrl : devUrl;

  if (!url) fail(`${key} não está preenchido no .env.db.`);
  if (/\[YOUR-PASSWORD\]|COLE_A_SENHA/i.test(url)) {
    fail(`${key} ainda está com o placeholder de senha. Cole a senha real no .env.db.`);
  }
  if (prodUrl && devUrl && projectRef(prodUrl) === projectRef(devUrl)) {
    fail("PROD_DB_URL e DEV_DB_URL apontam para o MESMO projeto Supabase. Corrija o .env.db antes de continuar.");
  }

  return { name, url, isProd: name === "prod", ref: projectRef(url) };
}

/** Trava de segurança das operações que apagam dados. */
export function assertNotProd(target) {
  if (target.isProd) fail("Esta operação apaga dados e nunca roda contra produção.");
  const env = loadEnvDb();
  if (env.PROD_DB_URL && projectRef(env.PROD_DB_URL) === target.ref) {
    fail(`O alvo "${target.name}" resolve para o projeto de produção (${target.ref}). Abortado.`);
  }
}

// ── Docker + Postgres ─────────────────────────────────────────────────────────

/** Separa a senha da URL e força SSL (o pooler do Supabase exige). */
function splitUrl(url) {
  const u = new URL(url);
  const password = decodeURIComponent(u.password || "");
  u.password = "";
  if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
  return { conn: u.toString(), password };
}

export function ensureDocker() {
  const r = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
  // O `docker` do Windows às vezes devolve status 0 mesmo sem alcançar o daemon — por isso
  // a prova é a saída, não só o código de retorno.
  if (r.status !== 0 || !(r.stdout ?? "").trim()) {
    fail("O Docker não respondeu (daemon fora do ar). Abra o Docker Desktop, espere ficar verde e rode de novo.");
  }
}

/**
 * Roda um binário do Postgres dentro do contêiner.
 * `mounts` recebe pares [caminhoNoWindows, caminhoNoContêiner].
 * O literal "__CONN__" nos argumentos é trocado pela connection string sem senha.
 */
function pgRun(target, argv, { mounts = [], capture = false } = {}) {
  const { conn, password } = splitUrl(target.url);
  const args = ["run", "--rm", "-e", `PGPASSWORD=${password}`];
  for (const [host, guest] of mounts) args.push("-v", `${host}:${guest}`);
  args.push(PG_IMAGE, ...argv.map((a) => (a === "__CONN__" ? conn : a)));

  const r = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
  });

  if (r.error) fail(`Falha ao chamar o docker: ${r.error.message}`);
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Executa SQL e devolve a saída crua (uma linha por registro, campos separados por |). */
export function psqlQuery(target, sql) {
  const r = pgRun(target, ["psql", "__CONN__", "-tAF|", "-v", "ON_ERROR_STOP=1", "-c", sql], { capture: true });
  if (r.status !== 0) fail(`Consulta falhou em "${target.name}":\n${r.stderr.trim()}`);
  return r.stdout.trim();
}

/** Executa SQL sem exigir sucesso — para passos de melhor esforço. */
export function psqlTry(target, sql) {
  const r = pgRun(target, ["psql", "__CONN__", "-tAF|", "-v", "ON_ERROR_STOP=1", "-c", sql], { capture: true });
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}

/** Executa um arquivo .sql. `atomic` embrulha tudo numa transação (tudo ou nada). */
export function psqlFile(target, hostFile, { atomic = true } = {}) {
  const dir = resolve(hostFile, "..");
  const base = hostFile.split(/[\\/]/).pop();
  const argv = ["psql", "__CONN__", "-v", "ON_ERROR_STOP=1"];
  if (atomic) argv.push("--single-transaction");
  argv.push("-f", `/sql/${base}`);
  const r = pgRun(target, argv, { mounts: [[dir, "/sql"]], capture: true });
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}

/** pg_dump no formato custom (comprimido e restaurável em partes). */
export function pgDump(target, outDir, fileName, extraArgs) {
  mkdirSync(outDir, { recursive: true });
  const argv = ["pg_dump", "__CONN__", "-Fc", "--no-owner", "-f", `/work/${fileName}`, ...extraArgs];
  const r = pgRun(target, argv, { mounts: [[outDir, "/work"]], capture: true });
  if (r.status !== 0) fail(`pg_dump falhou:\n${r.stderr.trim()}`);
  return join(outDir, fileName);
}

/**
 * Restaura um dump. Repare que NÃO passamos `--no-acl`: os GRANT/REVOKE fazem parte do que
 * queremos espelhar — é o que decide, por exemplo, quais tabelas a chave anon enxerga. Sem
 * eles o DEV responderia diferente de produção justamente nas perguntas de permissão.
 */
export function pgRestore(target, dir, fileName, extraArgs = []) {
  const argv = ["pg_restore", "-d", "__CONN__", "--no-owner", ...extraArgs, `/work/${fileName}`];
  const r = pgRun(target, argv, { mounts: [[dir, "/work"]], capture: true });
  return { ok: r.status === 0, err: r.stderr.trim() };
}

/** Lista o conteúdo de um dump — prova barata de que o arquivo não saiu vazio/corrompido. */
export function pgRestoreList(dir, fileName) {
  const r = spawnSync("docker", ["run", "--rm", "-v", `${dir}:/work`, PG_IMAGE, "pg_restore", "-l", `/work/${fileName}`], { encoding: "utf8" });
  return { ok: r.status === 0, lines: (r.stdout ?? "").split("\n").filter((l) => l && !l.startsWith(";")).length };
}

/** Versão do servidor — se for mais nova que o cliente, o dump nem começa. */
export function checkServerVersion(target) {
  const raw = psqlQuery(target, "show server_version");
  const major = parseInt(raw, 10);
  const client = parseInt(PG_IMAGE.split(":")[1], 10);
  if (major > client) {
    fail(`O servidor é Postgres ${major} e o cliente da imagem é ${client}. Suba PG_IMAGE em scripts/db/_lib.mjs para postgres:${major}-alpine.`);
  }
  return raw;
}

/** Fotografia de tamanho por tabela — serve de conferência antes/depois. */
export function tableCounts(target, limit = 12) {
  const out = psqlQuery(
    target,
    `select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by n_live_tup desc limit ${limit}`
  );
  const counts = {};
  for (const line of out.split("\n").filter(Boolean)) {
    const [name, n] = line.split("|");
    counts[name] = Number(n);
  }
  return counts;
}

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
