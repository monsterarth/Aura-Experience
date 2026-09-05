// src/lib/modules.ts
//
// Registro dos módulos desligáveis. Isomórfico de propósito: o menu (browser) e
// as rotas de API (servidor) precisam da MESMA resposta, e uma segunda cópia da
// regra é como um módulo acaba escondido no menu e aberto na API.
//
// Regra 1 de `docs/MODULARIZATION.md`: módulo novo nasce com flag no dia um,
// allowlistada em `src/lib/property-settings.ts` como super_admin-only. Este
// arquivo é o outro lado — quem lê a flag.
//
// Quem escreve continua sendo `property-settings.ts` (server-only, com merge no
// banco). Aqui só se lê. Quem APLICA a leitura: `isModuleOn` direto (menu, abas,
// crons), `requireModule` em `src/lib/api-auth.ts` (rotas → 403 MODULE_OFF) e
// `<ModuleGuard>` em `src/components/auth/` (páginas → aviso, não redirect).

/**
 * Módulos que podem ser desligados por propriedade.
 *
 * Chave só entra aqui na fatia que a APLICA (regra 5 do doc): chave sem
 * enforcement é toggle que mente. A taxonomia completa — operacional,
 * gastronomia/salão, concierge, comercial, eventos, casamentos… — está na seção
 * 4 do doc e entra uma a uma, cada qual com sua migration de backfill.
 */
export type ModuleKey = "estoque" | "guarita" | "hsystem" | "rh" | "ponto";

interface ModuleDef {
  /** Chave em `properties.settings`. */
  setting: string;
  /**
   * Como o módulo se comporta em propriedade que nunca opinou.
   *
   * Desde a fatia 1 (04/09/2026) é DESLIGADO para toda chave, e toda chave nova
   * chega com uma migration que grava o valor explícito nas propriedades que
   * já existem (regra 6 do doc). O default implícito custou dois defeitos
   * medidos em produção: `hasStock` LIGADO por default fez a Estância do Vale —
   * que nunca contratou nada — nascer com o grupo Compras & Estoque no menu; e
   * `ponto` virar filho de `rh` mataria o Ponto na Fazenda se `hasRH` não
   * estivesse gravado. Propriedade NOVA nasce sem nenhuma dessas chaves
   * (`core/properties/page.tsx` só grava as duas flags zumbis) e cai neste
   * default — tudo desligado até o preset ligar o que foi vendido (fatia 8).
   */
  defaultOn: boolean;
  label: string;
  /**
   * Feature dentro de um módulo: só liga se o PAI estiver ligado. UM pai só,
   * de propósito — a árvore termina sempre. A primeira versão desta ideia usava
   * uma lista `requires` com resolução recursiva e memo compartilhado, e o
   * diamante `salao → {gastronomia, cafe}` + `cafe → gastronomia` fazia o salão
   * (a chave do piloto) resolver `false` para sempre. Árvore não tem diamante.
   */
  parent?: ModuleKey;
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  estoque: { setting: "hasStock", defaultOn: false, label: "Compras & Estoque" },
  guarita: { setting: "hasGuarita", defaultOn: false, label: "Guarita & Estacionamento" },
  hsystem: { setting: "hasHsystem", defaultOn: false, label: "Hsystem (canais)" },
  // Cobre escala e ausências. NÃO cobre o cadastro de pessoas: toda propriedade
  // tem funcionário, então a aba Pessoas de /admin/rh é core e continua de pé com
  // o módulo desligado. O gate é POR ABA e não na página — `/admin/rh` é a tela
  // inicial de admin e manager (`role-routes.ts`), e um guard de página inteira
  // que redireciona para a home entraria em loop de login.
  rh: { setting: "hasRH", defaultOn: false, label: "Gente (escala e ausências)" },
  // Decisão do fundador (02/09/2026): RH, ponto e escalas são UM módulo comercial.
  // `ponto` vira feature de `rh`. Em produção a Fazenda já tem `hasRH: true` e
  // `hasTimeclock: true`, então nada muda para ela; para as demais o efeito é o
  // mesmo de antes (desligado). A flag própria continua existindo porque o Ponto
  // é contratável separadamente dentro do módulo. O que ela governa hoje: o item
  // do menu, o relatório em /admin/ponto e o import do relógio (rh/afd). O botão
  // de bater ponto no topo NÃO olha o módulo — decide por `staff.timeSource`
  // (TimeClockButton.tsx), e a rota /api/admin/timeclock ainda não tem gate
  // (fatia 3). Não prometer o contrário em texto de UI.
  ponto: { setting: "hasTimeclock", defaultOn: false, label: "Ponto", parent: "rh" },
};

/**
 * A flag PRÓPRIA da chave, sem olhar o pai. É o que a página de Módulos deve
 * semear e gravar: gravar o valor já resolvido pelo pai apagaria o `true` de um
 * filho enquanto o pai está desligado — e "religar volta como estava" deixaria
 * de ser verdade. Para saber se o módulo está de fato ligado, `isModuleOn`.
 */
export function isModuleFlagOn(settings: unknown, key: ModuleKey): boolean {
  const value = (settings as Record<string, unknown> | null | undefined)?.[MODULES[key].setting];
  return typeof value === "boolean" ? value : MODULES[key].defaultOn;
}

/**
 * O módulo está ligado nesta propriedade?
 *
 * Aceita o objeto `settings` cru (do `PropertyContext` no browser ou da linha de
 * `properties` no servidor). Valor que não seja booleano — ausente, nulo, texto
 * vindo de migration antiga — cai no default do módulo em vez de virar `false`
 * por acidente. Feature só está ligada se a própria flag E o pai estiverem.
 */
export function isModuleOn(settings: unknown, key: ModuleKey): boolean {
  if (!isModuleFlagOn(settings, key)) return false;
  const parent = MODULES[key].parent;
  return parent ? isModuleOn(settings, parent) : true;
}

/**
 * Filhos diretos de um módulo — para a página de Módulos desligar em cascata e
 * para o aviso "desligar X também desliga Y".
 */
export function childModules(key: ModuleKey): ModuleKey[] {
  return (Object.keys(MODULES) as ModuleKey[]).filter((k) => MODULES[k].parent === key);
}
