// src/lib/housekeeping-duplicates.ts
//
// A trava de tarefa repetida.
//
// Medido em 01/09/2026: 20% das tarefas de um mês (125 de 631) eram duplicata de
// outra igual no mesmo dia — e 106 delas eram uma pessoa criando por cima do que
// o motor já tinha criado. O motor quase não se duplica (1 caso): os guards dele
// funcionam. O buraco é ENTRE as fontes, e a tabela recebe insert de 8 lugares
// diferentes, então a checagem precisa morar num módulo que todos importem.
//
// Fica em `lib` de propósito: o motor de regras (`housekeeping-rule-engine`) e o
// service são consumidores, e um importar o outro criaria ciclo.
//
// A política NÃO é simétrica, e isso é decisão de produto (ver docs/HOUSEKEEPING-V2.md):
//   • MÁQUINA que encontra duplicata **desiste em silêncio** — máquina não insiste.
//   • PESSOA que encontra duplicata **vê a que já existe** e decide. Bloquear sem
//     mostrar levaria a driblar a trava (um `customLocation` levemente diferente),
//     e a causa provável das 106 é justamente ela não ter visto a existente.

/** Status em que a tarefa ainda "ocupa o lugar". Concluída/cancelada/pulada não bloqueiam. */
export const OPEN_TASK_STATUSES = [
  'pending',
  'in_progress',
  'waiting_conference',
  'paused',
  'awaiting_checkout',
] as const;

/** Onde a tarefa acontece. Um destes três está preenchido. */
export interface TaskLocation {
  cabinId?: string | null;
  structureId?: string | null;
  customLocation?: string | null;
}

export interface OpenDuplicate {
  id: string;
  type: string;
  status: string;
  assignedTo: string[] | null;
  createdAt: string;
  /** Preenchido = nasceu de uma regra do motor; nulo = alguém criou à mão. */
  ruleId: string | null;
}

/**
 * Tarefa ABERTA do mesmo tipo, no mesmo lugar. `null` se o caminho está livre.
 *
 * `stayId` fica fora da chave de propósito: duas estadias no mesmo dia na mesma
 * cabana geram tipos diferentes (`turnover` na saída, `daily` na estadia), então
 * o tipo já separa os casos legítimos.
 *
 * Recebe o client de quem chama porque os consumidores diferem — o motor roda com
 * service-role no servidor, o modal do admin roda no navegador.
 */
export async function findOpenDuplicate(
  client: any,
  propertyId: string,
  type: string,
  loc: TaskLocation,
): Promise<OpenDuplicate | null> {
  let query = client
    .from('housekeeping_tasks')
    .select('id, type, status, assignedTo, createdAt, ruleId')
    .eq('propertyId', propertyId)
    .eq('type', type)
    .in('status', OPEN_TASK_STATUSES as unknown as string[]);

  // Exatamente UM dos três identifica o lugar; os outros precisam ser nulos, senão
  // "cabana 11" casaria com "estrutura 11" por coincidência de id.
  if (loc.cabinId) {
    query = query.eq('cabinId', loc.cabinId);
  } else if (loc.structureId) {
    query = query.eq('structureId', loc.structureId).is('cabinId', null);
  } else if (loc.customLocation) {
    query = query
      .eq('customLocation', loc.customLocation)
      .is('cabinId', null)
      .is('structureId', null);
  } else {
    // Tarefa sem lugar definido não tem como duplicar de forma verificável.
    return null;
  }

  const { data, error } = await query.order('createdAt', { ascending: true }).limit(1);

  // Falha de consulta NÃO bloqueia a criação: é melhor uma duplicata do que uma
  // faxina que não existe porque o banco piscou.
  if (error) {
    console.error('[housekeeping/duplicates]', error.message);
    return null;
  }

  return (data?.[0] as OpenDuplicate | undefined) ?? null;
}

/**
 * Erro que o caminho da PESSOA recebe quando bate numa tarefa aberta igual.
 *
 * Falha alto de propósito: se `createTask` devolvesse um valor especial, um
 * chamador desatento passaria batido e a duplicata voltaria em silêncio. Quem
 * quiser criar mesmo assim passa `force: true` — explicitamente, depois de a
 * pessoa ter visto o que já existe.
 */
export class DuplicateTaskError extends Error {
  readonly duplicate: OpenDuplicate;
  constructor(duplicate: OpenDuplicate) {
    super('Já existe uma tarefa aberta deste tipo neste local.');
    this.name = 'DuplicateTaskError';
    this.duplicate = duplicate;
  }
}

export function isDuplicateTaskError(e: unknown): e is DuplicateTaskError {
  return e instanceof Error && e.name === 'DuplicateTaskError';
}
