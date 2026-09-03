"use client";

// Estado + regras da ficha completa da estadia (carregamento, edição, fólio, check-out, transferência).
// Lógica portada 1:1 da página original; só a camada visual mudou.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StayService } from "@/services/stay-service";
import { GuestService } from "@/services/guest-service";
import { CabinService } from "@/services/cabin-service";
import { FnrhService, type FnrhDomain } from "@/services/fnrh-service";
import { sanitizeDocumentForFnrh, validateCPF } from "@/lib/utils-checkin";
import { EMPTY_PET, maxPetsOf, readPets, writePets } from "@/lib/pets";
import { useConfirm } from "@/components/aura";
import type { Stay, Guest, Cabin } from "@/types/aura";
import { formatDateForInput, parseDateFromInput, type KeyLocation } from "./stay-detail-utils";


export interface FnrhDomainsStay {
  generos: FnrhDomain[]; racas: FnrhDomain[]; transportes: FnrhDomain[]; motivos: FnrhDomain[]; tiposDocumento: FnrhDomain[];
}

export function useStayDetail(stayId: string | undefined) {
  const { userData } = useAuth();
  const { currentProperty } = useProperty();
  const confirm = useConfirm();
  const propertyId = currentProperty?.id;
  const actorId = userData?.id || "ADMIN";
  const actorName = userData?.fullName || "Recepção";
  const isGovOnly = userData?.role === "governance";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [keyLocation, setKeyLocation] = useState<KeyLocation | null>(null);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const [stay, setStay] = useState<any>(null);
  const [guest, setGuest] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [guestData, setGuestData] = useState<any>({});
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [fnrhDomains, setFnrhDomains] = useState<FnrhDomainsStay | null>(null);
  const [checkInStr, setCheckInStr] = useState("");
  const [checkOutStr, setCheckOutStr] = useState("");

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [pendingTransferCabinId, setPendingTransferCabinId] = useState<string | null>(null);

  // O fólio e os quatro sinais vivem em `useStayAccount` (componente compartilhado
  // com o modal da Conta e a ficha rápida) — a página instancia direto.

  const initData = useCallback((s: any, g: any) => {
    if (!s) return;
    setCheckInStr(formatDateForInput(s.checkIn));
    setCheckOutStr(formatDateForInput(s.checkOut));
    setFormData({
      cabinId: s.cabinId,
      expectedArrivalTime: s.expectedArrivalTime || "",
      roomSetup: s.roomSetup || "double",
      roomSetupNotes: s.roomSetupNotes || "",
      areaConfigs: s.areaConfigs || [],
      counts: s.counts || { adults: 1, children: 0, babies: 0 },
      vehiclePlate: s.vehiclePlate || "",
      travelReason: s.travelReason || "TURISMO",
      transportation: s.transportation || "CARRO",
      lastCity: s.lastCity || "",
      nextCity: s.nextCity || "",
      hasPet: s.hasPet || false,
      pets: readPets(s),
      additionalGuests: s.additionalGuests || [],
      housekeepingItems: s.housekeepingItems || [],
      cestaBreakfastEnabled: s.cestaBreakfastEnabled || false,
    });
    const gg = g || {};
    setGuestData({
      fullName: gg.fullName || "",
      nationality: gg.nationality || "Brasil",
      document: gg.document || { type: "CPF", number: "" },
      birthDate: gg.birthDate || "",
      gender: gg.gender || "",
      raca: gg.raca || "NAO_DECLARADO",
      occupation: gg.occupation || "",
      email: gg.email || "",
      phone: gg.phone || "",
      address: gg.address || { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil", ibgeCityId: "" },
    });
  }, []);

  useEffect(() => {
    if (!stayId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [result, generos, racas, transportes, motivos, tiposDocumento] = await Promise.all([
          StayService.getStayWithGuestAndCabinAdmin("", stayId),
          FnrhService.getGeneros(), FnrhService.getRacas(),
          FnrhService.getMeiosTransporte(), FnrhService.getMotivosViagem(), FnrhService.getTiposDocumento(),
        ]);
        if (!alive) return;
        if (!result) { setNotFound(true); return; }
        setStay(result.stay); setGuest(result.guest);
        setFnrhDomains({ generos, racas, transportes, motivos, tiposDocumento });
        initData(result.stay, result.guest);
      } catch {
        if (alive) setNotFound(true);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [stayId, initData]);

  useEffect(() => {
    if (!propertyId) return;
    CabinService.getCabinsByProperty(propertyId).then(setCabins);
  }, [propertyId]);

  // ── Handlers ──
  const fetchAddressByCep = async (cep?: string) => {
    const clean = (cep || "").replace(/\D/g, "");
    if (clean.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado."); return; }
      setGuestData((p: any) => ({
        ...p,
        address: {
          ...p.address, street: data.logradouro || p.address?.street || "", neighborhood: data.bairro || p.address?.neighborhood || "",
          city: data.localidade || p.address?.city || "", state: data.uf || p.address?.state || "",
          country: "Brasil", zipCode: data.cep || p.address?.zipCode || "", ibgeCityId: data.ibge || p.address?.ibgeCityId || "",
        },
      }));
      toast.success("Endereço preenchido!");
    } catch { /* silencioso */ }
  };

  const refresh = async () => {
    if (!propertyId || !stay) return;
    const upd = await StayService.getStayWithGuestAndCabinAdmin(propertyId, stay.id);
    if (upd) { setStay(upd.stay); setGuest(upd.guest); initData(upd.stay, upd.guest); }
  };

  const handleCancel = () => { initData(stay, guest); setIsEditing(false); setExpandedArea(null); };

  const doSave = async (newCabinId: string | null, disposition: "cleaning" | "available" | null) => {
    if (!propertyId) return;
    setIsSaving(true);
    try {
      const cleanHk = (formData.housekeepingItems || []).filter((i: any) => i.label.trim() !== "");
      const { cabinId: _ci, ...rest } = formData;
      const stayPayload: Partial<Stay> = {
        ...rest, housekeepingItems: cleanHk,
        // Mantém pets/hasPet/petDetails coerentes entre si numa escrita só.
        ...writePets(!!formData.hasPet, formData.pets),
        checkIn: parseDateFromInput(checkInStr, stay.checkIn) || stay.checkIn,
        checkOut: parseDateFromInput(checkOutStr, stay.checkOut) || stay.checkOut,
        additionalGuests: (formData.additionalGuests || []).map((ag: any) => ({ ...ag, document: ag.document ? sanitizeDocumentForFnrh(ag.document) : "" })),
      };
      const guestPayload: Partial<Guest> = {
        id: guest?.id, ...guestData,
        document: { ...guestData.document, number: sanitizeDocumentForFnrh(guestData.document?.number) },
      };
      const ops: Promise<any>[] = [
        StayService.updateStayData(propertyId, stay.id, stayPayload, actorId, actorName),
        GuestService.upsertGuest(propertyId, guestPayload as Guest, actorId, actorName),
      ];
      if (newCabinId && disposition) ops.push(StayService.transferCabin(propertyId, stay.id, newCabinId, disposition, actorId, actorName));
      else if (newCabinId && stay.status !== "active") ops.push(StayService.transferCabin(propertyId, stay.id, newCabinId, "available", actorId, actorName));
      await Promise.all(ops);
      toast.success("Ficha atualizada!");
      setIsEditing(false); setExpandedArea(null);
      await refresh();
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.startsWith("CABIN_NOT_AVAILABLE")) toast.error(`Transferência bloqueada: acomodação ${msg.split(":")[2] ?? "indisponível"}.`);
      else toast.error("Erro ao salvar.");
    } finally { setIsSaving(false); }
  };

  const handleSave = async () => {
    if (guestData.document?.type === "CPF" && guestData.document.number && !validateCPF(guestData.document.number)) { toast.error("CPF inválido."); return; }
    if ((formData.additionalGuests || []).some((ag: any) => ag.document && sanitizeDocumentForFnrh(ag.document).length === 11 && !validateCPF(ag.document))) { toast.error("CPF de acompanhante inválido."); return; }
    const cabinChanged = formData.cabinId && formData.cabinId !== stay.cabinId;
    if (cabinChanged && stay.status === "active") { setPendingTransferCabinId(formData.cabinId); setTransferDialogOpen(true); return; }
    await doSave(cabinChanged ? formData.cabinId : null, null);
  };

  const handleUndoCheckOut = async () => {
    if (!propertyId) return;
    if (!(await confirm({ title: "Reativar esta estadia?", description: "A cabana volta a ficar ocupada por este hóspede.", confirmLabel: "Reativar" }))) return;
    setIsSaving(true);
    try {
      await StayService.undoCheckOut(propertyId, stay.id, stay.cabinId, actorId, actorName);
      toast.success("Estadia reativada!");
      await refresh();
    } catch { toast.error("Erro na operação."); } finally { setIsSaving(false); }
  };

  const handleToggleCheckOut = () => {
    if (stay.status === "active") { setKeyLocation(null); setCheckOutModalOpen(true); }
    else void handleUndoCheckOut();
  };

  // O diálogo da chave é compartilhado com a lista de Ativas e guarda a escolha
  // internamente — por isso ela chega por parâmetro; o estado local continua
  // valendo para quem ainda chama sem argumento.
  const handleConfirmCheckOut = async (chosen?: KeyLocation) => {
    const location = chosen ?? keyLocation;
    if (!location || !propertyId) return;
    setCheckOutModalOpen(false);
    setIsSaving(true);
    try {
      await StayService.performCheckOut(propertyId, stay.id, actorId, actorName, location);
      toast.success("Check-out realizado!");
      await refresh();
    } catch { toast.error("Erro na operação."); } finally { setIsSaving(false); }
  };

  // ── Exceção à Política Pet ──
  // O contexto (alta temporada, exceção sobreposta) vem por rota, não pelo service:
  // é regra de decisão, e ela mora no servidor junto com a auditoria.
  const [petExcContext, setPetExcContext] = useState<{ inBlackout: boolean; overlapping: any[] } | null>(null);
  const [petExcAuthorizedBy, setPetExcAuthorizedBy] = useState("");
  const [petExcNote, setPetExcNote] = useState("");
  const [decidingPetExc, setDecidingPetExc] = useState(false);

  useEffect(() => {
    if (!stay?.id || (stay as any)?.petException?.status !== "pending") { setPetExcContext(null); return; }
    let alive = true;
    fetch(`/api/admin/stays/${stay.id}/pet-exception`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setPetExcContext(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [stay?.id, (stay as any)?.petException?.status]);

  const decidePetException = async (decision: "approved" | "refused") => {
    if (!stay?.id || decidingPetExc) return;
    setDecidingPetExc(true);
    try {
      const res = await fetch(`/api/admin/stays/${stay.id}/pet-exception`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, authorizedBy: petExcAuthorizedBy, note: petExcNote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao registrar a decisão.");
      toast.success(decision === "approved" ? "Exceção aprovada." : "Exceção recusada.");
      setPetExcAuthorizedBy(""); setPetExcNote("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDecidingPetExc(false);
    }
  };

  // ── Pets ──
  const patchPet = (idx: number, patch: Record<string, any>) =>
    setFormData((p: any) => ({ ...p, pets: (p.pets ?? []).map((pet: any, i: number) => (i === idx ? { ...pet, ...patch } : pet)) }));
  const addPet = () => setFormData((p: any) => ({ ...p, pets: [...(p.pets ?? []), { ...EMPTY_PET }] }));
  const removePet = (idx: number) => setFormData((p: any) => ({ ...p, pets: (p.pets ?? []).filter((_: any, i: number) => i !== idx) }));
  const togglePet = () => setFormData((p: any) => ({ ...p, hasPet: !p.hasPet, pets: !p.hasPet ? (p.pets?.length ? p.pets : [{ ...EMPTY_PET }]) : [] }));

  // ── Computed ──
  const computed = useMemo(() => {
    const locked = !isEditing || isGovOnly;
    const selectedCabin = cabins.find(c => c.id === (formData.cabinId || stay?.cabinId));
    const ag = formData.additionalGuests || [];
    const actualCounts = {
      adults: 1 + ag.filter((g: any) => g.type === "adult").length,
      children: ag.filter((g: any) => g.type === "child").length,
      babies: ag.filter((g: any) => g.type === "baby").length,
    };
    const acfDiverges = actualCounts.adults !== (formData.counts?.adults ?? 1)
      || actualCounts.children !== (formData.counts?.children ?? 0)
      || actualCounts.babies !== (formData.counts?.babies ?? 0);
    const nights = stay ? differenceInCalendarDays(new Date(stay.checkOut), new Date(stay.checkIn)) : 0;
    const petList: any[] = formData.pets ?? [];
    const maxPets = maxPetsOf(currentProperty?.settings);
    return { locked, selectedCabin, actualCounts, acfDiverges, nights, petList, maxPets };
  }, [isEditing, isGovOnly, cabins, formData, stay, currentProperty?.settings]);

  return {
    // identidade
    propertyId, isGovOnly, guestId: guest?.id as string | undefined,
    // estado
    loading, notFound, isSaving, isEditing, setIsEditing, stay, guest, formData, setFormData, guestData, setGuestData,
    cabins, fnrhDomains, checkInStr, setCheckInStr, checkOutStr, setCheckOutStr, expandedArea, setExpandedArea,
    checkOutModalOpen, setCheckOutModalOpen, keyLocation, setKeyLocation,
    transferDialogOpen, setTransferDialogOpen, pendingTransferCabinId, setPendingTransferCabinId,
    // ações
    handleCancel, handleSave, doSave, handleToggleCheckOut, handleConfirmCheckOut,
    fetchAddressByCep,
    patchPet, addPet, removePet, togglePet,
    // exceção de pet
    petExcContext, petExcAuthorizedBy, setPetExcAuthorizedBy, petExcNote, setPetExcNote,
    decidingPetExc, decidePetException,
    ...computed,
  };
}

export type StayDetailState = ReturnType<typeof useStayDetail>;
