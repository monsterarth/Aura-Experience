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
// banco). Aqui só se lê.

/** Módulos que podem ser desligados por propriedade. */
export type ModuleKey = "estoque" | "guarita" | "hsystem" | "ponto";

interface ModuleDef {
  /** Chave em `properties.settings`. */
  setting: string;
  /**
   * Como o módulo se comporta em propriedade que nunca opinou.
   *
   * LIGADO para o que já estava em operação quando a flag nasceu — desligar
   * retroativamente arrancaria o menu de quem usa. DESLIGADO para módulo novo,
   * que ninguém contratou ainda.
   */
  defaultOn: boolean;
  label: string;
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  estoque: { setting: "hasStock", defaultOn: true, label: "Compras & Estoque" },
  guarita: { setting: "hasGuarita", defaultOn: false, label: "Guarita & Estacionamento" },
  hsystem: { setting: "hasHsystem", defaultOn: false, label: "Hsystem (canais)" },
  ponto: { setting: "hasTimeclock", defaultOn: false, label: "Ponto" },
};

/**
 * O módulo está ligado nesta propriedade?
 *
 * Aceita o objeto `settings` cru (do `PropertyContext` no browser ou da linha de
 * `properties` no servidor). Valor que não seja booleano — ausente, nulo, texto
 * vindo de migration antiga — cai no default do módulo em vez de virar `false`
 * por acidente.
 */
export function isModuleOn(settings: unknown, key: ModuleKey): boolean {
  const value = (settings as Record<string, unknown> | null | undefined)?.[MODULES[key].setting];
  return typeof value === "boolean" ? value : MODULES[key].defaultOn;
}
