"use client";

// "Onde está a chave?" — passo obrigatório do check-out.
//
// Vivia dentro dos diálogos da página de detalhe da estadia, amarrado ao
// `StayDetailState`. A lista de Ativas passou a oferecer check-out direto no
// cartão/linha, e o mesmo passo tem que aparecer nos dois lugares — então ele
// virou um componente que só recebe o que precisa.
//
// Fechar no X, no Esc ou clicando fora não faz nada: só "Confirmar check-out"
// executa.
import React, { useEffect, useState } from "react";
import { CheckCircle, KeyRound, LogOut } from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Button, Dialog } from "@/components/aura";

export type KeyLocation = "reception" | "cabin" | "unknown";

const KEY_OPTIONS: { value: KeyLocation; label: string; desc: string; tone: Tone }[] = [
  { value: "reception", label: "Na recepção", desc: "Hóspede devolveu a chave", tone: "green" },
  { value: "cabin", label: "Na acomodação", desc: "Chave ficou no quarto", tone: "red" },
  { value: "unknown", label: "Não sabemos", desc: "Localização desconhecida", tone: "red" },
];

export interface CheckoutKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (keyLocation: KeyLocation) => void | Promise<void>;
  /** Ex.: "Cabana 7 · Ana Silva" — contexto quando o diálogo abre de uma lista. */
  context?: string;
  saving?: boolean;
}

export function CheckoutKeyDialog({ open, onClose, onConfirm, context, saving }: CheckoutKeyDialogProps) {
  const [keyLocation, setKeyLocation] = useState<KeyLocation | null>(null);

  // Cada abertura começa em branco — a escolha da estadia anterior não vaza.
  useEffect(() => { if (open) setKeyLocation(null); }, [open]);

  return (
    <Dialog
      open={open} onClose={onClose} presentation="auto" size="sm"
      icon={KeyRound} iconTone="brand" title="Localização da chave"
      subtitle={context ?? "Onde está a chave da acomodação?"}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={LogOut} onClick={() => keyLocation && void onConfirm(keyLocation)} disabled={!keyLocation} loading={saving}>
            Confirmar check-out
          </Button>
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
