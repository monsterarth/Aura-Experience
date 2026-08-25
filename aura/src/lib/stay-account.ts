// A conta da estadia — regras puras, sem React.
//
// Conta e fólio são a mesma coisa: cada estadia tem UMA conta, e ela só encerra
// quando o ciclo fecha. Quatro frentes contam essa história, e cada uma vira um
// chip aceso na tela:
//
//   pagamento · chave · itens emprestados · objetos esquecidos
//
// Os chips AVISAM, não travam: "Encerrar conta" continua clicável com chip
// vermelho — o que muda é que a confirmação diz, em letras, o que vai ficar
// para trás. Travar de verdade só empurraria o problema para uma conta velha
// presa para sempre por um chip que ninguém sabe resolver.
import type { FolioItem, KeyStatus, LoanedItemsStatus, LostItemsResolution, Stay } from "@/types/aura";

export type ChipState =
  | "ok"     // resolvido
  | "alert"  // pendência de verdade (vermelho)
  | "warn"   // em andamento ou meio-caminho (amarelo) — não impede encerrar
  | "idle";  // não se aplica a esta estadia

export type ChipId = "payment" | "key" | "loaned" | "lost";

export interface AccountChip {
  id: ChipId;
  label: string;
  detail: string;
  state: ChipState;
}

/** Estadia como ela chega na lista: campos do banco + o fólio já embutido. */
type StayLike = Partial<Stay> & { folioItems?: FolioItem[] };

const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/** Débitos − créditos. Um pagamento lançado como crédito é o que quita a conta. */
export function folioBalance(items: FolioItem[] = []): number {
  let debits = 0, credits = 0;
  for (const i of items) {
    if (i.type === "credit") credits += Number(i.totalPrice) || 0;
    else debits += Number(i.totalPrice) || 0;
  }
  return Math.round((debits - credits) * 100) / 100;
}

const KEY_DETAIL: Record<KeyStatus, string> = {
  reception: "devolvida na recepção",
  awaiting_conference: "ficou na cabana — governança confirma",
  found: "encontrada na acomodação",
  missing: "não localizada",
  returned: "devolvida depois",
  charged: "cobrada no fólio",
};

const KEY_STATE: Record<KeyStatus, ChipState> = {
  reception: "ok",
  awaiting_conference: "warn",
  found: "ok",
  missing: "alert",
  returned: "ok",
  charged: "ok",
};

const LOANED_DETAIL: Record<LoanedItemsStatus, string> = {
  pending: "aguardando conferência da saída",
  returned: "devolvidos",
  missing: "não devolvidos",
  charged: "cobrados no fólio",
};

const LOANED_STATE: Record<LoanedItemsStatus, ChipState> = {
  pending: "warn",
  returned: "ok",
  missing: "alert",
  charged: "ok",
};

const LOST_DETAIL: Record<LostItemsResolution, string> = {
  returned: "devolvido ao hóspede",
  discarded: "descartado",
  stored: "guardado em achados e perdidos",
};

/** "Guardado" é meio-caminho honesto: o objeto ainda é do hóspede, mas a conta pode fechar. */
const LOST_STATE: Record<LostItemsResolution, ChipState> = {
  returned: "ok",
  discarded: "ok",
  stored: "warn",
};

/** Empréstimo em aberto: pedido de item `loan` entregue e ainda não devolvido. */
export interface OpenLoan {
  id: string;
  itemName: string;
  quantity: number;
}

export function accountChips(stay: StayLike, items?: FolioItem[], loans: OpenLoan[] = []): AccountChip[] {
  const folio = items ?? stay.folioItems ?? [];
  const balance = folioBalance(folio);

  const payment: AccountChip = balance > 0.005
    ? { id: "payment", label: "Pagamento", detail: `${money(balance)} em aberto`, state: "alert" }
    : { id: "payment", label: "Pagamento", detail: folio.length ? "quitado" : "sem lançamentos", state: "ok" };

  const key: AccountChip = stay.keyStatus
    ? { id: "key", label: "Chave", detail: KEY_DETAIL[stay.keyStatus], state: KEY_STATE[stay.keyStatus] }
    : { id: "key", label: "Chave", detail: "sem registro", state: "idle" };

  // Duas fontes: os itens de empréstimo entregues pelo Concierge (governança,
  // mensageiro ou recepção) e o texto avulso anotado no check-out. Item ainda com
  // o hóspede fala mais alto que o texto — é fato, não anotação.
  const openLoans = loans.reduce((n, l) => n + (l.quantity || 1), 0);
  const hasLoaned = !!(stay.loanedItems && stay.loanedItems.trim());
  const loanedStatus: LoanedItemsStatus | undefined = stay.loanedItemsStatus ?? (hasLoaned ? "pending" : undefined);
  const loaned: AccountChip = openLoans > 0
    ? {
        id: "loaned",
        label: "Empréstimos",
        detail: loans.length === 1
          ? `${loans[0].itemName}${loans[0].quantity > 1 ? ` ×${loans[0].quantity}` : ""} com o hóspede`
          : `${openLoans} itens com o hóspede`,
        state: "warn",
      }
    : loanedStatus
      ? { id: "loaned", label: "Empréstimos", detail: LOANED_DETAIL[loanedStatus], state: LOANED_STATE[loanedStatus] }
      : { id: "loaned", label: "Empréstimos", detail: "nada emprestado", state: "idle" };

  const hasLost = !!(stay.lostItemsDescription && stay.lostItemsDescription.trim());
  const lost: AccountChip = !hasLost
    ? { id: "lost", label: "Objetos", detail: "nada esquecido", state: "idle" }
    : stay.lostItemsResolution
      ? { id: "lost", label: "Objetos", detail: LOST_DETAIL[stay.lostItemsResolution], state: LOST_STATE[stay.lostItemsResolution] }
      : { id: "lost", label: "Objetos", detail: "sem destino definido", state: "alert" };

  return [payment, key, loaned, lost];
}

/** Chips que a confirmação de "Encerrar conta" precisa dizer em voz alta. */
export function openChips(chips: AccountChip[]): AccountChip[] {
  return chips.filter(c => c.state === "alert" || c.state === "warn");
}

/** Ciclo fechado: nada vermelho nem amarelo. */
export function accountIsClear(chips: AccountChip[]): boolean {
  return openChips(chips).length === 0;
}

/** Fez check-out e a conta ainda não foi encerrada — fica em Ativas até fechar. */
export function isAccountOpen(stay: StayLike): boolean {
  return stay.status === "finished" && !stay.billClosedAt;
}
