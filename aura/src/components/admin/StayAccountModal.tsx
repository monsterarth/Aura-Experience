"use client";

// A Conta da estadia.
//
// Conta e fólio são a mesma coisa, e ela continua acessível depois do check-out —
// era esse o buraco: o check-out empurrava a estadia para "Encerradas" e a
// pendência financeira ia viver numa aba paralela, enquanto chave e objeto
// emprestado não apareciam em lugar nenhum.
//
// O miolo (saldo, os quatro sinais, lançamentos) mora em `folio/StayAccountPanel`
// e é o MESMO que a ficha rápida e a ficha completa mostram — aqui fica só a
// moldura: título, e o botão de encerrar/reabrir no rodapé.
import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Receipt, RotateCcw } from "lucide-react";
import { Button, Dialog, useConfirm } from "@/components/aura";
import { useStayAccount } from "./folio/useStayAccount";
import { StayAccountPanel } from "./folio/StayAccountPanel";

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
  const a = useStayAccount(propertyId, stay, actor, open, onChanged);

  if (!stay) return null;

  const handleClose = async () => {
    const summary = a.pending.map(c => `${c.label.toLowerCase()} (${c.detail})`).join(" · ");
    const ok = await confirm({
      title: "Encerrar a conta desta estadia?",
      description: a.pending.length
        ? `Fica para trás: ${summary}. Os lançamentos pendentes serão marcados como pagos e a estadia vai para Encerradas.`
        : "Ciclo completo. Os lançamentos pendentes serão marcados como pagos e a estadia vai para Encerradas.",
      confirmLabel: "Encerrar conta",
      tone: a.pending.length ? "danger" : undefined,
      icon: Receipt,
    });
    if (!ok) return;
    if (await a.closeBill(summary || undefined)) onClose();
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
      iconTone={a.folio.balance > 0.005 ? "orange" : "brand"}
      title={`Conta · ${stay.cabinName || "Sem cabana"}`}
      subtitle={`${stay.guestName || "Hóspede"}${period ? ` · ${period}` : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          {a.closed ? (
            <Button variant="secondary" icon={RotateCcw} onClick={() => void a.reopenBill()} loading={a.busy}>Reabrir conta</Button>
          ) : (
            <Button variant="primary" icon={CheckCircle2} onClick={() => void handleClose()} loading={a.busy}>Encerrar conta</Button>
          )}
        </>
      }
    >
      <StayAccountPanel a={a} />
    </Dialog>
  );
}
