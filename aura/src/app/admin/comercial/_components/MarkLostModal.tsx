// Modal unificado de perda: motivos curados POR TIPO de lead (orçamento e
// casamento têm listas próprias — misturar inviabiliza KPI de motivo).
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CRM_LOST_REASONS_QUOTE, CrmLead, WEDDING_LOST_REASONS } from "@/types/aura";
import { fmtBR } from "./shared";

export function MarkLostModal({ lead, busy, onCancel, onConfirm }: {
  lead: CrmLead;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const reasons = lead.entityType === "quote" ? CRM_LOST_REASONS_QUOTE : WEDDING_LOST_REASONS;
  const final = reason === "__outro__" ? custom.trim() : reason;

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="bg-background rounded-2xl w-full max-w-md p-5 space-y-3">
        <h3 className="font-bold text-foreground">
          {lead.entityType === "quote" ? "Arquivar orçamento perdido" : "Arquivar negociação perdida"}
        </h3>
        <p className="text-xs text-muted-foreground">{lead.title} · {fmtBR(lead.dateRef)}</p>
        <div className="space-y-1.5">
          {[...reasons, "__outro__"].map((r) => (
            <label key={r}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                reason === r ? "border-red-300 bg-red-50" : "border-border bg-card hover:border-foreground/30"
              }`}>
              <input type="radio" name="hub-lost" checked={reason === r} onChange={() => setReason(r)} />
              {r === "__outro__" ? "Outro motivo…" : r}
            </label>
          ))}
          {reason === "__outro__" && (
            <input autoFocus className="field-input" placeholder="Descreva o motivo"
              value={custom} onChange={(e) => setCustom(e.target.value)} />
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="outline" className="text-red-600" disabled={!final || busy}
            onClick={() => onConfirm(final)}>
            {busy && <Loader2 size={13} className="mr-1 animate-spin" />} Arquivar como perdido
          </Button>
        </div>
      </div>
    </div>
  );
}
