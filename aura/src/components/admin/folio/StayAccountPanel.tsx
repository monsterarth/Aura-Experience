"use client";

// A conta da estadia — o painel visual, único para as três telas que a mostram:
// modal da Conta, ficha rápida (StayDetailsModal) e ficha completa.
//
// Saldo, os quatro sinais com desfecho inline, os lançamentos e o formulário —
// tudo aqui. Quem chama só decide o que fica em volta (título, botão de encerrar,
// diárias) via slots.
import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, DollarSign, KeyRound, PackageSearch, Trash2, Wallet } from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Button, Field, IconButton, Input, Spinner, useConfirm } from "@/components/aura";
import { StayService } from "@/services/stay-service";
import type { AccountChip, ChipId, ChipState } from "@/lib/stay-account";
import type { StayAccountState } from "./useStayAccount";
import { LoanBlock, Money, NewEntry, SectionTitle, money } from "./AccountEntry";

export { money, Money, SectionTitle } from "./AccountEntry";

const CHIP_ICON: Record<ChipId, React.ElementType> = {
  payment: Wallet,
  key: KeyRound,
  loaned: PackageSearch,
  lost: PackageSearch,
};

const CHIP_TONE: Record<ChipState, Tone> = {
  ok: "green",
  alert: "red",
  warn: "amber",
  idle: "neutral",
};

export interface StayAccountPanelProps {
  a: StayAccountState;
  /** Bloco de diárias (LodgingPanel / "ativar diárias") — entra acima dos sinais. */
  lodgingSlot?: React.ReactNode;
  /** Esconde o formulário de lançamento (governança só lê). */
  readOnly?: boolean;
  /** Mostra o resumo de saldo em cartões (o modal da Conta usa; quem já tem o saldo no header passa false). */
  showTotals?: boolean;
}

export function StayAccountPanel({ a, lodgingSlot, readOnly, showTotals = true }: StayAccountPanelProps) {
  const confirm = useConfirm();
  const { folio, chips, closed, local, resolving, setResolving, busy, chargeAmount, setChargeAmount, chargeValue } = a;
  const propertyId = a.propertyId!;
  const stayId = a.stay?.id as string;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showTotals && (
        <div className="ak-fieldrow" data-cols="3">
          <Money label="Débitos" value={a.debits} color={T.text} />
          <Money label="Créditos" value={a.credits} color={T.green} />
          <Money label="Saldo" value={folio.balance} color={folio.balance > 0.005 ? T.orange : T.green} strong />
        </div>
      )}

      {closed && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: T.greenBg, border: `1px solid ${T.greenBorder}`, color: T.green, fontSize: 12, fontWeight: 800 }}>
          <CheckCircle2 size={14} />
          Conta encerrada em {format(new Date(local.billClosedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </div>
      )}

      {lodgingSlot}

      {/* Os quatro sinais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", gap: 8 }}>
        {chips.map(c => (
          <ChipCard
            key={c.id}
            chip={c}
            active={resolving === c.id}
            onClick={!readOnly && canResolve(c) ? () => setResolving(prev => (prev === c.id ? null : c.id)) : undefined}
          />
        ))}
      </div>

      {resolving && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, background: T.glass, display: "flex", flexDirection: "column", gap: 12 }}>
          {resolving === "payment" && (
            <>
              <SectionTitle>Quitar a conta</SectionTitle>
              <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
                Lance o pagamento como crédito no formulário abaixo — o saldo zera e o sinal apaga.
              </p>
              <Button variant="secondary" onClick={a.fillPayment}>
                Preencher pagamento de {money(folio.balance)}
              </Button>
            </>
          )}

          {resolving === "key" && (
            <>
              <SectionTitle>Chave não localizada</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                <Button variant="secondary" icon={KeyRound} loading={busy}
                  onClick={() => void a.runResolve(
                    () => StayService.resolveKey(propertyId, stayId, "returned", a.actorId, a.actorName),
                    { keyStatus: "returned" },
                  )}>
                  Chave devolvida
                </Button>
                <Field label="Cobrar no fólio (R$)" style={{ flex: "1 1 160px" }}>
                  <Input inputMode="decimal" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} placeholder="0,00" />
                </Field>
                <Button variant="danger" loading={busy} disabled={!chargeAmount}
                  onClick={() => void a.runResolve(
                    () => StayService.resolveKey(propertyId, stayId, "charged", a.actorId, a.actorName, { amount: chargeValue() }),
                    { keyStatus: "charged" },
                  )}>
                  Cobrar
                </Button>
              </div>
            </>
          )}

          {resolving === "loaned" && (
            <>
              <SectionTitle>Itens emprestados</SectionTitle>
              {local?.loanedItems && <p style={{ margin: 0, fontSize: 13, color: T.text }}>{local.loanedItems}</p>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                <Button variant="secondary" icon={CheckCircle2} loading={busy}
                  onClick={() => void a.runResolve(
                    () => StayService.resolveLoanedItems(propertyId, stayId, "returned", a.actorId, a.actorName),
                    { loanedItemsStatus: "returned", loanedItemsChecked: true },
                  )}>
                  Devolvido
                </Button>
                <Field label="Cobrar no fólio (R$)" style={{ flex: "1 1 160px" }}>
                  <Input inputMode="decimal" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} placeholder="0,00" />
                </Field>
                <Button variant="danger" loading={busy} disabled={!chargeAmount}
                  onClick={() => void a.runResolve(
                    () => StayService.resolveLoanedItems(propertyId, stayId, "charged", a.actorId, a.actorName, { amount: chargeValue() }),
                    { loanedItemsStatus: "charged", loanedItemsChecked: true },
                  )}>
                  Cobrar
                </Button>
              </div>
            </>
          )}

          {resolving === "lost" && (
            <>
              <SectionTitle>Objeto esquecido</SectionTitle>
              {local?.lostItemsDescription && <p style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.5 }}>{local.lostItemsDescription}</p>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {([
                  { id: "returned", label: "Devolvido ao hóspede" },
                  { id: "discarded", label: "Descartado" },
                  { id: "stored", label: "Guardado (achados e perdidos)" },
                ] as const).map(opt => (
                  <Button key={opt.id} variant="secondary" loading={busy}
                    onClick={() => void a.runResolve(
                      () => StayService.resolveLostItems(propertyId, stayId, opt.id, a.actorId, a.actorName),
                      { lostItemsResolution: opt.id },
                    )}>
                    {opt.label}
                  </Button>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 11, color: T.muted }}>
                “Guardado” mantém o sinal amarelo — o objeto ainda é do hóspede —, mas não impede encerrar a conta.
              </p>
            </>
          )}
        </div>
      )}

      {/* Emprestados com o hóspede */}
      <LoanBlock a={a} readOnly={readOnly} />

      {/* Lançamentos */}
      <div>
        <SectionTitle>Lançamentos</SectionTitle>
        {folio.loading && folio.items.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner /></div>
        ) : folio.items.length === 0 ? (
          <p style={{ fontSize: 13, color: T.muted2, fontStyle: "italic", margin: "8px 0 0" }}>Nenhum lançamento registrado.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {folio.items.map(item => {
              const credit = item.type === "credit";
              const pendingItem = item.status === "pending";
              const t = toneOf(credit ? "green" : pendingItem ? "orange" : "neutral");
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {credit ? <CheckCircle2 size={13} color={T.green} style={{ flexShrink: 0 }} /> : <DollarSign size={13} color={pendingItem ? T.orange : T.muted} style={{ flexShrink: 0 }} />}
                    <span style={{ fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</span>
                    {item.quantity > 1 && <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>×{item.quantity}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontWeight: 800, color: credit ? T.green : pendingItem ? T.orange : T.muted, fontVariantNumeric: "tabular-nums" }}>
                      {credit ? "−" : ""}{money(item.totalPrice ?? 0)}
                    </span>
                    {!closed && !readOnly && (
                      <IconButton icon={Trash2} label={`Estornar ${item.description}`} size="sm" tone="red"
                        onClick={() => void confirm({ title: "Estornar este lançamento?", description: `“${item.description}” sai do fólio. O estorno fica no histórico.`, confirmLabel: "Estornar", tone: "danger" })
                          .then(ok => { if (ok) return a.removeItem(item.id, item.description); })}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Novo lançamento: do catálogo ou avulso */}
      {!closed && !readOnly && <NewEntry a={a} />}
    </div>
  );
}

/** Sinal clicável só quando existe desfecho a dar. */
function canResolve(c: AccountChip): boolean {
  if (c.state === "idle") return false;
  if (c.id === "payment") return c.state === "alert";
  if (c.id === "key") return c.state === "alert";
  if (c.id === "loaned") return c.state === "alert";
  return c.state === "alert" || c.state === "warn";
}

function ChipCard({ chip, active, onClick }: { chip: AccountChip; active: boolean; onClick?: () => void }) {
  const t = toneOf(CHIP_TONE[chip.state]);
  const Icon = CHIP_ICON[chip.id];
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={clickable ? "ak-press ak-focus" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12,
        background: chip.state === "idle" ? T.glass : t.bg,
        border: `1px solid ${active ? t.color : chip.state === "idle" ? T.border : t.border}`,
        color: T.text, textAlign: "left", fontFamily: "inherit",
        cursor: clickable ? "pointer" : "default", minWidth: 0,
      }}
    >
      <Icon size={16} color={chip.state === "idle" ? T.muted2 : t.color} style={{ flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: chip.state === "idle" ? T.muted2 : t.color }}>{chip.label}</span>
        <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: chip.state === "idle" ? T.muted2 : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chip.detail}</span>
      </span>
    </button>
  );
}
