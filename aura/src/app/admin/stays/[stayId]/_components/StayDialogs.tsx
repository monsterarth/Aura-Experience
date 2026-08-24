"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { Dialog, Button } from "@/components/aura";
import { CheckoutKeyDialog as SharedCheckoutKeyDialog } from "@/components/admin/CheckoutKeyDialog";
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

/** Check-out: onde está a chave? O passo em si vive em `@/components/admin/CheckoutKeyDialog` (a lista de Ativas usa o mesmo). */
export function CheckoutKeyDialog({ s }: { s: StayDetailState }) {
  const { checkOutModalOpen, setCheckOutModalOpen, handleConfirmCheckOut, isSaving } = s;
  return (
    <SharedCheckoutKeyDialog
      open={checkOutModalOpen}
      onClose={() => setCheckOutModalOpen(false)}
      onConfirm={loc => void handleConfirmCheckOut(loc)}
      saving={isSaving}
    />
  );
}
