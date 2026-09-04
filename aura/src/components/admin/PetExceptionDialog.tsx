"use client";

// Modal de decisão do pedido de exceção à Política Pet.
//
// Existe porque decidir exigia entrar na estadia — uma tela que ninguém abre sem
// já ter motivo. Agora o sino e o painel da recepção abrem o modal direto, e a
// decisão sai de onde a pessoa já estava.
//
// As dicas do topo INFORMAM e não decidem. A direção libera exceção várias vezes
// por mês; automatizar a recusa só tiraria a decisão do sistema de novo. O que
// muda é que liberar contra a dica fica registrado com nome.
//
// Ver docs/PET-POLICY.md.
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Dog, PawPrint, Users } from "lucide-react";
import { Button, Dialog, Field, Input, T, alpha } from "@/components/aura";

export interface PetExceptionItem {
  stayId: string;
  guestName: string;
  cabinName?: string | null;
  checkIn: string;
  checkOut: string;
  pets: { name?: string; species?: string; weight?: number; breed?: string }[];
  reasons: string[];
  inBlackout: boolean;
  overlapping: { stayId: string }[];
  occupancyPct: number | null;
  petsInPeriod: number;
}

/** Acima disto a pousada está cheia o bastante para pesar na decisão. */
const OCUPACAO_ALTA = 80;

const dia = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export function PetExceptionDialog({ item, open, onClose, onDecided }: {
  item: PetExceptionItem | null;
  open: boolean;
  onClose: () => void;
  /** Chamado depois de gravar, para quem abriu recarregar a própria fila. */
  onDecided?: () => void;
}) {
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<null | "approved" | "refused">(null);

  // Trocar de pedido sem limpar os campos gravaria o autorizador de um no outro.
  useEffect(() => {
    setAuthorizedBy("");
    setNote("");
    setSaving(null);
  }, [item?.stayId]);

  if (!item) return null;

  const dicas: { icon: typeof AlertTriangle; texto: string }[] = [];
  if (item.inBlackout) {
    dicas.push({ icon: CalendarClock, texto: "Período de alta — a política prevê recusa." });
  }
  if (item.overlapping.length > 0) {
    dicas.push({
      icon: AlertTriangle,
      texto: `Já há ${item.overlapping.length} exceção aprovada com datas sobrepostas.`,
    });
  }
  if (item.occupancyPct !== null && item.occupancyPct >= OCUPACAO_ALTA) {
    dicas.push({ icon: Users, texto: `Pousada com alta ocupação no período (pico de ${item.occupancyPct}%).` });
  }
  if (item.petsInPeriod > 0) {
    dicas.push({
      icon: PawPrint,
      texto: `Já ${item.petsInPeriod === 1 ? "há 1 outro animal" : `há ${item.petsInPeriod} outros animais`} hospedado${item.petsInPeriod > 1 ? "s" : ""} no mesmo período.`,
    });
  }

  const decidir = async (decision: "approved" | "refused") => {
    if (saving) return;
    setSaving(decision);
    try {
      const res = await fetch(`/api/admin/stays/${item.stayId}/pet-exception`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, authorizedBy, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao registrar a decisão.");
      toast.success(decision === "approved" ? "Exceção aprovada." : "Exceção recusada.");
      onDecided?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      icon={Dog}
      iconTone="red"
      title="Pet fora da política"
      subtitle={`${item.guestName}${item.cabinName ? ` · ${item.cabinName}` : ""} · ${dia(item.checkIn)} a ${dia(item.checkOut)}`}
      footer={
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <Button tone="green" fullWidth loading={saving === "approved"} disabled={!!saving} onClick={() => decidir("approved")}>
            Aprovar
          </Button>
          <Button tone="red" variant="outline" fullWidth loading={saving === "refused"} disabled={!!saving} onClick={() => decidir("refused")}>
            Recusar
          </Button>
        </div>
      }
      footerRow
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>
            O que saiu da política
          </span>
          <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
            {item.reasons.length > 0
              ? item.reasons.map((r, i) => <li key={i} style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{r}</li>)
              : <li style={{ fontSize: 13, color: T.text }}>Fora da Política Pet.</li>}
          </ul>
          {item.pets.length > 0 && (
            <p style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
              {item.pets.map((p) => `${p.name || "sem nome"} (${p.species || "?"}, ${p.weight || "?"} kg)`).join(" · ")}
            </p>
          )}
        </div>

        {dicas.length > 0 && (
          <div style={{ background: alpha(T.amber, 10), border: `1px solid ${T.amberBorder}`, borderRadius: 12, padding: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase", color: T.amber }}>
              Antes de decidir
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {dicas.map((d, i) => (
                <span key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: T.text, fontWeight: 600 }}>
                  <d.icon size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                  {d.texto}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: T.muted, marginTop: 8, marginBottom: 0 }}>
              Nenhuma delas recusa sozinha — a decisão é sua, e fica registrada com o nome de quem autorizou.
            </p>
          </div>
        )}

        <Field label="Quem autorizou" hint="Nome de quem mandou aprovar ou recusar. Fica registrado ao lado do seu.">
          <Input value={authorizedBy} onChange={(e) => setAuthorizedBy(e.target.value)} placeholder="Ex.: Dona Rê" />
        </Field>
        <Field label="Motivo" hint="Opcional, mas é o que explica a decisão para quem ler depois.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: período de alta, mas cliente antigo" />
        </Field>
      </div>
    </Dialog>
  );
}
