// scripts/db/diff.mjs
//
// Compara produção com o DEV e mostra só o que difere. Só leitura nos dois lados.
//
//   pnpm db:diff            # estrutura + contagem de linhas
//   pnpm db:diff --schema   # só estrutura (rápido, não conta linhas)
//
// Existe porque "o espelho rodou sem erro" não é o mesmo que "o espelho ficou igual". Na
// primeira execução esta comparação achou duas falhas que passaram batido pelos avisos do
// pg_restore: 188 funções de extensão faltando e a constraint que impede overbooking.
//
// Divergência de LINHAS é esperada e saudável — você mexe no DEV, produção segue viva. O
// que não pode divergir é ESTRUTURA: tabela, índice, constraint, função, policy, realtime.

import { parseArgs, resolveTarget, ensureDocker, psqlQuery, step, ok, warn, say } from "./_lib.mjs";

const args = parseArgs();
ensureDocker();

const prod = resolveTarget("prod");
const dev = resolveTarget("dev");

/** Consultas que devem dar o MESMO número dos dois lados. */
const METRICAS = {
  tabelas: "select count(*) from pg_tables where schemaname='public'",
  colunas: "select count(*) from information_schema.columns where table_schema='public'",
  indices: "select count(*) from pg_indexes where schemaname='public'",
  constraints: "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'",
  "chaves estrangeiras": "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f'",
  "constraints exclude": "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='x'",
  funcoes: "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
  triggers: "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal",
  policies: "select count(*) from pg_policies where schemaname='public'",
  "tabelas com RLS": "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity",
  views: "select count(*) from pg_views where schemaname='public'",
  "tabelas no realtime": "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'",
  extensoes: "select count(*) from pg_extension",
};

/** Listas de nomes, para dizer QUAL objeto falta e não só quantos. */
const LISTAS = {
  tabela: "select tablename from pg_tables where schemaname='public'",
  indice: "select indexname from pg_indexes where schemaname='public'",
  constraint: "select conname from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'",
  funcao: "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
  policy: "select policyname from pg_policies where schemaname='public'",
  "tabela no realtime": "select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'",
  extensao: "select extname from pg_extension",
};

const lista = (t, sql) => new Set(psqlQuery(t, sql).split("\n").map((s) => s.trim()).filter(Boolean));

let problemas = 0;

step(`Estrutura — prod (${prod.ref}) × dev (${dev.ref})`);
say(`  ${"".padEnd(22)}${"PROD".padStart(7)}${"DEV".padStart(8)}`);
for (const [nome, sql] of Object.entries(METRICAS)) {
  const a = psqlQuery(prod, sql);
  const b = psqlQuery(dev, sql);
  const igual = a === b;
  if (!igual) problemas++;
  say(`  ${nome.padEnd(22)}${a.padStart(7)}${b.padStart(8)}   ${igual ? "ok" : "<<< DIVERGE"}`);
}

step("Objetos que existem em produção e faltam no DEV");
let faltantes = 0;
for (const [rotulo, sql] of Object.entries(LISTAS)) {
  const emProd = lista(prod, sql);
  const emDev = lista(dev, sql);
  const faltam = [...emProd].filter((x) => !emDev.has(x));
  const sobram = [...emDev].filter((x) => !emProd.has(x));
  if (faltam.length) {
    faltantes += faltam.length;
    warn(`${rotulo}: faltam ${faltam.length} — ${faltam.slice(0, 12).join(", ")}${faltam.length > 12 ? ", ..." : ""}`);
  }
  if (sobram.length) {
    warn(`${rotulo}: ${sobram.length} a mais no DEV — ${sobram.slice(0, 8).join(", ")}${sobram.length > 8 ? ", ..." : ""}`);
  }
}
if (!faltantes) ok("nenhum objeto faltando");

if (!args.schema) {
  step("Linhas por tabela (diferença é normal se você mexeu no DEV)");
  const gerar = `select coalesce(string_agg(format('select %L::text as t, count(*)::text as n from public.%I', tablename, tablename), ' union all '), '')
                   from pg_tables where schemaname='public'`;
  const consulta = psqlQuery(prod, gerar);
  const ler = (t) =>
    Object.fromEntries(
      psqlQuery(t, consulta).split("\n").filter(Boolean).map((l) => {
        const [nome, n] = l.split("|");
        return [nome, Number(n)];
      })
    );
  const a = ler(prod);
  const b = ler(dev);
  const difs = Object.entries(a)
    .map(([t, n]) => ({ t, prod: n, dev: b[t] ?? null }))
    .filter((r) => r.dev !== r.prod);

  if (!difs.length) ok("todas as tabelas com a mesma contagem");
  else {
    for (const r of difs.sort((x, y) => Math.abs(y.prod - (y.dev ?? 0)) - Math.abs(x.prod - (x.dev ?? 0))).slice(0, 15)) {
      say(`  ${r.t.padEnd(32)} prod ${String(r.prod).padStart(7)}   dev ${String(r.dev ?? "AUSENTE").padStart(7)}`);
    }
    if (difs.length > 15) say(`  ... e mais ${difs.length - 15} tabela(s)`);
    const vazias = difs.filter((r) => r.prod > 0 && (r.dev ?? 0) === 0);
    if (vazias.length) warn(`${vazias.length} tabela(s) com dados em produção e vazias no DEV`);
  }
}

// Só "faltando no DEV" é problema. Objeto a mais no DEV costuma ser padrão de projeto mais
// novo (pg_graphql, por exemplo) e não afeta o que você testa.
say(
  faltantes
    ? `\n${faltantes} objeto(s) de produção faltando no DEV. Rode \`pnpm db:mirror\` para refazer o espelho.\n`
    : problemas
      ? `\nNada de produção está faltando. As ${problemas} métrica(s) marcadas divergem por sobra no DEV — confira a lista acima.\n`
      : "\nEstrutura idêntica.\n"
);
