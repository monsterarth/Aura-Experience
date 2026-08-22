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
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { useConfirm } from "@/components/aura";
import type { Stay, Guest, Cabin, FolioItem } from "@/types/aura";
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

  const [folioItems, setFolioItems] = useState<FolioItem[]>([]);
  const [loadingFolio, setLoadingFolio] = useState(false);
  const [newFolioItem, setNewFolioItem] = useState({ description: "", quantity: 1, unitPrice: 0 });

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [pendingTransferCabinId, setPendingTransferCabinId] = useState<string | null>(null);

  // ── Load ──
  const loadFolio = useCallback(async () => {
    if (!propertyId || !stayId) return;
    setLoadingFolio(true);
    try { setFolioItems(await StayService.getStayFolio(propertyId, stayId)); }
    catch { toast.error("Erro ao carregar extrato."); }
    finally { setLoadingFolio(false); }
  }, [propertyId, stayId]);

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
    void loadFolio();
  }, [propertyId, loadFolio]);

  useEffect(() => {
    if (!stayId) return;
    let subscribed = false;
    const ch = supabase.channel(`folio_page_${stayId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "folio_items", filter: `stayId=eq.${stayId}` }, () => { void loadFolio(); })
      .subscribe((status: string) => { if (status === "SUBSCRIBED") subscribed = true; });
    return () => { safeRemoveChannel(ch, subscribed); };
  }, [stayId, loadFolio]);

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

  const handleConfirmCheckOut = async () => {
    if (!keyLocation || !propertyId) return;
    setCheckOutModalOpen(false);
    setIsSaving(true);
    try {
      await StayService.performCheckOut(propertyId, stay.id, actorId, actorName, keyLocation);
      toast.success("Check-out realizado!");
      await refresh();
    } catch { toast.error("Erro na operação."); } finally { setIsSaving(false); }
  };

  const handleAddFolioItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!propertyId) return;
    if (!newFolioItem.description || newFolioItem.quantity <= 0 || newFolioItem.unitPrice < 0) { toast.error("Preencha corretamente."); return; }
    setLoadingFolio(true);
    try {
      await StayService.addFolioItemManual(propertyId, stay.id,
        { description: newFolioItem.description, quantity: newFolioItem.quantity, unitPrice: newFolioItem.unitPrice, totalPrice: newFolioItem.quantity * newFolioItem.unitPrice, category: "other", addedBy: userData?.id || "SYSTEM" },
        userData?.id || "unknown", actorName);
      toast.success("Item adicionado."); setNewFolioItem({ description: "", quantity: 1, unitPrice: 0 }); void loadFolio();
    } catch { toast.error("Erro ao adicionar."); } finally { setLoadingFolio(false); }
  };

  const handleDeleteFolioItem = async (id: string, desc: string) => {
    if (!propertyId) return;
    if (!(await confirm({ title: "Estornar este lançamento?", description: `“${desc}” sai do fólio. O estorno fica registrado no histórico.`, confirmLabel: "Estornar", tone: "danger" }))) return;
    setLoadingFolio(true);
    try { await StayService.deleteFolioItem(propertyId, stay.id, id, desc, userData?.id || "unknown", actorName); toast.success("Item estornado."); void loadFolio(); }
    catch { toast.error("Erro ao estornar."); } finally { setLoadingFolio(false); }
  };

  const handleToggleFolioStatus = async (id: string, cur: string) => {
    if (!propertyId) return;
    const next = cur === "paid" ? "pending" : "paid";
    setLoadingFolio(true);
    try { await StayService.toggleFolioItemStatus(propertyId, stay.id, id, next as any, userData?.id || "unknown", actorName); toast.success(next === "paid" ? "Baixado!" : "Reaberto."); void loadFolio(); }
    catch { toast.error("Erro ao atualizar."); } finally { setLoadingFolio(false); }
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
    const totalFolio = folioItems.reduce((a, i) => a + i.totalPrice, 0);
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
    return { locked, totalFolio, selectedCabin, actualCounts, acfDiverges, nights, petList, maxPets };
  }, [isEditing, isGovOnly, folioItems, cabins, formData, stay, currentProperty?.settings]);

  return {
    // identidade
    propertyId, isGovOnly, guestId: guest?.id as string | undefined,
    // estado
    loading, notFound, isSaving, isEditing, setIsEditing, stay, guest, formData, setFormData, guestData, setGuestData,
    cabins, fnrhDomains, checkInStr, setCheckInStr, checkOutStr, setCheckOutStr, expandedArea, setExpandedArea,
    folioItems, loadingFolio, newFolioItem, setNewFolioItem, loadFolio,
    checkOutModalOpen, setCheckOutModalOpen, keyLocation, setKeyLocation,
    transferDialogOpen, setTransferDialogOpen, pendingTransferCabinId, setPendingTransferCabinId,
    // ações
    handleCancel, handleSave, doSave, handleToggleCheckOut, handleConfirmCheckOut,
    handleAddFolioItem, handleDeleteFolioItem, handleToggleFolioStatus, fetchAddressByCep,
    patchPet, addPet, removePet, togglePet,
    ...computed,
  };
}

export type StayDetailState = ReturnType<typeof useStayDetail>;
