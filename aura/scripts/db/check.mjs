// scripts/db/check.mjs
//
// Confere se o .env.db está correto: conecta nos dois bancos e mostra o que achou.
// Só leitura — não altera nada. Use quando montar o ambiente, quando o DEV voltar de uma
// pausa, ou sempre que um script reclamar de conexão.
//
//   pnpm db:check

import { parseArgs, resolveTarget, ensureDocker, psqlQuery, step, ok, warn, say } from "./_lib.mjs";

const args = parseArgs();
ensureDocker();
say("Docker: ok");

const alvos = args.target ? [String(args.target)] : ["prod", "dev"];
let falhou = false;

for (const nome of alvos) {
  step(nome.toUpperCase());
  let target;
  try {
    target = resolveTarget(nome);
  } catch {
    falhou = true;
    continue;
  }

  try {
    const info = psqlQuery(
      target,
      `select current_database(), current_user, version(),
              pg_size_pretty(pg_database_size(current_database())),
              (select count(*) from pg_tables where schemaname = 'public')`
    ).split("|");

    ok(`projeto ${target.ref}`);
    ok(`conectado como ${info[1]} em ${info[0]}`);
    ok(`Postgres ${info[2].split(" ")[1]} · ${info[3]} · ${info[4]} tabela(s) em public`);

    const users = psqlQuery(target, "select count(*) from auth.users");
    ok(`auth.users legível: ${users} usuário(s)`);
  } catch {
    falhou = true;
  }
}

if (falhou) {
  say("\nAlgum alvo falhou. Cheque a connection string no .env.db (tem que ser a do Session pooler, porta 5432).\n");
  process.exit(1);
}
say(
  alvos.length === 1
    ? `\nO alvo "${alvos[0]}" responde.\n`
    : "\nOs dois bancos respondem. Pode rodar `pnpm db:backup` e `pnpm db:mirror`.\n"
);
