"use client";

import React from "react";
import { CheckCircle, KeyRound, LogOut, Sparkles } from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Dialog, Button } from "@/components/aura";
import type { KeyLocation } from "./stay-detail-utils";
import type { StayDetailState } from "./useStayDetail";

/** Troca de acomodação com hóspede já hospedado: gerar faxina ou só liberar. */
export function TransferDialog({ s }: { s: StayDetailState }) {
  const { transferDialogOpen, setTransferDialogOpen, pendingTransferCabinId, setPendingTransferCabinId, doSave } = s;
  const close = () => { setTransferDialogOpen(false); setPendingTransferCabinId(null); };
  const go = async (disposition: "cleaning" | "available") => { setTransferDialogOpen(false); await doSave(pendingTransferCabinId, disposition); setPendingTransferCabinId(null); };
  return (
    <Dialog
      open={transferDialogOpen} onClose={close} presentation="auto" size="sm"
      icon={Sparkles} iconTone="amber" title="Mudança de acomodação"
      subtitle="O hóspede já fez check-in. A cabana anterior precisa de faxina de troca?"
      footer={(
        <>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="secondary" onClick={() => void go("available")}>Só liberar</Button>
          <Button variant="primary" tone="amber" onClick={() => void go("cleaning")}>Gerar faxina</Button>
        </>
      )}
    >
      <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>Gerar faxina cria uma tarefa para a governança; só liberar coloca a cabana como disponível na hora.</p>
    </Dialog>
  );
}

const KEY_OPTIONS: { value: KeyLocation; label: string; desc: string; tone: Tone }[] = [
  { value: "reception", label: "Na recepção", desc: "Hóspede devolveu a chave", tone: "green" },
  { value: "cabin", label: "Na acomodação", desc: "Chave ficou no quarto", tone: "red" },
  { value: "unknown", label: "Não sabemos", desc: "Localização desconhecida", tone: "red" },
];

/** Check-out: onde está a chave? */
export function CheckoutKeyDialog({ s }: { s: StayDetailState }) {
  const { checkOutModalOpen, setCheckOutModalOpen, keyLocation, setKeyLocation, handleConfirmCheckOut, isSaving } = s;
  return (
    <Dialog
      open={checkOutModalOpen} onClose={() => setCheckOutModalOpen(false)} presentation="auto" size="sm"
      icon={KeyRound} iconTone="brand" title="Localização da chave" subtitle="Onde está a chave da acomodação?"
      footer={(
        <>
          <Button variant="secondary" onClick={() => setCheckOutModalOpen(false)}>Cancelar</Button>
          <Button variant="primary" icon={LogOut} onClick={() => void handleConfirmCheckOut()} disabled={!keyLocation} loading={isSaving}>Confirmar check-out</Button>
        </>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {KEY_OPTIONS.map(opt => {
          const t = toneOf(opt.tone);
          const sel = keyLocation === opt.value;
          return (
            <button key={opt.value} type="button" className="ak-press ak-focus" onClick={() => setKeyLocation(opt.value)} aria-pressed={sel}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: sel ? t.bg : T.glass, border: `2px solid ${sel ? t.color : T.border}`, color: T.text, minHeight: 56 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{opt.label}</span>
                <span style={{ display: "block", fontSize: 12, color: T.muted }}>{opt.desc}</span>
              </span>
              {sel && <CheckCircle size={18} color={t.color} />}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
