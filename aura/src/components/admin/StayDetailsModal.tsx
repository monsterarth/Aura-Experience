// src/components/admin/StayDetailsModal.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Edit2, Save, Calendar, User,
  MapPin, Phone, Mail, Car, FileText,
  Users, CheckCircle, Clock, Plane,
  Briefcase, PawPrint, Trash2, Plus,
  LogIn, LogOut, RotateCcw, Sparkles, Receipt, RefreshCw, ShoppingCart, Coffee, BedDouble, ArrowRight, Search, UserRoundPen,
  KeyRound, AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { StayService } from "@/services/stay-service";
import { chatwootSyncOnCabinTransfer, chatwootSyncOnCheckIn, chatwootSyncOnCheckOut } from "@/app/actions/chatwoot-actions";
import { GuestService } from "@/services/guest-service";
import { CabinService } from "@/services/cabin-service";
import { ContactService } from "@/services/contact-service";
import { FnrhService, FnrhDomain } from "@/services/fnrh-service";
import { sanitizeDocumentForFnrh } from "@/lib/utils-checkin";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Stay, Guest, Cabin, FolioItem } from "@/types/aura";

interface StayDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stay: Stay & { guestName?: string; cabinName?: string };
  guest: Guest;
  onViewGuest?: (guestId: string) => void;
  onUpdate?: () => void;
}


const formatDateForInput = (timestamp: any) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const parseDateFromInput = (dateStr: string, originalTimestamp: any): string | null => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = originalTimestamp ? new Date(originalTimestamp) : new Date();
  d.setFullYear(year, month - 1, day);
  return d.toISOString();
};

const Label = ({ icon: Icon, children }: { icon: any, children: React.ReactNode }) => (
  <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground mb-1.5">
    <Icon size={12} className="text-primary" /> {children}
  </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cn(
      "w-full bg-background border border-border rounded-xl p-2.5 text-foreground text-xs outline-none focus:border-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:light] dark:[color-scheme:dark]",
      props.className
    )}
  />
);

const Select = ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground text-xs outline-none focus:border-primary/50 transition-colors appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </select>
);

export function StayDetailsModal({ isOpen, onClose, stay, guest, onViewGuest, onUpdate }: StayDetailsModalProps) {
  const { userData } = useAuth();

  const isGovOnly = userData?.role === 'governance';

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [keyLocation, setKeyLocation] = useState<'reception' | 'cabin' | 'unknown' | null>(null);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Stay>>({});
  const [guestData, setGuestData] = useState<Partial<Guest>>({});
  const [cabins, setCabins] = useState<Cabin[]>([]);

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [pendingTransferCabinId, setPendingTransferCabinId] = useState<string | null>(null);

  const [showReassign, setShowReassign] = useState(false);
  const [reassignSearch, setReassignSearch] = useState("");
  const [reassignResults, setReassignResults] = useState<Guest[]>([]);
  const [reassignLoading, setReassignLoading] = useState(false);

  const [fnrhDomains, setFnrhDomains] = useState<{
    generos: FnrhDomain[];
    racas: FnrhDomain[];
    transportes: FnrhDomain[];
    motivos: FnrhDomain[];
    tiposDocumento: FnrhDomain[];
  } | null>(null);

  const [checkInStr, setCheckInStr] = useState("");
  const [checkOutStr, setCheckOutStr] = useState("");

  const isCoreFieldLocked = !isEditing || isGovOnly;

  // ==========================================
  // ESTADOS DO FOLIO (CONTA & CONSUMO)
  // ==========================================
  const [folioItems, setFolioItems] = useState<FolioItem[]>([]);
  const [loadingFolio, setLoadingFolio] = useState(false);
  const [newFolioItem, setNewFolioItem] = useState({ description: "", quantity: 1, unitPrice: 0 });

  useEffect(() => {
    if (isOpen && stay?.propertyId) {
      CabinService.getCabinsByProperty(stay.propertyId).then(setCabins);
      Promise.all([
        FnrhService.getGeneros(),
        FnrhService.getRacas(),
        FnrhService.getMeiosTransporte(),
        FnrhService.getMotivosViagem(),
        FnrhService.getTiposDocumento()
      ]).then(([generos, racas, transportes, motivos, tiposDocumento]) => {
        setFnrhDomains({ generos, racas, transportes, motivos, tiposDocumento });
      });
    }
  }, [isOpen, stay?.propertyId]);

  const initData = useCallback(() => {
    if (stay && guest) {
      setCheckInStr(formatDateForInput(stay.checkIn));
      setCheckOutStr(formatDateForInput(stay.checkOut));

      setFormData({
        cabinId: stay.cabinId,
        expectedArrivalTime: stay.expectedArrivalTime || "",
        roomSetup: stay.roomSetup || "double",
        roomSetupNotes: stay.roomSetupNotes || "",
        counts: stay.counts || { adults: 1, children: 0, babies: 0 },
        vehiclePlate: stay.vehiclePlate || "",
        travelReason: stay.travelReason || "Turismo",
        transportation: stay.transportation || "Carro",
        lastCity: stay.lastCity || "",
        nextCity: stay.nextCity || "",
        hasPet: stay.hasPet || false,
        petDetails: stay.petDetails || { name: "", species: "Cachorro", weight: 0, breed: "" },
        additionalGuests: stay.additionalGuests || [],
        housekeepingItems: stay.housekeepingItems || [],
        cestaBreakfastEnabled: stay.cestaBreakfastEnabled || false,
        areaConfigs: stay.areaConfigs || []
      });

      setGuestData({
        fullName: guest.fullName || "",
        nationality: guest.nationality || "Brasil",
        document: guest.document || { type: 'CPF', number: '' },
        birthDate: guest.birthDate || "",
        gender: guest.gender || "Outro",
        raca: guest.raca || "NAO_DECLARADO",
        occupation: guest.occupation || "",
        email: guest.email || "",
        phone: guest.phone || "",
        address: guest.address || {
          street: "", number: "", neighborhood: "",
          city: "", state: "", zipCode: "", country: "Brasil",
          ibgeCityId: ""
        }
      });

      // Carrega o extrato sempre que abrir o modal
      loadFolio();
    }
  }, [stay, guest]);

  useEffect(() => {
    initData();
  }, [initData]);

  // Realtime: escuta mudanças na tabela stay_folio para esta estadia
  useEffect(() => {
    if (!isOpen || !stay?.id) return;

    const channel = supabase.channel(`folio_${stay.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'folio_items', filter: `stayId=eq.${stay.id}` },
        () => loadFolio()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isOpen, stay?.id]);

  const loadFolio = async () => {
    if (!stay) return;
    setLoadingFolio(true);
    try {
      const items = await StayService.getStayFolio(stay.propertyId, stay.id);
      setFolioItems(items);
    } catch (error) {
      toast.error("Erro ao carregar o extrato.");
    } finally {
      setLoadingFolio(false);
    }
  };

  const handleAddFolioItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolioItem.description || newFolioItem.quantity <= 0 || newFolioItem.unitPrice < 0) {
      return toast.error("Preencha os campos do item corretamente.");
    }
    setLoadingFolio(true);
    try {
      await StayService.addFolioItemManual(
        stay.propertyId,
        stay.id,
        {
          description: newFolioItem.description,
          quantity: newFolioItem.quantity,
          unitPrice: newFolioItem.unitPrice,
          totalPrice: newFolioItem.quantity * newFolioItem.unitPrice,
          category: 'other',
          addedBy: userData?.id || "SYSTEM"
        },
        userData?.id || "unknown",
        userData?.fullName || "Recepção"
      );
      toast.success("Item adicionado à conta.");
      setNewFolioItem({ description: "", quantity: 1, unitPrice: 0 });
      loadFolio();
      if (onUpdate) onUpdate(); // Atualiza lista de estadias (para o ícone de alerta)
    } catch (error) {
      toast.error("Erro ao adicionar item.");
    } finally {
      setLoadingFolio(false);
    }
  };

  const handleDeleteFolioItem = async (itemId: string, description: string) => {
    if (!confirm(`Deseja realmente estornar o item "${description}"?`)) return;
    setLoadingFolio(true);
    try {
      await StayService.deleteFolioItem(
        stay.propertyId, stay.id, itemId, description, userData?.id || "unknown", userData?.fullName || "Recepção"
      );
      toast.success("Item estornado com sucesso.");
      loadFolio();
      if (onUpdate) onUpdate(); // Atualiza lista de estadias
    } catch (error) {
      toast.error("Erro ao estornar item.");
    } finally {
      setLoadingFolio(false);
    }
  };

  // NOVA FUNÇÃO: Marcar como Pago / Pendente
  const handleToggleFolioStatus = async (itemId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    setLoadingFolio(true);
    try {
      await StayService.toggleFolioItemStatus(
        stay.propertyId, stay.id, itemId, newStatus as 'pending' | 'paid', userData?.id || "unknown", userData?.fullName || "Recepção"
      );
      toast.success(newStatus === 'paid' ? "Item baixado!" : "Item reaberto.");
      loadFolio();
      if (onUpdate) onUpdate(); // Atualiza lista de estadias (para o ícone de alerta sumir se tudo for pago)
    } catch (error) {
      toast.error("Erro ao atualizar status do item.");
    } finally {
      setLoadingFolio(false);
    }
  };

  const fetchAddressByCep = async (cep: string | undefined) => {
    if (!cep) return;
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.erro) {
        toast.error("CEP não encontrado.");
        return;
      }

      setGuestData((prev: any) => ({
        ...prev,
        address: {
          ...prev.address,
          street: data.logradouro || prev.address?.street || "",
          neighborhood: data.bairro || prev.address?.neighborhood || "",
          city: data.localidade || prev.address?.city || "",
          state: data.uf || prev.address?.state || "",
          country: "Brasil",
          zipCode: data.cep || prev.address?.zipCode || "",
          ibgeCityId: data.ibge || prev.address?.ibgeCityId || ""
        }
      }));
      toast.success("Endereço preenchido com sucesso!");
    } catch (err) {
      console.error(err);
    }
  };

  const reassignDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!stay?.propertyId || !guest?.id) return;
    if (reassignDebounceRef.current) clearTimeout(reassignDebounceRef.current);
    if (reassignSearch.trim().length < 2) { setReassignResults([]); return; }
    reassignDebounceRef.current = setTimeout(async () => {
      setReassignLoading(true);
      try {
        const results = await GuestService.listGuests(stay.propertyId, reassignSearch.trim());
        setReassignResults(results.filter(g => g.id !== guest.id));
      } catch (err) {
        console.error('[ReassignSearch]', err);
        setReassignResults([]);
      } finally { setReassignLoading(false); }
    }, 300);
  }, [reassignSearch, stay?.propertyId, guest?.id]);

  if (!isOpen || !stay) return null;

  const handleCancel = () => {
    initData();
    setIsEditing(false);
    setShowReassign(false);
    setReassignSearch("");
    setReassignResults([]);
  };

  const handleSave = async () => {
    // Detect cabin change before saving
    const cabinChanged = formData.cabinId && formData.cabinId !== stay.cabinId;
    if (cabinChanged && stay.status === 'active') {
      // Ask about old cabin fate before proceeding
      setPendingTransferCabinId(formData.cabinId!);
      setTransferDialogOpen(true);
      return;
    }

    await doSave(cabinChanged ? formData.cabinId! : null, null);
  };

  const doSave = async (newCabinId: string | null, oldCabinDisposition: 'cleaning' | 'available' | null) => {
    const cleanHousekeeping = formData.housekeepingItems?.filter(i => i.label.trim() !== "") || [];
    setLoading(true);
    try {
      const parsedCheckIn = parseDateFromInput(checkInStr, stay.checkIn);
      const parsedCheckOut = parseDateFromInput(checkOutStr, stay.checkOut);

      // Strip cabinId from general payload — transfer is handled separately
      const { cabinId: _cabinId, ...restFormData } = formData;

      const fnrhStayPayload: Partial<Stay> = {
        ...restFormData,
        housekeepingItems: cleanHousekeeping,
        checkIn: parsedCheckIn || stay.checkIn,
        checkOut: parsedCheckOut || stay.checkOut,
        additionalGuests: formData.additionalGuests?.map(ag => ({
          ...ag,
          document: ag.document ? sanitizeDocumentForFnrh(ag.document) : ""
        }))
      };

      const fnrhGuestPayload: Partial<Guest> = {
        id: guest.id,
        ...guestData,
        document: {
          ...guestData.document!,
          number: sanitizeDocumentForFnrh(guestData.document?.number)
        }
      };

      const ops: Promise<any>[] = [
        StayService.updateStayData(stay.propertyId, stay.id, fnrhStayPayload, userData?.id || "ADMIN", userData?.fullName || "Recepção"),
        GuestService.upsertGuest(stay.propertyId, fnrhGuestPayload as Guest)
      ];

      // Handle cabin transfer separately
      if (newCabinId && oldCabinDisposition) {
        ops.push(StayService.transferCabin(stay.propertyId, stay.id, newCabinId, oldCabinDisposition, userData?.id || "ADMIN", userData?.fullName || "Recepção"));
      } else if (newCabinId && stay.status !== 'active') {
        // Pending stay: just reassign, no cabin status changes needed
        ops.push(StayService.transferCabin(stay.propertyId, stay.id, newCabinId, 'available', userData?.id || "ADMIN", userData?.fullName || "Recepção"));
      }

      await Promise.all(ops);

      if (newCabinId) {
        chatwootSyncOnCabinTransfer(stay.id, newCabinId).catch(() => {});
      }

      // Migrate contact/messages if phone number changed
      const oldPhone = guest.phone || "";
      const newPhone = guestData.phone || "";
      if (oldPhone && newPhone && ContactService.formatPhoneId(oldPhone) !== ContactService.formatPhoneId(newPhone)) {
        await ContactService.migrateContactPhone(stay.propertyId, oldPhone, newPhone, guestData.fullName || guest.fullName || "", guest.id);
      }

      toast.success("Ficha da hospedagem atualizada!");
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error(error);
      const msg = error?.message ?? '';
      if (msg.startsWith('CABIN_NOT_AVAILABLE')) {
        const label = msg.split(':')[2] ?? 'indisponível';
        toast.error(`Transferência bloqueada: acomodação ${label}. Verifique antes de prosseguir.`);
      } else {
        toast.error("Erro ao salvar alterações.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!window.confirm("Confirma o Check-in deste hóspede?")) return;
    setLoading(true);
    try {
      await StayService.performCheckIn(stay.propertyId, stay.id, userData?.id || "ADMIN", userData?.fullName || "Recepção");
      chatwootSyncOnCheckIn(stay.id).catch(() => {});
      toast.success("Check-in realizado com sucesso!");
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao realizar check-in.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCheckOut = () => {
    if (stay.status === 'active') {
      setKeyLocation(null);
      setCheckOutModalOpen(true);
    } else {
      handleUndoCheckOut();
    }
  };

  const handleUndoCheckOut = async () => {
    if (!window.confirm("Reativar esta estadia e colocar a cabana como ocupada?")) return;
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
      chatwootSyncOnCheckOut(stay.id).catch(() => {});
      toast.success("Check-out realizado com sucesso!");
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao realizar check-out.");
    } finally {
      setLoading(false);
    }
  };

  const updateAdditionalGuest = (index: number, field: string, value: string) => {
    const newGuests = [...(formData.additionalGuests || [])];
    (newGuests[index] as any)[field] = value;
    setFormData({ ...formData, additionalGuests: newGuests });
  };
  const removeAdditionalGuest = (index: number) => {
    const newGuests = (formData.additionalGuests || []).filter((_, i) => i !== index);
    setFormData({ ...formData, additionalGuests: newGuests });
  };
  const addAdditionalGuest = (type: 'adult' | 'child' | 'free') => {
    const newGuests = [...(formData.additionalGuests || [])];
    newGuests.push({ id: Date.now().toString(), type, fullName: "", document: "" });
    setFormData({ ...formData, additionalGuests: newGuests });
  };

  const addStayHousekeepingItem = () => {
    const newItems = [...(formData.housekeepingItems || []), { id: Date.now().toString(), label: "" }];
    setFormData({ ...formData, housekeepingItems: newItems });
  };
  const updateStayHousekeepingItem = (id: string, label: string) => {
    const newItems = (formData.housekeepingItems || []).map(i => i.id === id ? { ...i, label } : i);
    setFormData({ ...formData, housekeepingItems: newItems });
  };
  const removeStayHousekeepingItem = (id: string) => {
    const newItems = (formData.housekeepingItems || []).filter(i => i.id !== id);
    setFormData({ ...formData, housekeepingItems: newItems });
  };

  const handleReassignGuest = async (newGuest: Guest) => {
    if (!window.confirm(`Alterar o titular desta reserva para ${newGuest.fullName}?`)) return;
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

  const statusMap: any = {
    pending: { label: 'Pendente', class: 'text-yellow-600 border-yellow-600/30' },
    pre_checkin_done: { label: 'Pré Check-in OK', class: 'text-blue-600 border-blue-600/30' },
    active: { label: 'Hospedado', class: 'text-green-600 border-green-600/30' },
    finished: { label: 'Encerrado', class: 'text-zinc-500 border-zinc-500/30' },
    cancelled: { label: 'Cancelado', class: 'text-red-600 border-red-600/30' },
  };
  const currentStatus = statusMap[stay.status] || { label: stay.status, class: 'text-muted-foreground border-border' };

  const totalFolio = folioItems.reduce((acc, item) => acc + item.totalPrice, 0);

  const selectedCabin = cabins.find(c => c.id === (formData.cabinId || stay.cabinId));

  const AreaSection = () => {
    if (!selectedCabin?.layout?.length) return null;
    const bedLabel = (b: any) => ({ single: "Solteiro", double: "Casal", sofa_bed: "Sofá-Cama" }[b.type as string] ?? b.label ?? "Extra") as string;
    return (
      <div className="space-y-2 pt-1">
        {selectedCabin.layout.map((area: any) => {
          const configs: any[][] = area.configs ?? (area.beds ? [area.beds] : [[]]);
          const fixed = configs.length <= 1;
          const selIdx = (formData.areaConfigs || []).find((ac: any) => ac.areaId === area.id)?.configIndex ?? 0;
          return (
            <div key={area.id} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-secondary/50">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{area.name || area.type}</span>
                {fixed && <span className="text-[9px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded">Padrão</span>}
              </div>
              {fixed ? (
                <div className="px-3 py-2.5 flex flex-wrap gap-1.5">
                  {(configs[0] || []).map((b: any) => (
                    <span key={b.id} className="flex items-center gap-1 bg-background border border-border px-2.5 py-1 rounded-lg text-xs font-semibold">🛏 {bedLabel(b)}</span>
                  ))}
                </div>
              ) : expandedArea === area.id ? (
                <div className="p-2 flex flex-col gap-1.5">
                  {configs.map((cfg, idx) => {
                    const lbl = cfg.length ? cfg.map(bedLabel).join(" + ") : `Opção ${String.fromCharCode(65 + idx)}`;
                    const sel = selIdx === idx;
                    return (
                      <button key={idx} type="button"
                        onClick={() => { setFormData((p: any) => ({ ...p, areaConfigs: [...(p.areaConfigs || []).filter((ac: any) => ac.areaId !== area.id), { areaId: area.id, configIndex: idx }] })); setExpandedArea(null); }}
                        className={cn("w-full px-3 py-2 rounded-lg border text-left text-xs font-bold transition-all flex items-center gap-2",
                          sel ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50")}>
                        <span className={cn("w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center", sel ? "border-primary-foreground" : "border-border")}>
                          {sel && <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                        </span>
                        🛏 {lbl}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(configs[selIdx] || configs[0] || []).map((b: any) => (
                      <span key={b.id} className="flex items-center gap-1 bg-background border border-border px-2.5 py-1 rounded-lg text-xs font-semibold">🛏 {bedLabel(b)}</span>
                    ))}
                  </div>
                  {isEditing && <button type="button" onClick={() => setExpandedArea(area.id)} className="shrink-0 px-2.5 py-1 bg-secondary border border-border rounded-lg text-xs font-bold uppercase text-primary hover:bg-accent transition-colors">Alterar</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border w-full max-w-5xl rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">

        <header className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-xl border border-primary/20 shadow-sm">
              {guest?.fullName?.charAt(0) || "G"}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                {guest?.fullName}
                <span className={cn("px-2 py-0.5 rounded-full text-[9px] uppercase font-black tracking-wider border bg-background", currentStatus.class)}>
                  {currentStatus.label}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Reserva: <span className="font-mono">{stay.accessCode}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                {['pending', 'pre_checkin_done'].includes(stay.status) && (
                  <button onClick={handleCheckIn} disabled={loading} className="px-4 py-2 bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2">
                    <LogIn size={16} /> Check-in
                  </button>
                )}

                {stay.status === 'active' && (
                  <button onClick={handleToggleCheckOut} disabled={loading} className="px-4 py-2 bg-orange-500/10 text-orange-600 hover:bg-orange-500 hover:text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2">
                    <LogOut size={16} /> Check-out
                  </button>
                )}

                {stay.status === 'finished' && (
                  <button onClick={handleToggleCheckOut} disabled={loading} className="px-4 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2">
                    <RotateCcw size={16} /> Reativar
                  </button>
                )}

                <button onClick={() => setIsEditing(true)} className="px-4 py-2 hover:bg-accent rounded-xl text-muted-foreground hover:text-foreground transition-all flex items-center gap-2 text-xs font-bold uppercase">
                  <Edit2 size={16} /> Editar
                </button>
              </>
            ) : (
              <>
                <button onClick={handleCancel} className="px-4 py-2 hover:bg-accent rounded-xl text-muted-foreground hover:text-foreground text-xs font-bold uppercase transition-all">Cancelar</button>
                <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-primary hover:opacity-90 text-primary-foreground rounded-xl text-xs font-bold uppercase flex items-center gap-2 transition-all active:scale-95 shadow-sm">
                  {loading ? "Salvando..." : <><Save size={14} /> Salvar</>}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => window.open(`/admin/stays/${stay.id}`, '_blank')}
              className="px-4 py-2 bg-secondary hover:bg-accent rounded-xl text-xs font-bold uppercase flex items-center gap-2 text-foreground transition-all"
            >
              <FileText size={16} /> Ficha Completa
            </button>
            <button onClick={onClose} className="p-3 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-xl transition-all"><X size={20} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">

          {/* Top row: 2-col grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">

            {/* Left card: Datas & Acomodação */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/40">
                <Calendar size={13} className="text-primary" />
                <span className="text-[11px] font-black uppercase tracking-widest text-foreground">Datas & Acomodação</span>
              </div>
              <div className="p-4 space-y-3">
                {/* 3-col mini: Check-in | Check-out | Chegada Prevista */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label icon={Clock}>Check-in</Label>
                    {isEditing ? (
                      <Input disabled={isCoreFieldLocked} type="date" value={checkInStr} onChange={e => setCheckInStr(e.target.value)} />
                    ) : (
                      <div className="text-foreground font-mono bg-secondary p-2 rounded-xl text-xs border border-border">
                        {stay.checkIn ? format(new Date(stay.checkIn), "dd/MM/yy") : "—"}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label icon={Clock}>Check-out</Label>
                    {isEditing ? (
                      <Input disabled={isCoreFieldLocked} type="date" value={checkOutStr} onChange={e => setCheckOutStr(e.target.value)} />
                    ) : (
                      <div className="text-foreground font-mono bg-secondary p-2 rounded-xl text-xs border border-border">
                        {stay.checkOut ? format(new Date(stay.checkOut), "dd/MM/yy") : "—"}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label icon={Clock}>Chegada</Label>
                    <Input disabled={isCoreFieldLocked} type="time" value={formData.expectedArrivalTime} onChange={e => setFormData({ ...formData, expectedArrivalTime: e.target.value })} />
                  </div>
                </div>

                {/* Acomodação */}
                <div>
                  <Label icon={BedDouble}>Acomodação</Label>
                  {isEditing ? (
                    <Select disabled={isCoreFieldLocked} value={formData.cabinId} onChange={e => setFormData({ ...formData, cabinId: e.target.value })}>
                      {cabins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  ) : (
                    <div className="text-foreground font-bold p-2 bg-secondary rounded-xl border border-border text-sm">{stay.cabinName}</div>
                  )}
                </div>

                {/* Cabin History */}
                {stay.cabinHistory && stay.cabinHistory.length > 0 && (
                  <div className="mt-2 p-3 bg-secondary/50 rounded-xl border border-border space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-1">Histórico de Acomodações</p>
                    {stay.cabinHistory.map((entry, idx) => {
                      const cabinName = cabins.find(c => c.id === entry.cabinId)?.name || "Cabana";
                      return (
                        <div key={idx} className="flex items-center gap-2 text-xs text-foreground/60">
                          <BedDouble size={12} className="shrink-0 text-foreground/30" />
                          <span className="font-semibold">{cabinName}</span>
                          <span className="text-foreground/30">
                            {format(new Date(entry.from), "dd/MM")} — {format(new Date(entry.to), "dd/MM")}
                          </span>
                          <ArrowRight size={10} className="text-foreground/20" />
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 text-xs text-foreground">
                      <BedDouble size={12} className="shrink-0 text-primary" />
                      <span className="font-bold">{stay.cabinName || cabins.find(c => c.id === stay.cabinId)?.name || "Atual"}</span>
                      <span className="text-foreground/50">
                        {format(new Date(stay.cabinHistory[stay.cabinHistory.length - 1].to), "dd/MM")} — atual
                      </span>
                    </div>
                  </div>
                )}

                {/* AreaSection */}
                <AreaSection />
              </div>
            </div>

            {/* Right card: Titular */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/40">
                <div className="flex items-center gap-2">
                  <User size={13} className="text-primary" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-foreground">Titular</span>
                </div>
                {isEditing && !isGovOnly && (
                  <button
                    type="button"
                    onClick={() => setShowReassign(!showReassign)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all",
                      showReassign
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                  >
                    <UserRoundPen size={12} /> Alterar Titular
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                {showReassign ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        autoFocus
                        value={reassignSearch}
                        onChange={e => setReassignSearch(e.target.value)}
                        placeholder="Buscar por nome, documento, email..."
                        className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2.5 text-xs outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                    {reassignLoading && <p className="text-[11px] text-muted-foreground text-center py-2">Buscando...</p>}
                    {!reassignLoading && reassignSearch.trim().length >= 2 && reassignResults.length === 0 && (
                      <p className="text-[11px] text-muted-foreground text-center py-2">Nenhum hóspede encontrado.</p>
                    )}
                    {reassignResults.length > 0 && (
                      <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                        {reassignResults.slice(0, 8).map(g => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => handleReassignGuest(g)}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all text-left"
                          >
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground/60 shrink-0">
                              {g.fullName?.charAt(0) || "?"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">{g.fullName}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{g.document?.type}: {g.document?.number}{g.phone ? ` · ${g.phone}` : ""}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                      Selecione um hóspede já cadastrado para substituir o titular desta reserva. As demais reservas do grupo não serão afetadas.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-bold text-foreground text-sm">{guestData.fullName || "—"}</p>
                    </div>
                    <div>
                      <Label icon={Phone}>WhatsApp</Label>
                      {isEditing ? (
                        <Input disabled={isCoreFieldLocked} value={guestData.phone} onChange={e => setGuestData({ ...guestData, phone: e.target.value })} />
                      ) : (
                        <p className="text-sm text-foreground">{guestData.phone || "—"}</p>
                      )}
                    </div>
                    {guest?.id && (
                      <button
                        type="button"
                        onClick={() => window.open(`/admin/guests?id=${guest.id}`, '_blank')}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
                      >
                        Ver Hóspede →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Full-width: Conta & Consumo */}
          <div className="px-4 pb-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/40">
                <div className="flex items-center gap-2">
                  <Receipt size={13} className="text-primary" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-foreground">Conta & Consumo</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase text-muted-foreground">Total</p>
                    <p className="text-base font-black text-primary leading-none">R$ {totalFolio.toFixed(2)}</p>
                  </div>
                  <button onClick={loadFolio} disabled={loadingFolio} className="p-1.5 rounded-lg bg-secondary hover:bg-accent transition-all disabled:opacity-50">
                    <RefreshCw size={13} className={loadingFolio ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <div className="flex gap-4 items-start flex-col xl:flex-row">
                  <div className="flex-1 min-w-0 border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-secondary/50 border-b border-border">
                        <tr>
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-muted-foreground">Item / Descrição</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-muted-foreground text-center w-14">Qtd</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-muted-foreground text-right w-20">Unit.</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-muted-foreground text-right w-24">Total</th>
                          {!isGovOnly && <th className="w-10" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {folioItems.length === 0 ? (
                          <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">Nenhum consumo registrado nesta estadia.</td></tr>
                        ) : folioItems.map(item => (
                          <tr key={item.id} className={cn("hover:bg-muted/20 transition-colors text-sm", item.status === "paid" && "opacity-50")}>
                            <td className="px-4 py-3 font-semibold text-foreground">
                              <div className="flex items-center gap-2.5">
                                {!isGovOnly && (
                                  <button onClick={() => handleToggleFolioStatus(item.id, item.status || "pending")}
                                    className={cn("w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0",
                                      item.status === "paid" ? "bg-green-500 border-green-500 text-white" : "border-border hover:border-primary")}>
                                    {item.status === "paid" && <CheckCircle size={12} strokeWidth={3} />}
                                  </button>
                                )}
                                <div>
                                  <span className={item.status === "paid" ? "line-through text-muted-foreground" : ""}>{item.description}</span>
                                  <p className="text-[10px] text-muted-foreground font-normal mt-0.5 flex items-center gap-1">
                                    <Clock size={9} /> {item.createdAt ? format(new Date(item.createdAt), "dd/MM HH:mm") : "—"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center text-muted-foreground font-medium">{item.quantity}×</td>
                            <td className="px-3 py-3 text-right text-muted-foreground">R$ {item.unitPrice.toFixed(2)}</td>
                            <td className="px-3 py-3 text-right font-black">R$ {item.totalPrice.toFixed(2)}</td>
                            {!isGovOnly && (
                              <td className="pr-3 py-3 text-right">
                                <button onClick={() => handleDeleteFolioItem(item.id, item.description)} className="p-1.5 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 size={13} /></button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!isGovOnly && (
                    <form onSubmit={handleAddFolioItem} className="xl:w-60 w-full bg-secondary/50 border border-border p-4 rounded-xl space-y-3 shrink-0">
                      <h4 className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-primary"><ShoppingCart size={13} /> Lançamento</h4>
                      <div>
                        <label className="text-[9px] font-bold uppercase text-muted-foreground">Produto / Serviço</label>
                        <input required value={newFolioItem.description} onChange={e => setNewFolioItem({ ...newFolioItem, description: e.target.value })}
                          placeholder="Ex: Lenha extra" className="mt-0.5 w-full bg-background border border-border px-3 py-2 rounded-xl text-xs outline-none focus:border-primary text-foreground" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold uppercase text-muted-foreground">Qtd</label>
                          <input type="number" min="1" required value={newFolioItem.quantity} onChange={e => setNewFolioItem({ ...newFolioItem, quantity: Number(e.target.value) })}
                            className="mt-0.5 w-full bg-background border border-border px-3 py-2 rounded-xl text-xs outline-none focus:border-primary text-foreground" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-muted-foreground">R$ Unit.</label>
                          <input type="number" step="0.01" min="0" required value={newFolioItem.unitPrice || ""} onChange={e => setNewFolioItem({ ...newFolioItem, unitPrice: Number(e.target.value) })}
                            className="mt-0.5 w-full bg-background border border-border px-3 py-2 rounded-xl text-xs outline-none focus:border-primary text-foreground" />
                        </div>
                      </div>
                      <button type="submit" disabled={loadingFolio} className="w-full py-2 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 disabled:opacity-50">
                        Adicionar à Conta
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    {/* Transfer Cabin Dialog */}
    {transferDialogOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="bg-background w-full max-w-sm rounded-[24px] overflow-hidden shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="text-amber-500" size={32} />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Mudança de Acomodação</h2>
          <p className="text-sm text-foreground/60 mb-6">
            O hóspede já realizou check-in. A acomodação anterior precisa de limpeza de troca?
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={async () => {
                setTransferDialogOpen(false);
                await doSave(pendingTransferCabinId, 'cleaning');
                setPendingTransferCabinId(null);
              }}
              className="w-full py-3 px-4 bg-amber-500/10 border border-amber-500 text-amber-600 font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-amber-500 hover:text-white transition-all"
            >
              Sim, Gerar Faxina (Troca)
            </button>
            <button
              onClick={async () => {
                setTransferDialogOpen(false);
                await doSave(pendingTransferCabinId, 'available');
                setPendingTransferCabinId(null);
              }}
              className="w-full py-3 px-4 bg-secondary text-foreground font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-muted border border-border transition-all"
            >
              Não, Apenas Liberar
            </button>
            <button
              onClick={() => { setTransferDialogOpen(false); setPendingTransferCabinId(null); }}
              className="w-full py-3 px-4 text-muted-foreground font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-secondary/50 transition-all mt-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de localização da chave no Check-out */}
    {checkOutModalOpen && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center">
              <KeyRound size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-black text-foreground">Localização da Chave</h2>
              <p className="text-xs text-muted-foreground">Onde está a chave da acomodação?</p>
            </div>
          </div>

          <div className="space-y-2">
            {([
              { value: 'reception', label: 'Na Recepção', desc: 'Hóspede devolveu a chave', color: 'border-green-500/40 bg-green-500/5 hover:bg-green-500/10', active: 'border-green-500 bg-green-500/15', dot: 'bg-green-500' },
              { value: 'cabin', label: 'Na Acomodação', desc: 'Chave ficou no quarto', color: 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10', active: 'border-red-500 bg-red-500/15', dot: 'bg-red-500' },
              { value: 'unknown', label: 'Não sabemos', desc: 'Localização desconhecida', color: 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10', active: 'border-red-500 bg-red-500/15', dot: 'bg-red-500' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setKeyLocation(opt.value)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left",
                  keyLocation === opt.value ? opt.active : opt.color
                )}
              >
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", opt.dot)} />
                <div>
                  <p className="text-sm font-bold text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                {keyLocation === opt.value && <CheckCircle size={16} className="ml-auto text-foreground shrink-0" />}
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setCheckOutModalOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-accent transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmCheckOut}
              disabled={!keyLocation}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-40 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <LogOut size={15} /> Confirmar Check-out
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
