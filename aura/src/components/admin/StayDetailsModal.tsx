// src/components/admin/StayDetailsModal.tsx
//
// FICHA RÁPIDA da estadia. Contexto (cabana, datas, ocupação, ETA, placa) vive no
// CABEÇALHO, compacto: é o que se lê de relance, não conteúdo de tela. O corpo
// guarda o que exige leitura de verdade — quem está na cabana, o que a operação
// deve ao hóspede e a conta.
//
// A conta aqui é o MESMO componente do modal da Conta e da ficha completa
// (`folio/StayAccountPanel`): saldo, os quatro sinais com desfecho inline,
// lançamentos e formulário. Duas implementações do mesmo extrato era o começo de
// duas verdades.
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Edit2, Save, User, Phone, Users, Car, PawPrint, LogIn, LogOut, RotateCcw,
  Sparkles, Receipt, BedDouble, ArrowRight, Search, UserRoundPen, KeyRound,
  Package, FileText, ExternalLink, CheckCircle, CheckCircle2, Clock, Calendar,
  HandHelping,
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
  T, alpha, tone as toneOf, Button, IconButton, Pill, Card, SectionLabel, Input, Select,
} from "@/components/aura";
import { stayDisplayName } from "@/lib/stay-display";
import { readPets } from "@/lib/pets";
import { useStayAccount } from "./folio/useStayAccount";
import { StayAccountPanel } from "./folio/StayAccountPanel";
import { supabase } from "@/lib/supabase";
import { extractTimeHHMM, combineDateAndTimeISO, DEFAULT_CHECK_IN_TIME, DEFAULT_CHECK_OUT_TIME } from "@/lib/stay-times";
import { StayOriginPills, StayRequestsCard } from "./StayOpsBlocks";
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
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const formatDateForInput = (timestamp: any) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Item da barra de contexto do cabeçalho: ícone + rótulo + valor (ou campo). */
function Meta({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
      <span style={{ color: T.brandText, opacity: .85, display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted2, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
      </span>
    </span>
  );
}

export function StayDetailsModal({ isOpen, onClose, stay, guest, onViewGuest, onUpdate }: StayDetailsModalProps) {
  const { userData } = useAuth();
  const isGovOnly = userData?.role === "governance";

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [checkOutStep, setCheckOutStep] = useState<"key" | "loaned">("key");
  const [keyLocation, setKeyLocation] = useState<"reception" | "cabin" | null>(null);
  const [loanedItemsText, setLoanedItemsText] = useState("");

  // Rascunho de edição — só o que a ficha rápida edita (o resto é da Ficha Completa).
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

  const [rateInput, setRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const locked = !isEditing || isGovOnly;

  // A conta inteira (fólio, sinais, encerramento) — mesmo estado das outras telas.
  const account = useStayAccount(stay?.propertyId, stay, { id: userData?.id, name: userData?.fullName }, isOpen, onUpdate);

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

  // ── Diária de estadia avulsa ───────────────────────────────────────────────
  const handleSetRate = async () => {
    const nightly = parseFloat(rateInput.replace(",", "."));
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
      void account.folio.reload();
    } catch {
      toast.error("Erro ao definir a diária.");
    } finally {
      setSavingRate(false);
    }
  };

  // ── Encerrar conta (mesma confirmação do modal da Conta) ───────────────────
  const handleCloseBill = async () => {
    const summary = account.pending.map(c => `${c.label.toLowerCase()} (${c.detail})`).join(" · ");
    const ok = await confirm({
      title: "Encerrar a conta desta estadia?",
      description: account.pending.length
        ? `Fica para trás: ${summary}. Os lançamentos pendentes serão marcados como pagos e a estadia vai para Encerradas.`
        : "Ciclo completo. Os lançamentos pendentes serão marcados como pagos e a estadia vai para Encerradas.",
      confirmLabel: "Encerrar conta",
      tone: account.pending.length ? "danger" : undefined,
      icon: Receipt,
    });
    if (!ok) return;
    await account.closeBill(summary || undefined);
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
      } else if (msg.includes("outra propriedade")) {
        // Documento já usado por ficha de outra propriedade: a recusa precisa chegar à tela.
        toast.error(msg);
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
      if (loanedItemsText.trim()) {
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

  // ── Derivados da visão ─────────────────────────────────────────────────────
  const st = STATUS[stay.status] ?? { label: stay.status, tone: "neutral" as const };
  const companions = (stay.additionalGuests ?? []).filter(c => c.fullName?.trim() && c.fullName !== "ACOMPANHANTE");
  const unnamedCompanions = (stay.additionalGuests ?? []).length - companions.length;
  const pets = readPets(stay);
  const counts = formData.counts ?? stay.counts ?? { adults: 1, children: 0, babies: 0 };
  const nights = stay.checkIn && stay.checkOut
    ? Math.max(1, Math.round((new Date(stay.checkOut.slice(0, 10) + "T12:00").getTime() - new Date(stay.checkIn.slice(0, 10) + "T12:00").getTime()) / 86400000))
    : 0;
  const totalPax = (counts.adults ?? 0) + (counts.children ?? 0) + (counts.babies ?? 0);
  const cabinLabel = stay.cabinName || cabins.find(c => c.id === stay.cabinId)?.name || "Sem cabana";
  const hasArrived = stay.status === "active" || stay.status === "finished";

  return (
    <>
      <Dialog open={isOpen} onClose={requestClose} presentation="auto" size="xl" rawBody hideClose panelProps={guardProps} ariaLabel="Ficha da hospedagem">

        {/* ── Cabeçalho: identidade + contexto ── */}
        <header style={{ borderBottom: `1px solid ${T.border}`, background: T.glass, flexShrink: 0 }}>
          <div style={{ padding: "14px 20px 12px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <div style={{ height: 44, width: 44, borderRadius: "50%", background: T.grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 18, flexShrink: 0, boxShadow: `0 4px 14px ${alpha(T.g1, 30)}` }}>
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
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: T.muted, fontWeight: 500 }}>
                  Reserva <span style={{ fontFamily: MONO, fontWeight: 700, color: T.text }}>{stay.accessCode}</span>
                  {stay.groupId && <> · grupo <span style={{ fontFamily: MONO }}>{stay.groupId}</span></>}
                  {stay.externalId && <> · HUNIT <span style={{ fontFamily: MONO }}>{stay.externalId}</span></>}
                </p>
              </div>
            </div>

            {/* Ações: ícones no topo, sem texto — o que a recepção faz mil vezes por dia
                não precisa de rótulo, precisa de alvo. Salvar/Cancelar são exceção:
                aparecem escritos porque só existem no modo edição. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {!isEditing ? (
                <>
                  {["pending", "pre_checkin_done"].includes(stay.status) && (
                    <IconButton icon={LogIn} label="Fazer check-in" variant="soft" tone="green" onClick={handleCheckIn} disabled={loading} />
                  )}
                  {stay.status === "active" && (
                    <IconButton icon={LogOut} label="Fazer check-out" variant="soft" tone="orange" onClick={handleToggleCheckOut} disabled={loading} />
                  )}
                  {stay.status === "finished" && (
                    <IconButton icon={RotateCcw} label="Reativar estadia" variant="soft" tone="blue" onClick={handleToggleCheckOut} disabled={loading} />
                  )}
                  {!isGovOnly && <IconButton icon={Edit2} label="Editar reserva" variant="secondary" onClick={() => setIsEditing(true)} />}
                  <IconButton icon={FileText} label="Abrir ficha completa" variant="secondary" onClick={() => window.open(`/admin/stays/${stay.id}`, "_blank")} />
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={handleCancel}>Cancelar</Button>
                  <Button variant="primary" size="sm" icon={Save} loading={loading} loadingText="Salvando…" onClick={handleSave}>Salvar</Button>
                </>
              )}
              <IconButton icon={X} label="Fechar" variant="ghost" onClick={requestClose} />
            </div>
          </div>

          {/* Barra de contexto: cabana · datas · ocupação · chegada · placa */}
          <div style={{ padding: "0 20px 12px", display: "flex", alignItems: "center", gap: 20, rowGap: 10, flexWrap: "wrap" }}>
            <Meta icon={<BedDouble size={13} />} label="Cabana">
              {locked ? cabinLabel : (
                <Select fieldSize="sm" wrapStyle={{ minWidth: 190 }} value={formData.cabinId ?? ""} onChange={e => setFormData({ ...formData, cabinId: e.target.value || null })}>
                  <option value="">— Sem cabana —</option>
                  {cabins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Meta>

            <Meta icon={<Calendar size={13} />} label="Estadia">
              {locked ? (
                <span style={{ fontFamily: MONO }}>
                  {stay.checkIn ? format(new Date(stay.checkIn), "dd/MM HH:mm") : "—"}
                  <span style={{ color: T.muted2, margin: "0 6px" }}>→</span>
                  {stay.checkOut ? format(new Date(stay.checkOut), "dd/MM HH:mm") : "—"}
                  <span style={{ color: T.muted, fontWeight: 500, marginLeft: 6 }}>· {nights} noite{nights !== 1 ? "s" : ""}</span>
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  <Input type="date" fieldSize="sm" style={{ width: 140 }} value={checkInStr} onChange={e => setCheckInStr(e.target.value)} />
                  <Input type="time" fieldSize="sm" style={{ width: 96 }} value={checkInTimeStr} onChange={e => setCheckInTimeStr(e.target.value)} />
                  <span style={{ color: T.muted2 }}>→</span>
                  <Input type="date" fieldSize="sm" style={{ width: 140 }} value={checkOutStr} onChange={e => setCheckOutStr(e.target.value)} />
                  <Input type="time" fieldSize="sm" style={{ width: 96 }} value={checkOutTimeStr} onChange={e => setCheckOutTimeStr(e.target.value)} />
                </span>
              )}
            </Meta>

            <Meta icon={<Users size={13} />} label="Pax">
              {locked ? (
                <>
                  {counts.adults ?? 1}A{(counts.children ?? 0) > 0 ? ` · ${counts.children}C` : ""}{(counts.babies ?? 0) > 0 ? ` · ${counts.babies}B` : ""}
                  {pets.length > 0 && <span style={{ color: T.orange, fontWeight: 600 }}> · {pets.length}🐾</span>}
                </>
              ) : (
                <span style={{ display: "inline-flex", gap: 4 }}>
                  {([["adults", "A", 1], ["children", "C", 0], ["babies", "B", 0]] as [keyof typeof counts, string, number][]).map(([key, lbl, min]) => (
                    <Input key={key} type="number" min={min} fieldSize="sm" style={{ width: 54, textAlign: "center" }} title={lbl} value={counts[key] ?? min}
                      onChange={e => setFormData(p => ({ ...p, counts: { ...(p.counts ?? counts), [key]: Math.max(min, +e.target.value) } as Stay["counts"] }))} />
                  ))}
                </span>
              )}
            </Meta>

            {/* Chegada prevista só interessa antes de o hóspede chegar. */}
            {(!hasArrived || !locked) && (
              <Meta icon={<Clock size={13} />} label="Chegada">
                {locked ? (stay.expectedArrivalTime || "—") : (
                  <Input type="time" fieldSize="sm" style={{ width: 96 }} value={formData.expectedArrivalTime ?? ""} onChange={e => setFormData({ ...formData, expectedArrivalTime: e.target.value })} />
                )}
              </Meta>
            )}

            <Meta icon={<Car size={13} />} label="Placa">
              {locked ? (stay.vehiclePlate || "—") : (
                <Input fieldSize="sm" style={{ width: 110, textTransform: "uppercase" }} placeholder="ABC1D23" value={formData.vehiclePlate ?? ""} onChange={e => setFormData({ ...formData, vehiclePlate: e.target.value.toUpperCase() })} />
              )}
            </Meta>

            {(stay.cabinHistory?.length ?? 0) > 0 && (
              <Meta icon={<ArrowRight size={13} />} label="Trocas">
                {stay.cabinHistory!.map(h => cabins.find(c => c.id === h.cabinId)?.name?.split(" - ")[0] ?? "?").join(" → ")} → {cabinLabel.split(" - ")[0]}
              </Meta>
            )}
          </div>
        </header>

        {/* ── Corpo ── */}
        <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", background: T.bg, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* Quem está na cabana */}
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
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.muted, fontFamily: MONO }}>
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

            <StayRequestsCard stay={stay} requests={account.requests} />
          </div>

          {/* Conta — o mesmo painel do modal da Conta e da ficha completa */}
          <Card
            header={{
              icon: Receipt,
              tone: account.folio.balance > 0.005 ? "orange" : "brand",
              title: "Conta",
              sub: account.closed ? "encerrada" : `${account.folio.items.length} lançamento${account.folio.items.length === 1 ? "" : "s"}`,
              aside: !isGovOnly ? (
                account.closed ? (
                  <Button size="sm" variant="secondary" icon={RotateCcw} loading={account.busy} onClick={() => void account.reopenBill()}>Reabrir conta</Button>
                ) : (
                  <Button size="sm" variant="soft" icon={CheckCircle2} loading={account.busy} onClick={() => void handleCloseBill()}>Encerrar conta</Button>
                )
              ) : undefined,
            }}
          >
            <StayAccountPanel
              a={account}
              readOnly={isGovOnly}
              lodgingSlot={
                Number(stay.nightlyRate) > 0 ? (
                  <LodgingPanel
                    propertyId={stay.propertyId}
                    stayId={stay.id}
                    readOnly={isGovOnly || account.closed}
                    onChanged={() => { void account.folio.reload(); if (onUpdate) onUpdate(); }}
                  />
                ) : !isGovOnly && !account.closed ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", borderRadius: 12, background: T.glass, border: `1px dashed ${T.border2}`, fontSize: 12 }}>
                    <SectionLabel style={{ margin: 0 }}>Diária</SectionLabel>
                    <span style={{ color: T.muted }} className="ak-hide-mobile">Estadia sem valor de hospedagem —</span>
                    <Input inputMode="decimal" placeholder="R$ / noite" fieldSize="sm" style={{ width: 110 }} value={rateInput} onChange={e => setRateInput(e.target.value)} />
                    <Button size="sm" variant="primary" loading={savingRate} onClick={handleSetRate}>Ativar diárias</Button>
                  </div>
                ) : null
              }
            />
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
                <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                  {account.loans.length > 0 ? "Confira o que foi entregue durante a estadia." : "Nada foi entregue durante a estadia."}
                </p>
              </div>
            </div>

            {/* Conferência: o que a governança, o mensageiro ou a recepção entregaram. */}
            {account.loans.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {account.loans.map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 12, border: `1px solid ${T.amberBorder}`, background: T.amberBg, flexWrap: "wrap" }}>
                    <HandHelping size={14} color={T.amber} style={{ flexShrink: 0 }} />
                    <span style={{ flex: "1 1 140px", minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.text }}>
                        {r.itemName}{r.quantity > 1 ? ` x${r.quantity}` : ""}
                      </span>
                      <span style={{ display: "block", fontSize: 10.5, color: T.muted }}>
                        entregue {format(new Date(r.createdAt), "dd/MM")}{r.assignedName ? ` · ${r.assignedName}` : ""}
                      </span>
                    </span>
                    <Button size="sm" variant="secondary" icon={CheckCircle} loading={account.busy} onClick={() => void account.resolveLoan(r.id, "return")}>
                      Devolvido
                    </Button>
                  </div>
                ))}
                <span style={{ fontSize: 11, color: T.muted2 }}>
                  O que não for devolvido agora continua em aberto na conta — dá para resolver depois.
                </span>
              </div>
            )}

            {/* Avulso: item que não estava no catálogo. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: T.muted }}>
                Ficou com mais alguma coisa? (opcional)
              </span>
              <textarea
                placeholder="Ex.: toalha extra, secador, guarda-chuva…"
                value={loanedItemsText}
                onChange={e => setLoanedItemsText(e.target.value)}
                rows={2}
                className="ak-textarea"
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" fullWidth onClick={() => setCheckOutStep("key")}>← Voltar</Button>
              <Button variant="primary" fullWidth icon={LogOut} loading={loading} onClick={handleConfirmCheckOut}>
                Confirmar check-out
              </Button>
            </div>
          </>)}

        </div>
      </Dialog>
    </>
  );
}
