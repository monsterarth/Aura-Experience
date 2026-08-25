// src/components/admin/StayDetailsModal.tsx
//
// FICHA RÁPIDA da estadia (reforma 08/2026) — o que a recepção precisa DE RELANCE:
// datas, quem está na cabana (todos nomeados, pets incluídos), origem da reserva,
// pendências operacionais (chave, empréstimos, concierge aberto) e a conta.
// Detalhe fica na Ficha Completa (/admin/stays/[stayId]): FNRH, viagem, montagem
// do quarto, endereço — nada disso mora aqui, de propósito.
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Edit2, Save, Calendar, User, Phone, Users, CheckCircle, Clock, Car,
  PawPrint, Trash2, LogIn, LogOut, RotateCcw, Sparkles, Receipt, RefreshCw,
  ShoppingCart, BedDouble, ArrowRight, Search, UserRoundPen, KeyRound, Package,
  FileText, ExternalLink, Plus,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { StayService } from "@/services/stay-service";
import { FinanceService } from "@/services/finance-service";
import { LodgingPanel } from "./LodgingPanel";
import { chatwootSyncOnCabinTransfer, chatwootSyncOnCheckIn, chatwootSyncOnCheckOut } from "@/app/actions/chatwoot-actions";
import { GuestService } from "@/services/guest-service";
import { CabinService } from "@/services/cabin-service";
import { ContactService } from "@/services/contact-service";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { Dialog } from "@/components/aura/Dialog";
import { useConfirm } from "@/components/aura/ConfirmDialog";
import {
  T, alpha, tone as toneOf, Button, IconButton, Pill, Card, SectionLabel,
  Field, FieldRow, Input, Select,
} from "@/components/aura";
import { stayDisplayName } from "@/lib/stay-display";
import { readPets } from "@/lib/pets";
import { useFolio } from "./folio/useFolio";
import { supabase } from "@/lib/supabase";
import { extractTimeHHMM, combineDateAndTimeISO, DEFAULT_CHECK_IN_TIME, DEFAULT_CHECK_OUT_TIME } from "@/lib/stay-times";
import { StayOriginPills, StayPendingCard } from "./StayOpsBlocks";
import { Stay, Guest, Cabin } from "@/types/aura";

interface StayDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stay: Stay & { guestName?: string; cabinName?: string };
  guest: Guest | null; // null em estadias de uso da casa (internalUse, sem titular)
  onViewGuest?: (guestId: string) => void;
  onUpdate?: () => void;
}

const STATUS: Record<string, { label: string; tone: "amber" | "blue" | "green" | "neutral" | "red" }> = {
  pending: { label: "Pendente", tone: "amber" },
  pre_checkin_done: { label: "Pré check-in OK", tone: "blue" },
  active: { label: "Hospedado", tone: "green" },
  finished: { label: "Encerrado", tone: "neutral" },
  cancelled: { label: "Cancelado", tone: "red" },
};
const COMPANION_LABEL: Record<string, string> = { adult: "Adulto", child: "Criança", free: "Bebê", baby: "Bebê" };
const COMPANION_TONE: Record<string, "brand" | "blue" | "orange"> = { adult: "brand", child: "blue", free: "orange", baby: "orange" };

const formatDateForInput = (timestamp: any) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function StayDetailsModal({ isOpen, onClose, stay, guest, onViewGuest, onUpdate }: StayDetailsModalProps) {
  const { userData } = useAuth();
  const isGovOnly = userData?.role === "governance";

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [checkOutStep, setCheckOutStep] = useState<"key" | "loaned">("key");
  const [keyLocation, setKeyLocation] = useState<"reception" | "cabin" | null>(null);
  const [hasLoanedItems, setHasLoanedItems] = useState<boolean | null>(null);
  const [loanedItemsText, setLoanedItemsText] = useState("");

  // Rascunho de edição — SÓ o que o modal edita (o resto é da Ficha Completa).
  const [formData, setFormData] = useState<Partial<Stay>>({});
  const [phoneDraft, setPhoneDraft] = useState("");
  const [cabins, setCabins] = useState<Cabin[]>([]);

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [pendingTransferCabinId, setPendingTransferCabinId] = useState<string | null>(null);

  const [showReassign, setShowReassign] = useState(false);
  const [reassignSearch, setReassignSearch] = useState("");
  const [reassignResults, setReassignResults] = useState<Guest[]>([]);
  const [reassignLoading, setReassignLoading] = useState(false);

  const [checkInStr, setCheckInStr] = useState("");
  const [checkOutStr, setCheckOutStr] = useState("");
  const [checkInTimeStr, setCheckInTimeStr] = useState("");
  const [checkOutTimeStr, setCheckOutTimeStr] = useState("");

  const isCoreFieldLocked = !isEditing || isGovOnly;

  // Fólio (carga, realtime e lançamentos) — hook compartilhado com o modal da Conta.
  const folio = useFolio(stay?.propertyId, stay?.id, { id: userData?.id, name: userData?.fullName }, isOpen);
  const folioItems = folio.items;
  const loadFolio = folio.reload;
  const [savingFolio, setSavingFolio] = useState(false);
  const loadingFolio = folio.loading || savingFolio;
  const [newFolioItem, setNewFolioItem] = useState({ description: "", quantity: 1, unitPrice: 0 });
  const [newFolioKind, setNewFolioKind] = useState<"debit" | "credit">("debit");
  const [rateInput, setRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  // Esc fica de fora: este modal abre sub-modais (check-out, transferência).
  const { requestClose, confirmDiscard, guardProps, reset } = useCloseGuard(onClose, { open: isOpen, escape: false });
  const confirm = useConfirm();

  useEffect(() => {
    if (isOpen && stay?.propertyId) {
      CabinService.getCabinsByProperty(stay.propertyId).then(setCabins);
    }
  }, [isOpen, stay?.propertyId]);

  const initData = useCallback(() => {
    if (!stay) return;
    setCheckInStr(formatDateForInput(stay.checkIn));
    setCheckOutStr(formatDateForInput(stay.checkOut));
    setCheckInTimeStr(extractTimeHHMM(stay.checkIn) || DEFAULT_CHECK_IN_TIME);
    setCheckOutTimeStr(extractTimeHHMM(stay.checkOut) || DEFAULT_CHECK_OUT_TIME);
    setFormData({
      cabinId: stay.cabinId,
      expectedArrivalTime: stay.expectedArrivalTime || "",
      counts: stay.counts || { adults: 1, children: 0, babies: 0 },
      vehiclePlate: stay.vehiclePlate || "",
    });
    setPhoneDraft(guest?.phone || "");
  }, [stay, guest]);

  useEffect(() => { initData(); }, [initData]);

  // ── Fólio ──────────────────────────────────────────────────────────────────
  const handleAddFolioItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolioItem.description || newFolioItem.quantity <= 0 || newFolioItem.unitPrice < 0) {
      return toast.error("Preencha os campos do item corretamente.");
    }
    if (newFolioKind === "credit") {
      await folio.addCredit(newFolioItem.description, newFolioItem.quantity * newFolioItem.unitPrice);
    } else {
      await folio.addDebit(newFolioItem.description, newFolioItem.quantity, newFolioItem.unitPrice);
    }
    setNewFolioItem({ description: "", quantity: 1, unitPrice: 0 });
    setNewFolioKind("debit");
    if (onUpdate) onUpdate();
  };

  const handleSetRate = async () => {
    const nightly = parseFloat(rateInput);
    if (!(nightly > 0)) return toast.error("Informe o valor da diária.");
    const nights = Math.max(1, Math.round(
      (new Date(stay.checkOut.slice(0, 10) + "T12:00:00").getTime() -
        new Date(stay.checkIn.slice(0, 10) + "T12:00:00").getTime()) / 86400000
    ));
    setSavingRate(true);
    try {
      const posted = await FinanceService.setStayRate(
        stay.propertyId, stay.id, nightly, Math.round(nightly * nights * 100) / 100,
        userData?.id || "unknown", userData?.fullName || "Recepção"
      );
      stay.nightlyRate = nightly;
      stay.lodgingTotal = Math.round(nightly * nights * 100) / 100;
      toast.success(posted > 0
        ? `Diária definida — ${posted} noite(s) vencida(s) lançada(s).`
        : "Diária definida — as noites entram no fólio automaticamente.");
      setRateInput("");
      loadFolio();
    } catch {
      toast.error("Erro ao definir a diária.");
    } finally {
      setSavingRate(false);
    }
  };

  const handleDeleteFolioItem = async (itemId: string, description: string) => {
    if (!(await confirm({ title: "Estornar este lançamento?", description: "Remove “" + description + "” do fólio. O estorno fica registrado no histórico.", confirmLabel: "Estornar", tone: "danger" }))) return;
    await folio.remove(itemId, description);
    if (onUpdate) onUpdate();
  };

  const handleToggleFolioStatus = async (itemId: string, currentStatus: string) => {
    const newStatus = currentStatus === "paid" ? "pending" : "paid";
    setSavingFolio(true);
    try {
      await StayService.toggleFolioItemStatus(
        stay.propertyId, stay.id, itemId, newStatus as "pending" | "paid", userData?.id || "unknown", userData?.fullName || "Recepção"
      );
      toast.success(newStatus === "paid" ? "Item baixado!" : "Item reaberto.");
      void loadFolio();
      if (onUpdate) onUpdate();
    } catch {
      toast.error("Erro ao atualizar status do item.");
    } finally {
      setSavingFolio(false);
    }
  };

  // ── Alterar titular ────────────────────────────────────────────────────────
  const reassignDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!stay?.propertyId) return;
    if (reassignDebounceRef.current) clearTimeout(reassignDebounceRef.current);
    if (reassignSearch.trim().length < 2) { setReassignResults([]); return; }
    reassignDebounceRef.current = setTimeout(async () => {
      setReassignLoading(true);
      try {
        const results = await GuestService.listGuests(stay.propertyId, reassignSearch.trim());
        setReassignResults(results.filter(g => g.id !== guest?.id));
      } catch (err) {
        console.error("[ReassignSearch]", err);
        setReassignResults([]);
      } finally { setReassignLoading(false); }
    }, 300);
  }, [reassignSearch, stay?.propertyId, guest?.id]);

  if (!stay) return null;

  const handleCancel = async () => {
    if (!(await confirmDiscard())) return;
    initData();
    setIsEditing(false);
    setShowReassign(false);
    setReassignSearch("");
    setReassignResults([]);
  };

  // ── Salvar (datas, cabana, pax, ETA, placa, telefone) ─────────────────────
  const handleSave = async () => {
    const cabinChanged = formData.cabinId !== stay.cabinId;
    const isUnassigning = cabinChanged && !formData.cabinId;
    const isTransferring = cabinChanged && !!formData.cabinId;

    if (isTransferring && stay.status === "active") {
      setPendingTransferCabinId(formData.cabinId!);
      setTransferDialogOpen(true);
      return;
    }
    await doSave(isTransferring ? formData.cabinId! : null, isUnassigning, null);
  };

  const doSave = async (newCabinId: string | null, unassignCabin: boolean, oldCabinDisposition: "cleaning" | "available" | null) => {
    setLoading(true);
    try {
      const parsedCheckIn = combineDateAndTimeISO(checkInStr, checkInTimeStr, DEFAULT_CHECK_IN_TIME);
      const parsedCheckOut = combineDateAndTimeISO(checkOutStr, checkOutTimeStr, DEFAULT_CHECK_OUT_TIME);

      const stayPayload: Partial<Stay> = {
        expectedArrivalTime: formData.expectedArrivalTime,
        counts: formData.counts,
        vehiclePlate: formData.vehiclePlate,
        checkIn: parsedCheckIn || stay.checkIn,
        checkOut: parsedCheckOut || stay.checkOut,
      };

      const ops: Promise<any>[] = [
        StayService.updateStayData(stay.propertyId, stay.id, stayPayload, userData?.id || "ADMIN", userData?.fullName || "Recepção"),
      ];

      // Uso da casa não tem titular — só sincroniza o hóspede quando ele existe.
      if (guest && phoneDraft !== (guest.phone || "")) {
        ops.push(GuestService.upsertGuest(stay.propertyId, { ...guest, phone: phoneDraft } as Guest, userData?.id || "ADMIN", userData?.fullName || "Recepção"));
      }

      if (unassignCabin) {
        ops.push(StayService.unassignCabin(stay.propertyId, stay.id, userData?.id || "ADMIN", userData?.fullName || "Recepção"));
      } else if (newCabinId && oldCabinDisposition) {
        ops.push(StayService.transferCabin(stay.propertyId, stay.id, newCabinId, oldCabinDisposition, userData?.id || "ADMIN", userData?.fullName || "Recepção"));
      } else if (newCabinId && stay.status !== "active") {
        ops.push(StayService.transferCabin(stay.propertyId, stay.id, newCabinId, "available", userData?.id || "ADMIN", userData?.fullName || "Recepção"));
      }

      await Promise.all(ops);

      if (newCabinId) {
        chatwootSyncOnCabinTransfer(stay.id, newCabinId).catch(() => {});
      }

      // Migra contato/mensagens se o telefone mudou.
      const oldPhone = guest?.phone || "";
      if (guest && oldPhone && phoneDraft && ContactService.formatPhoneId(oldPhone) !== ContactService.formatPhoneId(phoneDraft)) {
        await ContactService.migrateContactPhone(stay.propertyId, oldPhone, phoneDraft, guest.fullName || "", guest.id);
      }

      toast.success("Ficha da hospedagem atualizada!");
      reset();
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error(error);
      const msg = error?.message ?? "";
      if (msg.startsWith("CABIN_NOT_AVAILABLE")) {
        const label = msg.split(":")[2] ?? "indisponível";
        toast.error(`Transferência bloqueada: acomodação ${label}. Verifique antes de prosseguir.`);
      } else {
        toast.error("Erro ao salvar alterações.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Check-in / Check-out ───────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!(await confirm({ title: "Confirmar check-in?", description: "O hóspede entra na acomodação agora e a cabana passa a ocupada.", confirmLabel: "Fazer check-in" }))) return;
    setLoading(true);
    try {
      await StayService.performCheckIn(stay.propertyId, stay.id, userData?.id || "ADMIN", userData?.fullName || "Recepção");
      chatwootSyncOnCheckIn(stay.id).catch(() => {});
      toast.success("Check-in realizado com sucesso!");
      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error(error);
      const msg = error?.message ?? "";
      if (msg.startsWith("CABIN_NOT_AVAILABLE")) {
        const statusMap: Record<string, string> = {
          occupied: "ocupada por outra estadia",
          cleaning: "em limpeza",
          maintenance: "em manutenção",
        };
        toast.error(`Check-in bloqueado: acomodação ${statusMap[msg.split(":")[1] ?? ""] ?? "indisponível"}. Verifique antes de prosseguir.`);
      } else if (msg.startsWith("CHECKIN_")) {
        toast.error("Check-in não foi gravado. Nada foi alterado — tente novamente.");
      } else {
        toast.error("Erro ao realizar check-in.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCheckOut = () => {
    if (stay.status === "active") {
      setKeyLocation(null);
      setCheckOutModalOpen(true);
    } else {
      handleUndoCheckOut();
    }
  };

  const handleUndoCheckOut = async () => {
    if (!stay.cabinId) { toast.error("Não é possível reativar uma estadia sem cabana atribuída."); return; }
    if (!(await confirm({ title: "Reativar esta estadia?", description: "A cabana volta a ficar ocupada por este hóspede.", confirmLabel: "Reativar" }))) return;
    setLoading(true);
    try {
      await StayService.undoCheckOut(stay.propertyId, stay.id, stay.cabinId, userData?.id || "ADMIN", userData?.fullName || "Recepção");
      toast.success("Estadia reativada com sucesso!");
      if (onUpdate) onUpdate();
    } catch {
      toast.error("Erro ao reativar estadia.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCheckOut = async () => {
    if (!keyLocation) return;
    setCheckOutModalOpen(false);
    setLoading(true);
    try {
      await StayService.performCheckOut(stay.propertyId, stay.id, userData?.id || "ADMIN", userData?.fullName || "Recepção", keyLocation);
      if (hasLoanedItems && loanedItemsText.trim()) {
        await supabase.from("stays").update({ loanedItems: loanedItemsText.trim() }).eq("id", stay.id);
      }
      chatwootSyncOnCheckOut(stay.id).catch(() => {});
      toast.success("Check-out realizado com sucesso!");
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao realizar check-out.");
    } finally {
      setLoading(false);
      setCheckOutStep("key");
      setKeyLocation(null);
      setHasLoanedItems(null);
      setLoanedItemsText("");
    }
  };

  const handleReassignGuest = async (newGuest: Guest) => {
    if (!(await confirm({ title: "Alterar titular da reserva?", description: "A reserva passa a ser de " + newGuest.fullName + ".", confirmLabel: "Alterar titular" }))) return;
    setLoading(true);
    try {
      await StayService.reassignGuest(stay.propertyId, stay.id, newGuest.id, userData?.id || "ADMIN", userData?.fullName || "Recepção");
      toast.success(`Titular alterado para ${newGuest.fullName}`);
      setShowReassign(false);
      setReassignSearch("");
      setReassignResults([]);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao alterar titular.");
    } finally { setLoading(false); }
  };

  // ── Dados derivados da visão ───────────────────────────────────────────────
  const st = STATUS[stay.status] ?? { label: stay.status, tone: "neutral" as const };
  const { debits: folioDebits, credits: folioCredits, balance: folioBalance } = FinanceService.summarize(folioItems);
  const companions = (stay.additionalGuests ?? []).filter(c => c.fullName?.trim() && c.fullName !== "ACOMPANHANTE");
  const unnamedCompanions = (stay.additionalGuests ?? []).length - companions.length;
  const pets = readPets(stay);
  const counts = formData.counts ?? stay.counts ?? { adults: 1, children: 0, babies: 0 };
  const nights = stay.checkIn && stay.checkOut
    ? Math.max(1, Math.round((new Date(stay.checkOut.slice(0, 10) + "T12:00").getTime() - new Date(stay.checkIn.slice(0, 10) + "T12:00").getTime()) / 86400000))
    : 0;
  const totalPax = (counts.adults ?? 0) + (counts.children ?? 0) + (counts.babies ?? 0);

  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const cellLabel = (icon: React.ReactNode, label: string) => (
    <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ color: T.brandText, opacity: .85, display: "inline-flex" }}>{icon}</span>{label}
    </SectionLabel>
  );
  const big = (txt: React.ReactNode, isMono?: boolean) => (
    <span style={{ fontSize: 17, fontWeight: 900, color: T.text, fontVariantNumeric: "tabular-nums", fontFamily: isMono ? mono : undefined }}>{txt}</span>
  );

  return (
    <>
      <Dialog open={isOpen} onClose={requestClose} presentation="auto" size="xl" rawBody hideClose panelProps={guardProps} ariaLabel="Ficha da hospedagem">

        {/* ── Cabeçalho ── */}
        <header style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, background: T.glass, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{ height: 46, width: 46, borderRadius: "50%", background: T.grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 19, flexShrink: 0, boxShadow: `0 4px 14px ${alpha(T.g1, 30)}` }}>
              {stayDisplayName(stay, guest?.fullName).charAt(0) || "G"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {stayDisplayName(stay, guest?.fullName)}
                </h2>
                <Pill tone={st.tone} dot label={st.label} />
                <StayOriginPills stay={stay} />
              </div>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: T.muted, fontWeight: 500 }}>
                Reserva <span style={{ fontFamily: mono, fontWeight: 700, color: T.text }}>{stay.accessCode}</span>
                {stay.groupId && <> · grupo <span style={{ fontFamily: mono }}>{stay.groupId}</span></>}
                {stay.externalId && <> · HUNIT <span style={{ fontFamily: mono }}>{stay.externalId}</span></>}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!isEditing ? (
              <>
                {["pending", "pre_checkin_done"].includes(stay.status) && (
                  <Button variant="soft" tone="green" icon={LogIn} onClick={handleCheckIn} disabled={loading}>Check-in</Button>
                )}
                {stay.status === "active" && (
                  <Button variant="soft" tone="orange" icon={LogOut} onClick={handleToggleCheckOut} disabled={loading}>Check-out</Button>
                )}
                {stay.status === "finished" && (
                  <Button variant="soft" tone="blue" icon={RotateCcw} onClick={handleToggleCheckOut} disabled={loading}>Reativar</Button>
                )}
                <Button variant="secondary" icon={Edit2} onClick={() => setIsEditing(true)}>Editar</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={handleCancel}>Cancelar</Button>
                <Button variant="primary" icon={Save} loading={loading} loadingText="Salvando…" onClick={handleSave}>Salvar</Button>
              </>
            )}
            <Button variant="secondary" icon={FileText} onClick={() => window.open(`/admin/stays/${stay.id}`, "_blank")}>Ficha Completa</Button>
            <IconButton icon={X} label="Fechar" variant="ghost" onClick={requestClose} />
          </div>
        </header>

        {/* ── Corpo ── */}
        <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", background: T.bg, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Faixa-resumo: datas · pax · acomodação */}
          <Card pad={0} style={{ overflow: "hidden" }}>
            <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 1, background: T.border }}>
              {[
                <div key="ci" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {cellLabel(<LogIn size={10} />, "Check-in")}
                  {isCoreFieldLocked ? big(stay.checkIn ? format(new Date(stay.checkIn), "dd/MM/yy · HH:mm") : "—", true) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <Input type="date" fieldSize="sm" value={checkInStr} onChange={e => setCheckInStr(e.target.value)} />
                      <Input type="time" fieldSize="sm" value={checkInTimeStr} onChange={e => setCheckInTimeStr(e.target.value)} />
                    </div>
                  )}
                </div>,
                <div key="co" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {cellLabel(<LogOut size={10} />, "Check-out")}
                  {isCoreFieldLocked ? big(stay.checkOut ? format(new Date(stay.checkOut), "dd/MM/yy · HH:mm") : "—", true) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <Input type="date" fieldSize="sm" value={checkOutStr} onChange={e => setCheckOutStr(e.target.value)} />
                      <Input type="time" fieldSize="sm" value={checkOutTimeStr} onChange={e => setCheckOutTimeStr(e.target.value)} />
                    </div>
                  )}
                  <span style={{ fontSize: 11, color: T.muted }}>{nights} noite{nights !== 1 ? "s" : ""}</span>
                </div>,
                <div key="pax" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {cellLabel(<Users size={10} />, "Ocupação")}
                  {isCoreFieldLocked ? (
                    big(`${counts.adults ?? 1}A · ${counts.children ?? 0}C${(counts.babies ?? 0) > 0 ? ` · ${counts.babies}B` : ""}`)
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      {([["adults", "Ad", 1], ["children", "Cr", 0], ["babies", "Bb", 0]] as [keyof typeof counts, string, number][]).map(([key, lbl, min]) => (
                        <label key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: T.muted }}>
                          <Input type="number" min={min} fieldSize="sm" style={{ width: 50, textAlign: "center" }} value={counts[key] ?? min}
                            onChange={e => setFormData(p => ({ ...p, counts: { ...(p.counts ?? counts), [key]: Math.max(min, +e.target.value) } as Stay["counts"] }))} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                  )}
                  <span style={{ fontSize: 11, color: T.muted }}>{totalPax} hóspede{totalPax !== 1 ? "s" : ""}{pets.length > 0 ? ` + ${pets.length} pet${pets.length > 1 ? "s" : ""}` : ""}</span>
                </div>,
                <div key="cab" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {cellLabel(<BedDouble size={10} />, "Acomodação")}
                  {isCoreFieldLocked ? big(stay.cabinName || cabins.find(c => c.id === stay.cabinId)?.name || "Sem cabana") : (
                    <Select fieldSize="sm" value={formData.cabinId ?? ""} onChange={e => setFormData({ ...formData, cabinId: e.target.value || null })}>
                      <option value="">— Sem cabana —</option>
                      {cabins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  )}
                </div>,
              ].map((node, i) => <div key={i} style={{ background: T.card, minWidth: 0 }}>{node}</div>)}
            </div>

            {/* Linha secundária: ETA · placa · histórico de cabanas */}
            <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", background: T.card }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}>
                <Clock size={12} style={{ color: T.brandText }} />
                Chegada prevista:{" "}
                {isCoreFieldLocked ? (
                  <b style={{ color: T.text, fontFamily: mono }}>{stay.expectedArrivalTime || "—"}</b>
                ) : (
                  <Input type="time" fieldSize="sm" style={{ width: 96 }} value={formData.expectedArrivalTime ?? ""} onChange={e => setFormData({ ...formData, expectedArrivalTime: e.target.value })} />
                )}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}>
                <Car size={12} style={{ color: T.brandText }} />
                Placa:{" "}
                {isCoreFieldLocked ? (
                  <b style={{ color: T.text, fontFamily: mono }}>{stay.vehiclePlate || "—"}</b>
                ) : (
                  <Input fieldSize="sm" style={{ width: 110, textTransform: "uppercase" }} placeholder="ABC1D23" value={formData.vehiclePlate ?? ""} onChange={e => setFormData({ ...formData, vehiclePlate: e.target.value.toUpperCase() })} />
                )}
              </span>
              {(stay.cabinHistory?.length ?? 0) > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, minWidth: 0 }}>
                  <ArrowRight size={12} style={{ color: T.brandText }} />
                  {stay.cabinHistory!.map(h => cabins.find(c => c.id === h.cabinId)?.name?.split(" - ")[0] ?? "?").join(" → ")}
                  {" → "}<b style={{ color: T.text }}>{(stay.cabinName || cabins.find(c => c.id === stay.cabinId)?.name || "atual").split(" - ")[0]}</b>
                </span>
              )}
            </div>
          </Card>

          {/* Quem está na cabana · Pendências */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Card header={{
              icon: Users, tone: "brand", title: "Quem está na cabana",
              sub: `${totalPax} hóspede${totalPax !== 1 ? "s" : ""}${pets.length > 0 ? ` · ${pets.length} pet${pets.length > 1 ? "s" : ""}` : ""}`,
              aside: isEditing && !isGovOnly && guest ? (
                <Button size="sm" variant={showReassign ? "primary" : "soft"} icon={UserRoundPen} onClick={() => setShowReassign(!showReassign)}>Alterar titular</Button>
              ) : undefined,
            }}>
              {showReassign ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.muted }} />
                    <Input autoFocus value={reassignSearch} onChange={e => setReassignSearch(e.target.value)} placeholder="Buscar por nome, documento, email…" style={{ paddingLeft: 34 }} />
                  </div>
                  {reassignLoading && <p style={{ margin: 0, fontSize: 11, color: T.muted, textAlign: "center" }}>Buscando…</p>}
                  {!reassignLoading && reassignSearch.trim().length >= 2 && reassignResults.length === 0 && (
                    <p style={{ margin: 0, fontSize: 11, color: T.muted, textAlign: "center" }}>Nenhum hóspede encontrado.</p>
                  )}
                  {reassignResults.length > 0 && (
                    <div className="custom-scrollbar" style={{ maxHeight: 176, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                      {reassignResults.slice(0, 8).map(g => (
                        <button key={g.id} type="button" className="ak-press" onClick={() => handleReassignGuest(g)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, border: `1px solid ${T.border}`, background: T.glass, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                          <span style={{ height: 30, width: 30, borderRadius: "50%", background: T.glass2, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: T.muted, flexShrink: 0 }}>
                            {g.fullName?.charAt(0) || "?"}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.fullName}</span>
                            <span style={{ display: "block", fontSize: 10.5, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.document?.type}: {g.document?.number}{g.phone ? ` · ${g.phone}` : ""}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p style={{ margin: 0, fontSize: 10.5, color: T.muted2, lineHeight: 1.5 }}>
                    Selecione um hóspede já cadastrado para substituir o titular. As demais reservas do grupo não são afetadas.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Titular */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                    <Pill tone="brand" icon={User} label="Titular" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {guest?.fullName || stay.internalLabel || "—"}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.muted, fontFamily: mono }}>
                        <Phone size={10} />
                        {isEditing && !isGovOnly && guest ? (
                          <Input fieldSize="sm" style={{ width: 160 }} value={phoneDraft} onChange={e => setPhoneDraft(e.target.value)} inputMode="tel" />
                        ) : (guest?.phone || "—")}
                      </span>
                    </div>
                    {guest?.id && (
                      <Button size="sm" variant="ghost" iconRight={ExternalLink} onClick={() => (onViewGuest ? onViewGuest(guest.id) : window.open(`/admin/guests?id=${guest.id}`, "_blank"))}>Ver hóspede</Button>
                    )}
                  </div>

                  {/* Acompanhantes */}
                  <SectionLabel>Acompanhantes</SectionLabel>
                  {companions.length === 0 && unnamedCompanions <= 0 ? (
                    <div style={{ padding: 12, textAlign: "center", border: `1px dashed ${T.border2}`, borderRadius: 12, color: T.muted2, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Sem acompanhantes</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {companions.map((c, idx) => (
                        <div key={c.id ?? idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                          <Pill tone={COMPANION_TONE[c.type] ?? "brand"} label={COMPANION_LABEL[c.type] ?? c.type} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.fullName}{c.document && <span style={{ color: T.muted, fontWeight: 500 }}> · {c.document}</span>}
                          </span>
                        </div>
                      ))}
                      {unnamedCompanions > 0 && (
                        <div style={{ padding: "8px 10px", border: `1px dashed ${T.border2}`, borderRadius: 12, color: T.muted, fontSize: 11.5 }}>
                          + {unnamedCompanions} acompanhante{unnamedCompanions > 1 ? "s" : ""} ainda sem nome — preenchido no pré-check-in ou na Ficha Completa.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pets */}
                  {pets.length > 0 && (
                    <>
                      <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><PawPrint size={10} color={T.orange} /> Pets</SectionLabel>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {pets.map((p, i) => (
                          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, fontSize: 12, fontWeight: 700, color: T.orange }}>
                            <PawPrint size={11} />
                            {p.name || "Pet"}
                            <span style={{ color: T.muted, fontWeight: 500 }}>· {p.species}{p.weight ? ` · ${p.weight}kg` : ""}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  {isEditing && (
                    <p style={{ margin: 0, fontSize: 10.5, color: T.muted2 }}>Acompanhantes, pets e dados FNRH são editados na <b>Ficha Completa</b>.</p>
                  )}
                </div>
              )}
            </Card>

            <StayPendingCard propertyId={stay.propertyId} stay={stay} active={isOpen} />
          </div>

          {/* Conta & consumo */}
          <Card pad={0} header={{
            icon: Receipt, tone: "brand", title: "Conta & consumo",
            sub: `${folioItems.length} lançamento${folioItems.length === 1 ? "" : "s"}`,
            aside: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                <span style={{ textAlign: "right", lineHeight: 1.15 }}>
                  <span style={{ display: "block", fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>Débitos</span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 900, color: T.text, fontVariantNumeric: "tabular-nums" }}>R$ {folioDebits.toFixed(2)}</span>
                </span>
                <span style={{ textAlign: "right", lineHeight: 1.15 }}>
                  <span style={{ display: "block", fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>Créditos</span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 900, color: T.green, fontVariantNumeric: "tabular-nums" }}>R$ {folioCredits.toFixed(2)}</span>
                </span>
                <span style={{ textAlign: "right", lineHeight: 1.15 }}>
                  <span style={{ display: "block", fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>Saldo</span>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: folioBalance > 0.009 ? T.red : T.green, fontVariantNumeric: "tabular-nums" }}>R$ {folioBalance.toFixed(2)}</span>
                </span>
                <IconButton icon={RefreshCw} label="Atualizar extrato" size="sm" onClick={() => void loadFolio()} loading={loadingFolio} />
              </span>
            ),
          }}>
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Hospedagem: diária vinculada (funil/canal) ou definida à mão (avulsa) */}
              {Number(stay.nightlyRate) > 0 ? (
                <LodgingPanel
                  propertyId={stay.propertyId}
                  stayId={stay.id}
                  onChanged={() => { loadFolio(); if (onUpdate) onUpdate(); }}
                />
              ) : !isGovOnly && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", borderRadius: 12, background: T.glass, border: `1px dashed ${T.border2}`, fontSize: 12 }}>
                  <SectionLabel style={{ margin: 0 }}>Diária</SectionLabel>
                  <span style={{ color: T.muted }} className="ak-hide-mobile">Estadia sem valor de hospedagem —</span>
                  <Input type="number" step="0.01" min={0} placeholder="R$ / noite" fieldSize="sm" style={{ width: 110 }} value={rateInput} onChange={e => setRateInput(e.target.value)} inputMode="decimal" />
                  <Button size="sm" variant="primary" loading={savingRate} onClick={handleSetRate}>Ativar diárias</Button>
                </div>
              )}

              <div className="flex flex-col xl:flex-row gap-4 items-start">
                <div style={{ flex: 1, minWidth: 0, width: "100%", border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                      <thead style={{ background: T.glass, borderBottom: `1px solid ${T.border}` }}>
                        <tr>
                          {["Item / descrição", "Qtd", "Unit.", "Total", ""].map((h, i) => (
                            (i < 4 || !isGovOnly) && <th key={i} style={{ padding: "9px 12px", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted, textAlign: i >= 1 && i <= 3 ? (i === 1 ? "center" : "right") : "left", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {folioItems.length === 0 ? (
                          <tr><td colSpan={5} style={{ padding: "28px 16px", textAlign: "center", color: T.muted, fontSize: 13 }}>Nenhum consumo registrado nesta estadia.</td></tr>
                        ) : folioItems.map(item => (
                          <tr key={item.id} style={{ borderTop: `1px solid ${T.border}`, opacity: item.status === "paid" ? .55 : 1 }}>
                            <td style={{ padding: "10px 12px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {!isGovOnly && (
                                  <button onClick={() => handleToggleFolioStatus(item.id, item.status || "pending")} className="ak-press"
                                    style={{ width: 17, height: 17, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", background: item.status === "paid" ? T.green : "transparent", border: `1.5px solid ${item.status === "paid" ? T.green : T.border2}`, color: "#fff", padding: 0 }}
                                    title={item.status === "paid" ? "Reabrir" : "Marcar como pago"}>
                                    {item.status === "paid" && <CheckCircle size={11} strokeWidth={3} />}
                                  </button>
                                )}
                                <div style={{ minWidth: 0 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: item.status === "paid" && item.type !== "credit" ? T.muted : T.text, textDecoration: item.status === "paid" && item.type !== "credit" ? "line-through" : "none" }}>
                                    {item.description}
                                    {item.category === "lodging" && <Pill tone="brand" label="Diária" style={{ marginLeft: 6 }} />}
                                    {item.type === "credit" && <Pill tone="green" label="Crédito" style={{ marginLeft: 6 }} />}
                                  </span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted, marginTop: 2 }}>
                                    <Clock size={9} /> {item.createdAt ? format(new Date(item.createdAt), "dd/MM HH:mm") : "—"}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "10px 8px", textAlign: "center", color: T.muted, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap" }}>{item.quantity}×</td>
                            <td style={{ padding: "10px 8px", textAlign: "right", color: T.muted, fontSize: 12.5, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>R$ {item.unitPrice.toFixed(2)}</td>
                            <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900, fontSize: 12.5, whiteSpace: "nowrap", color: item.type === "credit" ? T.green : T.text, fontVariantNumeric: "tabular-nums" }}>
                              {item.type === "credit" ? "−" : ""}R$ {item.totalPrice.toFixed(2)}
                            </td>
                            {!isGovOnly && (
                              <td style={{ padding: "10px 10px 10px 0", textAlign: "right" }}>
                                <IconButton icon={Trash2} label={`Estornar ${item.description}`} size="sm" variant="ghost" tone="red" onClick={() => handleDeleteFolioItem(item.id, item.description)} />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {!isGovOnly && (
                  <form onSubmit={handleAddFolioItem} className="w-full xl:w-64 shrink-0" style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.brandText }}><ShoppingCart size={12} /> Lançamento</SectionLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                      {(["debit", "credit"] as const).map(kind => {
                        const sel = newFolioKind === kind;
                        const tn = kind === "credit" ? toneOf("green") : toneOf("brand");
                        return (
                          <button key={kind} type="button" onClick={() => setNewFolioKind(kind)} className="ak-press"
                            style={{ padding: "7px 0", borderRadius: 9, fontSize: 9.5, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit", background: sel ? tn.bg : "transparent", border: `1px solid ${sel ? tn.border : "transparent"}`, color: sel ? tn.color : T.muted }}>
                            {kind === "debit" ? "Consumo" : "Pagamento"}
                          </button>
                        );
                      })}
                    </div>
                    <Field label={newFolioKind === "credit" ? "Descrição do pagamento" : "Produto / serviço"}>
                      <Input required value={newFolioItem.description} onChange={e => setNewFolioItem({ ...newFolioItem, description: e.target.value })} placeholder={newFolioKind === "credit" ? "Ex.: Pix hospedagem" : "Ex.: lenha extra"} />
                    </Field>
                    <FieldRow cols={2}>
                      <Field label="Qtd">
                        <Input type="number" min={1} required value={newFolioItem.quantity} onChange={e => setNewFolioItem({ ...newFolioItem, quantity: Number(e.target.value) })} inputMode="numeric" />
                      </Field>
                      <Field label="R$ unit.">
                        <Input type="number" step="0.01" min={0} required value={newFolioItem.unitPrice || ""} onChange={e => setNewFolioItem({ ...newFolioItem, unitPrice: Number(e.target.value) })} inputMode="decimal" />
                      </Field>
                    </FieldRow>
                    <Button type="submit" variant="primary" tone={newFolioKind === "credit" ? "green" : undefined} fullWidth loading={loadingFolio} icon={Plus}>
                      {newFolioKind === "credit" ? "Lançar pagamento" : "Adicionar à conta"}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </Card>
        </div>
      </Dialog>

      {/* Transferência de acomodação */}
      <Dialog
        open={transferDialogOpen}
        onClose={() => { setTransferDialogOpen(false); setPendingTransferCabinId(null); }}
        presentation="auto"
        size="sm"
        icon={Sparkles}
        iconTone="amber"
        title="Mudança de acomodação"
        subtitle="O hóspede já fez check-in. A acomodação anterior precisa de limpeza de troca?"
        footer={(
          <>
            <Button variant="ghost" onClick={() => { setTransferDialogOpen(false); setPendingTransferCabinId(null); }}>Cancelar</Button>
            <Button variant="secondary" onClick={async () => { setTransferDialogOpen(false); await doSave(pendingTransferCabinId, false, "available"); setPendingTransferCabinId(null); }}>Só liberar</Button>
            <Button variant="primary" tone="amber" onClick={async () => { setTransferDialogOpen(false); await doSave(pendingTransferCabinId, false, "cleaning"); setPendingTransferCabinId(null); }}>Gerar faxina</Button>
          </>
        )}
      >
        <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Gerar faxina cria uma tarefa de limpeza para a governança; só liberar coloca a cabana como disponível na hora.</p>
      </Dialog>

      {/* Check-out (2 etapas: chave → objetos emprestados) */}
      <Dialog open={checkOutModalOpen} onClose={() => setCheckOutModalOpen(false)} presentation="auto" size="sm" icon={LogOut} iconTone="orange" title="Check-out" subtitle="Duas etapas: chave e itens emprestados">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
            {(["key", "loaned"] as const).map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900,
                  background: checkOutStep === s ? T.grad : checkOutStep === "loaned" && s === "key" ? T.green : T.glass2,
                  color: checkOutStep === s || (checkOutStep === "loaned" && s === "key") ? "#fff" : T.muted,
                  border: `1px solid ${checkOutStep === s ? "transparent" : T.border}`,
                }}>{i + 1}</div>
                {i < 1 && <div style={{ height: 1, width: 32, background: checkOutStep === "loaned" ? T.green : T.border }} />}
              </div>
            ))}
          </div>

          {checkOutStep === "key" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", background: alpha(T.g1, 10), border: `1px solid ${T.g1Border}` }}>
                <KeyRound size={19} style={{ color: T.brandText }} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.text }}>Localização da chave</h3>
                <p style={{ margin: 0, fontSize: 12, color: T.muted }}>Onde está a chave da acomodação?</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {([
                { value: "reception" as const, label: "Na recepção", desc: "Hóspede devolveu a chave", tone: "green" as const },
                { value: "cabin" as const, label: "Na acomodação", desc: "Camareira irá verificar", tone: "amber" as const },
              ]).map(opt => {
                const tn = toneOf(opt.tone);
                const sel = keyLocation === opt.value;
                return (
                  <button key={opt.value} onClick={() => setKeyLocation(opt.value)} className="ak-press"
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: sel ? tn.bg : T.glass, border: `1.5px solid ${sel ? tn.color : T.border}` }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: tn.color, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.text }}>{opt.label}</span>
                      <span style={{ display: "block", fontSize: 11.5, color: T.muted }}>{opt.desc}</span>
                    </span>
                    {sel && <CheckCircle size={16} style={{ color: tn.color, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" fullWidth onClick={() => setCheckOutModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" fullWidth disabled={!keyLocation} onClick={() => setCheckOutStep("loaned")}>Próximo →</Button>
            </div>
          </>)}

          {checkOutStep === "loaned" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", background: T.blueBg, border: `1px solid ${T.blueBorder}` }}>
                <Package size={19} style={{ color: T.blue }} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.text }}>Objetos emprestados</h3>
                <p style={{ margin: 0, fontSize: 12, color: T.muted }}>O hóspede ficou com algum item da propriedade?</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {([
                { value: false, label: "Não, nada emprestado", desc: "Hóspede não ficou com nada", tone: "green" as const },
                { value: true, label: "Sim, há itens", desc: "Camareira irá verificar no checkout", tone: "blue" as const },
              ]).map(opt => {
                const tn = toneOf(opt.tone);
                const sel = hasLoanedItems === opt.value;
                return (
                  <button key={String(opt.value)} onClick={() => setHasLoanedItems(opt.value)} className="ak-press"
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: sel ? tn.bg : T.glass, border: `1.5px solid ${sel ? tn.color : T.border}` }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: tn.color, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.text }}>{opt.label}</span>
                      <span style={{ display: "block", fontSize: 11.5, color: T.muted }}>{opt.desc}</span>
                    </span>
                    {sel && <CheckCircle size={16} style={{ color: tn.color, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
            {hasLoanedItems === true && (
              <textarea
                autoFocus
                placeholder="Liste os itens emprestados (ex: toalha extra, secador, travesseiro, berço)…"
                value={loanedItemsText}
                onChange={e => setLoanedItemsText(e.target.value)}
                rows={3}
                className="ak-textarea"
              />
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" fullWidth onClick={() => setCheckOutStep("key")}>← Voltar</Button>
              <Button variant="primary" fullWidth icon={LogOut} disabled={hasLoanedItems === null || (hasLoanedItems === true && !loanedItemsText.trim())} onClick={handleConfirmCheckOut}>
                Confirmar check-out
              </Button>
            </div>
          </>)}
        </div>
      </Dialog>
    </>
  );
}
