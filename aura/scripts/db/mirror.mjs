// scripts/db/mirror.mjs
//
// Reescreve o banco de DEV como cópia do de produção. É o "test server": os dados de
// verdade, para testar com casos reais, sem medo de bagunçar — quando bagunçar, roda de
// novo e volta ao estado limpo.
//
//   pnpm db:mirror                          # tira um backup novo de produção e espelha
//   pnpm db:mirror --from-backup <pasta>    # ROLLBACK: repõe o DEV a partir de um backup já baixado
//   pnpm db:mirror --with-storage           # traz também as linhas do Storage
//
// O `--from-backup` é o que evita gastar egress de produção só para desfazer uma bagunça:
// o mesmo arquivo que serve de backup serve de ponto de restauração do DEV.
//
// Ordem importa: os logins entram ANTES do schema público, porque tabelas suas podem
// referenciar auth.users. E o alvo é conferido duas vezes antes de qualquer DROP.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import {
  ROOT, BACKUP_DIR, parseArgs, resolveTarget, assertNotProd, ensureDocker, checkServerVersion,
  psqlQuery, psqlTry, psqlFile, pgRestore, tableCounts, step, ok, warn, say, fail,
} from "./_lib.mjs";
import { runBackup } from "./backup.mjs";

const args = parseArgs();

ensureDocker();

// ── Alvo ──────────────────────────────────────────────────────────────────────

const dev = resolveTarget("dev");
assertNotProd(dev); // trava 1: o alvo não pode ser o projeto de produção
step(`Alvo do espelho: DEV (projeto ${dev.ref})`);

const devDb = psqlQuery(dev, "select current_database() || ' @ ' || inet_server_addr()::text");
ok(`conectado: ${devDb}`);
checkServerVersion(dev);

// ── Origem: backup novo ou já existente ───────────────────────────────────────

let sourceDir;
if (typeof args["from-backup"] === "string") {
  const raw = args["from-backup"];
  sourceDir = isAbsolute(raw) ? raw : resolve(ROOT, raw);
  if (!existsSync(join(sourceDir, "public.dump"))) {
    const disponiveis = existsSync(BACKUP_DIR)
      ? readdirSync(BACKUP_DIR).filter((d) => statSync(join(BACKUP_DIR, d)).isDirectory()).sort().reverse().slice(0, 10)
      : [];
    fail(`Não achei public.dump em ${sourceDir}.\n  Backups disponíveis:\n    ${disponiveis.join("\n    ") || "(nenhum)"}`);
  }
  step(`Rollback a partir de ${sourceDir} (produção não será consultada)`);
} else {
  const { dir } = runBackup({ targetName: "prod", label: "espelho", keep: Number(args.keep ?? 14) });
  sourceDir = dir;
}

const manifest = JSON.parse(readFileSync(join(sourceDir, "manifest.json"), "utf8"));
const schemas = manifest.schemas ?? ["public"];

// ── Limpeza ───────────────────────────────────────────────────────────────────

step("Limpando o DEV");
for (const s of schemas) {
  const r = psqlTry(dev, `drop schema if exists "${s}" cascade`);
  if (!r.ok) fail(`Não consegui remover o schema "${s}" no DEV:\n${r.err}`);
}
psqlQuery(dev, "create schema public");
// Restabelece o estado de fábrica do schema public num projeto Supabase. Melhor esforço:
// o que realmente importa (grants por tabela) vem dentro do dump.
psqlTry(dev, "alter schema public owner to pg_database_owner");
psqlTry(dev, "grant usage on schema public to anon, authenticated, service_role");
psqlTry(dev, "grant all on schema public to postgres");
ok(`schema(s) recriado(s): ${schemas.join(", ")}`);

// ── Extensões ─────────────────────────────────────────────────────────────────

// DEPOIS da limpeza, nunca antes: parte das extensões mora dentro de `public`, e o
// `drop schema public cascade` levaria junto tudo que elas instalam. Foi assim que o
// btree_gist sumiu e, com ele, a constraint que impede duas estadias na mesma cabana.
step("Extensões");
for (const ext of manifest.extensoes ?? []) {
  if (ext.nome === "plpgsql") continue; // vem de fábrica
  const r = psqlTry(dev, `create extension if not exists "${ext.nome}" with schema "${ext.schema}"`);
  if (!r.ok) warn(`extensão "${ext.nome}" não pôde ser criada: ${r.err.split("\n")[0]}`);
}
ok(`${(manifest.extensoes ?? []).length} extensão(ões) conferida(s)`);

// ── Logins ────────────────────────────────────────────────────────────────────

if (existsSync(join(sourceDir, "auth.dump"))) {
  step("Usuários (auth)");
  const wiped = psqlTry(dev, "truncate auth.users cascade");
  if (!wiped.ok) {
    const fallback = psqlTry(dev, "delete from auth.identities; delete from auth.users");
    if (!fallback.ok) warn(`não consegui limpar auth.users: ${fallback.err.split("\n")[0]}`);
  }
  const r = pgRestore(dev, sourceDir, "auth.dump", ["--data-only"]);
  if (!r.ok) {
    warn("A carga de auth falhou — o DEV vai subir sem os logins de produção.");
    warn(r.err.split("\n").slice(0, 3).join(" | "));
  } else {
    const n = psqlQuery(dev, "select count(*) from auth.users");
    ok(`${n} usuário(s) — as mesmas senhas de produção valem no DEV`);
  }
}

// ── Dados ─────────────────────────────────────────────────────────────────────

step("Restaurando schema e dados");
const restored = pgRestore(dev, sourceDir, "public.dump");
if (!restored.ok) {
  // pg_restore reclama de coisas inofensivas (comentário em extensão, grant a role do
  // painel). Só é fracasso de verdade se nenhuma tabela apareceu do outro lado.
  const tabelas = Number(psqlQuery(dev, "select count(*) from pg_tables where schemaname='public'"));
  if (tabelas === 0) fail(`pg_restore não criou nada:\n${restored.err.split("\n").slice(0, 10).join("\n")}`);

  // Mostrar os avisos, não só contá-los: "6 erros" sem dizer quais é como não avisar.
  const erros = restored.err.split("\n").filter((l) => /error:/i.test(l));
  warn(`pg_restore terminou com ${erros.length} aviso(s) — as tabelas foram criadas mesmo assim:`);
  for (const linha of erros.slice(0, 8)) warn(`    ${linha.replace(/^pg_restore:\s*/, "").slice(0, 160)}`);
  if (erros.length > 8) warn(`    ... e mais ${erros.length - 8}`);
}

// ── Realtime ──────────────────────────────────────────────────────────────────

// A publicação não vem no dump do schema. A lista fiel é a que o backup anotou de
// produção — `enable-realtime.sql` só sobrevive como plano B para backups antigos, e está
// defasado (lista 10 tabelas; produção publica bem mais).
step("Realtime");
const publicadas = manifest.realtime ?? [];
if (publicadas.length) {
  psqlTry(dev, "create publication supabase_realtime");
  let adicionadas = 0;
  for (const tabela of publicadas) {
    const r = psqlTry(
      dev,
      `do $$ begin alter publication supabase_realtime add table public."${tabela}";
         exception when duplicate_object then null; end $$`
    );
    if (r.ok) adicionadas++;
    else warn(`não publiquei "${tabela}": ${r.err.split("\n")[0]}`);
  }
  ok(`${adicionadas} de ${publicadas.length} tabela(s) publicadas em supabase_realtime`);
} else {
  const realtimeSql = join(ROOT, "migrations", "enable-realtime.sql");
  if (existsSync(realtimeSql)) {
    warn("backup antigo sem a lista de realtime — caindo para enable-realtime.sql (defasado)");
    const r = psqlFile(dev, realtimeSql, { atomic: false });
    if (!r.ok) warn(`enable-realtime.sql falhou: ${r.err.split("\n")[0]}`);
  }
}

// ── Segredos de integração ────────────────────────────────────────────────────

// Os dados são de produção; as CREDENCIAIS não precisam ser. A chave da Evolution e o
// token do Chatwoot vivem no banco por causa do multi-propriedade — o que é certo lá, mas
// significaria copiá-los para um segundo projeto, com service-role própria e outra
// superfície de acesso. Aqui eles são zerados: o DEV fica sem como se autenticar nas
// integrações de produção, mesmo que o modo seguro seja desligado por engano.
if (!args["keep-secrets"]) {
  step("Neutralizando credenciais de integração no DEV");
  const cofre = psqlTry(dev, `update public.property_secrets set secrets = '{}'::jsonb`);
  ok(cofre.ok ? "property_secrets zerado" : "property_secrets não existe neste dump");
  // Defesa contra resquício: houve uma época em que a chave também morava em settings.
  psqlTry(
    dev,
    `update public.properties
        set settings = settings #- '{whatsappConfig,apiKey}' #- '{whatsappConfig,chatwootApiToken}'
      where settings ? 'whatsappConfig'`
  );
  ok("settings.whatsappConfig sem chaves em texto puro");
}

// ── Storage (opcional) ────────────────────────────────────────────────────────

if (args["with-storage"] && existsSync(join(sourceDir, "storage.dump"))) {
  step("Storage (linhas, sem os arquivos)");
  psqlTry(dev, "delete from storage.objects; delete from storage.buckets");
  const r = pgRestore(dev, sourceDir, "storage.dump", ["--data-only"]);
  if (r.ok) ok("registros de storage carregados — os binários continuam só em produção");
  else warn(`storage não carregado: ${r.err.split("\n")[0]}`);
}

// ── Conferência ───────────────────────────────────────────────────────────────

step("Conferência");
const depois = tableCounts(dev, 20);
const antes = manifest.contagemPorTabela ?? {};
let divergentes = 0;
for (const [tabela, esperado] of Object.entries(antes)) {
  const obtido = depois[tabela];
  if (obtido === undefined) { warn(`tabela "${tabela}" não existe no DEV`); divergentes++; continue; }
  // n_live_tup é estimativa do autovacuum: logo após a carga ela pode estar desatualizada.
  if (esperado > 0 && obtido === 0) {
    const real = Number(psqlQuery(dev, `select count(*) from public."${tabela}"`));
    if (real === 0) { warn(`tabela "${tabela}" veio vazia (produção tem ~${esperado})`); divergentes++; }
  }
}
ok(divergentes === 0 ? "todas as tabelas da amostra chegaram com conteúdo" : `${divergentes} divergência(s) — veja os avisos acima`);

say(`
Espelho pronto.
  Origem : ${sourceDir}
  Destino: projeto ${dev.ref}

  Para desfazer uma bagunça no DEV depois, sem gastar produção:
    pnpm db:mirror --from-backup ${sourceDir.replace(ROOT + "\\", "")}
`);
