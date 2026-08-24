"use client";

// A Conta da estadia.
//
// Conta e fólio são a mesma coisa, e ela continua acessível depois do check-out —
// era esse o buraco: o check-out empurrava a estadia para "Encerradas" e a
// pendência financeira ia viver numa aba paralela, enquanto chave e objeto
// emprestado não apareciam em lugar nenhum.
//
// Aqui os quatro sinais ficam lado a lado: pagamento, chave, empréstimos e
// objetos esquecidos. Eles avisam, não travam — "Encerrar conta" continua
// clicável, mas a confirmação diz em letras o que fica para trás, e isso vai
// para a auditoria.
import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2, DollarSign, KeyRound, PackageSearch, Receipt, RotateCcw, Trash2, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Button, Dialog, Field, IconButton, Input, Select, Spinner, useConfirm } from "@/components/aura";
import { StayService } from "@/services/stay-service";
import { accountChips, openChips, type AccountChip, type ChipId, type ChipState } from "@/lib/stay-account";
import { useFolio } from "./folio/useFolio";

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

const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export interface StayAccountModalProps {
  open: boolean;
  onClose: () => void;
  /** Estadia da lista (já traz cabinName/guestName e os campos da conta). */
  stay: any;
  propertyId: string;
  actor: { id?: string; name?: string };
  /** Recarrega a lista depois de qualquer mudança. */
  onChanged?: () => void;
}

export function StayAccountModal({ open, onClose, stay, propertyId, actor, onChanged }: StayAccountModalProps) {
  const confirm = useConfirm();
  const folio = useFolio(propertyId, stay?.id, actor, open);

  // Cópia local: resolver um chip precisa refletir na hora, sem esperar o
  // recarregamento da lista inteira.
  const [local, setLocal] = useState<any>(stay);
  useEffect(() => { setLocal(stay); }, [stay]);

  const [resolving, setResolving] = useState<ChipId | null>(null);
  const [busy, setBusy] = useState(false);
  const [chargeAmount, setChargeAmount] = useState("");

  // Formulário de lançamento
  const [kind, setKind] = useState<"debit" | "credit">("debit");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");

  const chips = useMemo(() => accountChips(local ?? {}, folio.items), [local, folio.items]);
  const pending = openChips(chips);
  const closed = !!local?.billClosedAt;

  const debits = folio.items.filter(i => i.type !== "credit").reduce((a, i) => a + (i.totalPrice ?? 0), 0);
  const credits = folio.items.filter(i => i.type === "credit").reduce((a, i) => a + (i.totalPrice ?? 0), 0);

  if (!stay) return null;

  const patchLocal = (p: Record<string, unknown>) => setLocal((prev: any) => ({ ...prev, ...p }));

  const afterChange = () => { setResolving(null); setChargeAmount(""); onChanged?.(); };

  const runResolve = async (fn: () => Promise<void>, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fn();
      patchLocal(patch);
      afterChange();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.endsWith("_CHARGE_INVALID") ? "Informe um valor maior que zero." : "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  };

  const chargeValue = () => Math.round(parseFloat(chargeAmount.replace(",", ".")) * 100) / 100;

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Math.round(parseFloat(price.replace(",", ".")) * 100) / 100;
    if (!desc.trim() || !(value > 0)) { toast.error("Preencha descrição e valor."); return; }
    if (kind === "credit") await folio.addCredit(desc.trim(), value * (qty || 1));
    else await folio.addDebit(desc.trim(), qty || 1, value);
    setDesc(""); setQty(1); setPrice("");
    onChanged?.();
  };

  const handleClose = async () => {
    const summary = pending.map(c => `${c.label.toLowerCase()} (${c.detail})`).join(" · ");
    const ok = await confirm({
      title: "Encerrar a conta desta estadia?",
      description: pending.length
        ? `Fica para trás: ${summary}. Os lançamentos pendentes serão marcados como pagos e a estadia vai para Encerradas.`
        : "Ciclo completo. Os lançamentos pendentes serão marcados como pagos e a estadia vai para Encerradas.",
      confirmLabel: "Encerrar conta",
      tone: pending.length ? "danger" : undefined,
      icon: Receipt,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await StayService.closeStayBill(propertyId, stay.id, actor.id || "unknown", actor.name || "Recepção", summary || undefined);
      toast.success("Conta encerrada.");
      onChanged?.();
      onClose();
    } catch {
      toast.error("Erro ao encerrar a conta.");
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    setBusy(true);
    try {
      await StayService.reopenStayBill(propertyId, stay.id, actor.id || "unknown", actor.name || "Recepção");
      patchLocal({ billClosedAt: null });
      toast.success("Conta reaberta.");
      onChanged?.();
    } catch {
      toast.error("Erro ao reabrir a conta.");
    } finally {
      setBusy(false);
    }
  };

  const period = stay.checkIn
    ? `${format(new Date(stay.checkIn), "dd MMM", { locale: ptBR })} — ${stay.checkOut ? format(new Date(stay.checkOut), "dd MMM", { locale: ptBR }) : "?"}`
    : "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      presentation="auto"
      size="lg"
      icon={Receipt}
      iconTone={folio.balance > 0.005 ? "orange" : "brand"}
      title={`Conta · ${stay.cabinName || "Sem cabana"}`}
      subtitle={`${stay.guestName || "Hóspede"}${period ? ` · ${period}` : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          {closed ? (
            <Button variant="secondary" icon={RotateCcw} onClick={() => void handleReopen()} loading={busy}>Reabrir conta</Button>
          ) : (
            <Button variant="primary" icon={CheckCircle2} onClick={() => void handleClose()} loading={busy}>Encerrar conta</Button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Saldo */}
        <div className="ak-fieldrow" data-cols="3">
          <Money label="Débitos" value={debits} color={T.text} />
          <Money label="Créditos" value={credits} color={T.green} />
          <Money label="Saldo" value={folio.balance} color={folio.balance > 0.005 ? T.orange : T.green} strong />
        </div>

        {closed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: T.greenBg, border: `1px solid ${T.greenBorder}`, color: T.green, fontSize: 12, fontWeight: 800 }}>
            <CheckCircle2 size={14} />
            Conta encerrada em {format(new Date(local.billClosedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
        )}

        {/* Os quatro sinais */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", gap: 8 }}>
          {chips.map(c => (
            <ChipCard
              key={c.id}
              chip={c}
              active={resolving === c.id}
              onClick={canResolve(c) ? () => setResolving(prev => (prev === c.id ? null : c.id)) : undefined}
            />
          ))}
        </div>

        {resolving && (
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, background: T.glass, display: "flex", flexDirection: "column", gap: 12 }}>
            {resolving === "payment" && (
              <>
                <SectionTitle>Quitar a conta</SectionTitle>
                <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
                  Lance o pagamento como crédito no formulário abaixo — o saldo zera e o chip apaga.
                </p>
                <Button variant="secondary" onClick={() => { setKind("credit"); setDesc("Pagamento"); setPrice(String(folio.balance.toFixed(2))); setResolving(null); }}>
                  Preencher pagamento de {money(folio.balance)}
                </Button>
              </>
            )}

            {resolving === "key" && (
              <>
                <SectionTitle>Chave não localizada</SectionTitle>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                  <Button variant="secondary" icon={KeyRound} loading={busy}
                    onClick={() => void runResolve(
                      () => StayService.resolveKey(propertyId, stay.id, "returned", actor.id || "unknown", actor.name || "Recepção"),
                      { keyStatus: "returned" },
                    )}>
                    Chave devolvida
                  </Button>
                  <Field label="Cobrar no fólio (R$)" style={{ flex: "1 1 160px" }}>
                    <Input inputMode="decimal" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} placeholder="0,00" />
                  </Field>
                  <Button variant="danger" loading={busy} disabled={!chargeAmount}
                    onClick={() => void runResolve(
                      () => StayService.resolveKey(propertyId, stay.id, "charged", actor.id || "unknown", actor.name || "Recepção", { amount: chargeValue() }),
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
                    onClick={() => void runResolve(
                      () => StayService.resolveLoanedItems(propertyId, stay.id, "returned", actor.id || "unknown", actor.name || "Recepção"),
                      { loanedItemsStatus: "returned", loanedItemsChecked: true },
                    )}>
                    Devolvido
                  </Button>
                  <Field label="Cobrar no fólio (R$)" style={{ flex: "1 1 160px" }}>
                    <Input inputMode="decimal" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} placeholder="0,00" />
                  </Field>
                  <Button variant="danger" loading={busy} disabled={!chargeAmount}
                    onClick={() => void runResolve(
                      () => StayService.resolveLoanedItems(propertyId, stay.id, "charged", actor.id || "unknown", actor.name || "Recepção", { amount: chargeValue() }),
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
                      onClick={() => void runResolve(
                        () => StayService.resolveLostItems(propertyId, stay.id, opt.id, actor.id || "unknown", actor.name || "Recepção"),
                        { lostItemsResolution: opt.id },
                      )}>
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 11, color: T.muted }}>
                  “Guardado” mantém o chip amarelo — o objeto ainda é do hóspede —, mas não impede encerrar a conta.
                </p>
              </>
            )}
          </div>
        )}

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
                      {!closed && (
                        <IconButton icon={Trash2} label={`Estornar ${item.description}`} size="sm" tone="red"
                          onClick={() => void confirm({ title: "Estornar este lançamento?", description: `“${item.description}” sai do fólio. O estorno fica no histórico.`, confirmLabel: "Estornar", tone: "danger" })
                            .then(ok => { if (ok) return folio.remove(item.id, item.description).then(() => onChanged?.()); })}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Novo lançamento */}
        {!closed && (
          <form onSubmit={handleSubmitEntry} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionTitle>Novo lançamento</SectionTitle>
            <div className="ak-fieldrow" data-cols="2">
              <Field label="Tipo">
                <Select value={kind} onChange={e => setKind(e.target.value as "debit" | "credit")}>
                  <option value="debit">Débito (consumo/serviço)</option>
                  <option value="credit">Crédito (pagamento)</option>
                </Select>
              </Field>
              <Field label={kind === "credit" ? "Descrição do pagamento" : "Produto / serviço"}>
                <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={kind === "credit" ? "Ex: Pix hospedagem" : "Ex: Lenha extra"} />
              </Field>
            </div>
            <div className="ak-fieldrow" data-cols="3">
              {kind === "debit" && (
                <Field label="Quantidade">
                  <Input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))} />
                </Field>
              )}
              <Field label={kind === "credit" ? "Valor (R$)" : "Valor unitário (R$)"}>
                <Input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="&nbsp;">
                <Button type="submit" variant={kind === "credit" ? "primary" : "secondary"} loading={folio.loading} fullWidth>
                  {kind === "credit" ? "Lançar pagamento" : "Adicionar à conta"}
                </Button>
              </Field>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}

/** Chip clicável só quando existe desfecho a dar. */
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

function Money({ label, value, color, strong }: { label: string; value: number; color: string; strong?: boolean }) {
  return (
    <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>{label}</div>
      <div style={{ fontSize: strong ? 19 : 16, fontWeight: 900, color, marginTop: 2, letterSpacing: "-.3px", fontVariantNumeric: "tabular-nums" }}>{money(value)}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>{children}</div>;
}
