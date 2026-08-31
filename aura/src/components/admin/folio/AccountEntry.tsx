"use client";

// Peças da conta que envolvem CATÁLOGO e EMPRÉSTIMO — separadas do painel só por
// tamanho; são usadas exclusivamente por ele.
//
// Empréstimo não tem tabela própria: é um item de categoria `loan` do Concierge
// que foi entregue e ainda não voltou. Por isso o que a governança ou o
// mensageiro entregam pelo app aparece aqui sozinho.
import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2, HandHelping, Minus, PackageSearch, Plus, Search, ShoppingBasket, X, XCircle,
} from "lucide-react";
import { T, alpha } from "@/lib/admin-tokens";
import { Button, Field, IconButton, Input, Pill, Select, Spinner, useConfirm } from "@/components/aura";
import type { StayAccountState, StayRequest } from "./useStayAccount";
import { formatBRL } from "@/lib/money";

export const money = (v: number) => formatBRL(v);

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>{children}</div>;
}

export function Money({ label, value, color, strong }: { label: string; value: number; color: string; strong?: boolean }) {
  return (
    <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>{label}</div>
      <div style={{ fontSize: strong ? 19 : 16, fontWeight: 900, color, marginTop: 2, letterSpacing: "-.3px", fontVariantNumeric: "tabular-nums" }}>{money(value)}</div>
    </div>
  );
}

// ── Emprestados com o hóspede ────────────────────────────────────────────────

/**
 * Itens de empréstimo entregues e ainda não devolvidos. Extraviar cobra o valor
 * de perda do catálogo, quando cadastrado.
 */
export function LoanBlock({ a, readOnly }: { a: StayAccountState; readOnly?: boolean }) {
  const confirm = useConfirm();
  const loans = a.loans;
  const legacyText = (a.local?.loanedItems || "").trim();
  if (loans.length === 0 && !legacyText) return null;

  const askLost = async (r: StayRequest) => {
    const ok = await confirm({
      title: `Marcar "${r.itemName}" como extraviado?`,
      description: r.lossPrice > 0
        ? `O valor de perda (${money(r.lossPrice * r.quantity)}) será lançado na conta do hóspede.`
        : "O item sai do controle de empréstimos. Sem valor de perda cadastrado, nada é cobrado.",
      confirmLabel: "Marcar extraviado",
      tone: "danger",
    });
    if (ok) await a.resolveLoan(r.id, "lost");
  };

  return (
    <div>
      <SectionTitle>Emprestados com o hóspede</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {loans.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${T.amberBorder}`, background: T.amberBg, fontSize: 13, flexWrap: "wrap" }}>
            <HandHelping size={14} color={T.amber} style={{ flexShrink: 0 }} />
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: T.text }}>
                {r.itemName}{r.quantity > 1 ? ` x${r.quantity}` : ""}
              </span>
              <span style={{ display: "block", fontSize: 10.5, color: T.muted }}>
                entregue {format(new Date(r.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                {r.assignedName ? ` · por ${r.assignedName}` : ""}
                {r.lossPrice > 0 ? ` · perda ${money(r.lossPrice)}` : ""}
              </span>
            </div>
            {!readOnly && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Button size="sm" variant="secondary" icon={CheckCircle2} loading={a.busy} onClick={() => void a.resolveLoan(r.id, "return")}>
                  Devolvido
                </Button>
                {/* Extraviar cobra o valor de perda — não passa em conta encerrada. */}
                {!a.closed && (
                  <Button size="sm" variant="ghost" tone="red" icon={XCircle} loading={a.busy} onClick={() => void askLost(r)}>
                    Extraviado
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}

        {legacyText && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.glass, fontSize: 13 }}>
            <PackageSearch size={14} color={T.muted} style={{ flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: T.text }}>{legacyText}</span>
              <span style={{ display: "block", fontSize: 10.5, color: T.muted }}>anotado no check-out · resolva pelo sinal Empréstimos</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Novo lançamento: catálogo ou avulso ──────────────────────────────────────

/**
 * Lançar na conta — recolhido por padrão.
 *
 * O formulário (catálogo com busca + carrinho, ou avulso) ocupava a metade de
 * baixo da conta em todas as telas, o tempo todo, mesmo quando ninguém ia
 * lançar nada. Aqui ele é um botão até alguém precisar dele. Só monta o miolo
 * quando abre: o seletor de catálogo busca o catálogo inteiro ao montar.
 */
export function NewEntry({ a }: { a: StayAccountState }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"catalog" | "manual">("catalog");

  if (!open) {
    return (
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
        <Button variant="secondary" icon={Plus} fullWidth onClick={() => setOpen(true)}>
          Lançar na conta
        </Button>
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <SectionTitle>Novo lançamento</SectionTitle>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "inline-flex", gap: 4, padding: 4, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
            {([["catalog", "Do catálogo"], ["manual", "Avulso"]] as const).map(([id, label]) => {
              const sel = mode === id;
              return (
                <button key={id} type="button" className="ak-press ak-focus" onClick={() => setMode(id)}
                  style={{
                    padding: "6px 12px", borderRadius: 9, fontSize: 10, fontWeight: 900, letterSpacing: ".06em",
                    textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
                    background: sel ? alpha(T.g1, 12) : "transparent",
                    border: `1px solid ${sel ? T.g1Border : "transparent"}`,
                    color: sel ? T.brandText : T.muted,
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
          <IconButton icon={X} label="Fechar o lançamento" size="sm" variant="ghost" onClick={() => setOpen(false)} />
        </div>
      </div>

      {mode === "catalog" ? <CatalogPicker a={a} /> : <ManualEntry a={a} />}
    </div>
  );
}

function ManualEntry({ a }: { a: StayAccountState }) {
  return (
    <form onSubmit={e => void a.submitEntry(e)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="ak-fieldrow" data-cols="2">
        <Field label="Tipo">
          <Select value={a.kind} onChange={e => a.setKind(e.target.value as "debit" | "credit")}>
            <option value="debit">Débito (consumo/serviço)</option>
            <option value="credit">Crédito (pagamento)</option>
          </Select>
        </Field>
        <Field label={a.kind === "credit" ? "Descrição do pagamento" : "Produto / serviço"}>
          <Input value={a.desc} onChange={e => a.setDesc(e.target.value)} placeholder={a.kind === "credit" ? "Ex: Pix hospedagem" : "Ex: Lenha extra"} />
        </Field>
      </div>
      <div className="ak-fieldrow" data-cols="3">
        {a.kind === "debit" && (
          <Field label="Quantidade">
            <Input type="number" min={1} value={a.qty} onChange={e => a.setQty(Math.max(1, parseInt(e.target.value || "1", 10)))} />
          </Field>
        )}
        <Field label={a.kind === "credit" ? "Valor (R$)" : "Valor unitário (R$)"}>
          <Input inputMode="decimal" value={a.price} onChange={e => a.setPrice(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="&nbsp;">
          <Button type="submit" variant={a.kind === "credit" ? "primary" : "secondary"} loading={a.folio.loading} fullWidth>
            {a.kind === "credit" ? "Lançar pagamento" : "Adicionar à conta"}
          </Button>
        </Field>
      </div>
    </form>
  );
}

/**
 * Itens do catálogo do Concierge (frigobar, amenidades, empréstimos) com busca e
 * carrinho. Lançar aqui é o mesmo caminho da camareira pelo app: cobra o preço,
 * baixa o estoque e registra a entrega — item de empréstimo fica em aberto.
 */
function CatalogPicker({ a }: { a: StayAccountState }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const { loadCatalog } = a;

  React.useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const items = a.catalog?.items ?? [];
  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of items) {
      const gid = i.groupId || "sem-grupo";
      if (!seen.has(gid)) seen.set(gid, i.group?.name || "Outros");
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(i => {
      if (group !== "all" && (i.groupId || "sem-grupo") !== group) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.group?.name || "").toLowerCase().includes(q);
    });
  }, [items, query, group]);

  const bump = (id: string, delta: number) => setCart(prev => {
    const next = { ...prev };
    const v = (next[id] || 0) + delta;
    if (v <= 0) delete next[id]; else next[id] = v;
    return next;
  });

  const units = Object.values(cart).reduce((sum, n) => sum + n, 0);
  const total = Object.entries(cart).reduce((sum, [id, n]) => {
    const item = items.find(i => i.id === id);
    return sum + (item?.price || 0) * n;
  }, 0);

  const launch = async () => {
    if (await a.launchCart(cart)) setCart({});
  };

  if (a.catalogLoading && items.length === 0) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner /></div>;
  }
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 12.5, color: T.muted2, fontStyle: "italic" }}>
        Nenhum item no catálogo — cadastre em Concierge para lançar por aqui.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: T.muted }} />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar item…" style={{ paddingLeft: 32 }} fieldSize="sm" />
        </div>
        <Select fieldSize="sm" wrapStyle={{ width: 170 }} value={group} onChange={e => setGroup(e.target.value)}>
          <option value="all">Todos os grupos</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      </div>

      <div className="custom-scrollbar" style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, paddingRight: 2 }}>
        {filtered.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: T.muted2, fontStyle: "italic", padding: "8px 0" }}>Nada encontrado com esse filtro.</p>
        ) : filtered.map(item => {
          const qty = cart[item.id] || 0;
          const isLoan = item.category === "loan";
          const noStock = item.stockAvailable === false;
          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10,
              border: `1px solid ${qty > 0 ? T.g1Border : T.border}`,
              background: qty > 0 ? alpha(T.g1, 8) : T.glass, minWidth: 0,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                  {isLoan && <Pill tone="amber" label="Empréstimo" />}
                  {noStock && <Pill tone="red" label="Sem estoque" />}
                </span>
                <span style={{ fontSize: 10.5, color: T.muted }}>
                  {item.group?.name || "Outros"} · {item.price > 0 ? money(item.price) : "sem custo"}
                  {isLoan && item.loss_price ? ` · perda ${money(item.loss_price)}` : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <IconButton icon={Minus} label={`Remover ${item.name}`} size="sm" variant="ghost" disabled={qty === 0} onClick={() => bump(item.id, -1)} />
                <span style={{ minWidth: 18, textAlign: "center", fontSize: 13, fontWeight: 800, color: qty > 0 ? T.brandText : T.muted2, fontVariantNumeric: "tabular-nums" }}>{qty}</span>
                <IconButton icon={Plus} label={`Adicionar ${item.name}`} size="sm" variant="secondary" onClick={() => bump(item.id, 1)} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: T.muted }}>
          {units === 0 ? "Nenhum item escolhido" : (
            <>
              <b style={{ color: T.text }}>{units}</b> item{units > 1 ? "s" : ""}
              {total > 0 && <> · <b style={{ color: T.text }}>{money(total)}</b></>}
            </>
          )}
        </span>
        <Button variant="primary" icon={ShoppingBasket} disabled={units === 0} loading={a.busy} onClick={() => void launch()}>
          Lançar na conta
        </Button>
      </div>
    </div>
  );
}
