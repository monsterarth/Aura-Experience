"use client";

// Estado e regras do formulário de nova hospedagem (lógica portada 1:1 da página original).
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { addDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { GuestService } from "@/services/guest-service";
import { StayService } from "@/services/stay-service";
import { CabinService } from "@/services/cabin-service";
import { ContactService } from "@/services/contact-service";
import { chatwootSyncOnStayCreated } from "@/app/actions/chatwoot-actions";
import { validateCPF } from "@/lib/utils-checkin";
import { defaultCountryForLang, splitPhone, joinPhone, isLocalNumberValid } from "@/lib/phone";
import type { Cabin, Guest } from "@/types/aura";

export interface CabinSelection {
  cabinId: string;
  name: string;
  adults: number;
  children: number;
  babies: number;
}

export type Lang = "pt" | "en" | "es";

/**
 * Busca o hóspede pelo documento via rota de servidor (service-role).
 * Chamar o GuestService direto do browser passa pelo lock de auth e, frio, nunca resolve.
 * O AbortController de 10s garante que a promise sempre termina.
 */
async function lookupGuestByDoc(propertyId: string, doc: string): Promise<Guest | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`/api/admin/guests/lookup?propertyId=${encodeURIComponent(propertyId)}&doc=${encodeURIComponent(doc)}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Falha na consulta do documento (${res.status})`);
    const json = await res.json();
    return (json?.guest ?? null) as Guest | null;
  } finally {
    clearTimeout(timer);
  }
}

export function useNewStay() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();

  // Query params: mapa (arrastar p/ criar), hóspedes e funil de vendas
  const prefilledCabinId = searchParams.get("cabinId");
  const prefilledCheckIn = searchParams.get("checkIn");
  const prefilledCheckOut = searchParams.get("checkOut");
  const prefilledGuestId = searchParams.get("guestId");
  const prefilledQuoteId = searchParams.get("quoteId");
  /** Composição fechada no funil — sem ela a estadia nasceria sempre com 2 adultos. */
  const seedPax = {
    adults: Math.max(1, parseInt(searchParams.get("adults") || "") || 2),
    children: Math.max(0, parseInt(searchParams.get("children") || "") || 0),
    babies: Math.max(0, parseInt(searchParams.get("babies") || "") || 0),
  };

  const [loading, setLoading] = useState(false);
  const [searchingGuest, setSearchingGuest] = useState(false);
  const searchInFlight = useRef(false);
  const [availableCabins, setAvailableCabins] = useState<Cabin[]>([]);
  const [loadingCabins, setLoadingCabins] = useState(true);

  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [guestData, setGuestData] = useState({ fullName: "", email: "", phone: "", preferredLanguage: "pt" as Lang });
  // DDI separado: pt nasce "55"; en/es nasce vazio e obrigatório.
  const [phoneCountry, setPhoneCountry] = useState("55");
  const countryTouched = useRef(false);

  const [cabinSelections, setCabinSelections] = useState<CabinSelection[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (prefilledCheckIn && prefilledCheckOut) return { from: new Date(prefilledCheckIn + "T12:00:00"), to: new Date(prefilledCheckOut + "T12:00:00") };
    return { from: addDays(new Date(), 1), to: addDays(new Date(), 3) };
  });

  const [sendAutomations, setSendAutomations] = useState(true);
  const [internalUse, setInternalUse] = useState(false);
  const [internalLabel, setInternalLabel] = useState("");
  const [createdInfo, setCreatedInfo] = useState<{ code: string } | null>(null);

  // Reserva de uso da casa nasce sem comunicação automática
  const toggleInternalUse = (checked: boolean) => { setInternalUse(checked); if (checked) setSendAutomations(false); };

  // Troca de idioma reposiciona o DDI padrão — só enquanto o operador não mexeu no campo.
  useEffect(() => {
    if (countryTouched.current) return;
    setPhoneCountry(defaultCountryForLang(guestData.preferredLanguage));
  }, [guestData.preferredLanguage]);

  useEffect(() => {
    if (!property?.id) return;
    setLoadingCabins(true);
    CabinService.getCabinsByProperty(property.id).then(cabinsData => {
      setAvailableCabins(cabinsData);
      if (prefilledCabinId && cabinSelections.length === 0) {
        const match = cabinsData.find(c => c.id === prefilledCabinId);
        if (match) setCabinSelections([{ cabinId: match.id, name: match.name, ...seedPax }]);
      }
    }).finally(() => setLoadingCabins(false));

    if (prefilledGuestId) {
      lookupGuestByDoc(property.id, prefilledGuestId).then(guest => {
        if (!guest) return;
        setDocNumber(guest.id);
        const gl = (guest.preferredLanguage as Lang) || "pt";
        const { country, number, hadCountry } = splitPhone(guest.phone, gl);
        if (hadCountry) countryTouched.current = true;
        setPhoneCountry(country);
        setGuestData({ fullName: guest.fullName, email: guest.email || "", phone: number, preferredLanguage: gl });
      }).catch(() => { /* best-effort */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id]);

  const handleSearchGuest = async () => {
    if (!docNumber || !property?.id) return;
    if (searchInFlight.current) return;
    searchInFlight.current = true;
    setSearchingGuest(true);
    try {
      const guest = await lookupGuestByDoc(property.id, docNumber);
      if (guest) {
        const gl = (guest.preferredLanguage as Lang) || "pt";
        const { country, number, hadCountry } = splitPhone(guest.phone, gl);
        if (hadCountry) countryTouched.current = true;
        setPhoneCountry(country);
        setGuestData({ fullName: guest.fullName, email: guest.email || "", phone: number, preferredLanguage: gl });
        toast.info("Hóspede encontrado!");
      } else {
        toast.info("Hóspede novo. Preencha os dados.");
      }
    } catch {
      toast.error("Não foi possível consultar o documento. Preencha os dados manualmente.");
    } finally {
      searchInFlight.current = false;
      setSearchingGuest(false);
    }
  };

  const toggleCabin = (cabin: { id: string; name: string }) => {
    setCabinSelections(prev => {
      const exists = prev.find(s => s.cabinId === cabin.id);
      if (exists) return prev.filter(s => s.cabinId !== cabin.id);
      // A PRIMEIRA cabana herda a composição do funil; as seguintes começam no padrão.
      const pax = prev.length === 0 ? seedPax : { adults: 2, children: 0, babies: 0 };
      return [...prev, { cabinId: cabin.id, name: cabin.name, ...pax }];
    });
  };

  const setSelectedCabinIds = (ids: string[]) => {
    setCabinSelections(prev => {
      const kept = prev.filter(s => ids.includes(s.cabinId));
      const added = ids.filter(id => !prev.some(s => s.cabinId === id)).map(id => {
        const c = availableCabins.find(x => x.id === id)!;
        const pax = kept.length === 0 && prev.length === 0 ? seedPax : { adults: 2, children: 0, babies: 0 };
        return { cabinId: c.id, name: c.name, ...pax };
      });
      return [...kept, ...added];
    });
  };

  const updateCabinACF = (idx: number, field: "adults" | "children" | "babies", val: number) => {
    setCabinSelections(prev => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));
  };

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!property?.id || !userData?.id) return;
    if (!dateRange?.from || !dateRange?.to) { toast.error("Período completo é obrigatório."); return; }
    if (!internalUse && !guestData.fullName) { toast.error("Nome do hóspede é obrigatório."); return; }
    if (docType === "CPF" && docNumber && !validateCPF(docNumber)) { toast.error("CPF inválido. Verifique o número digitado."); return; }

    const cleanedCountry = phoneCountry.replace(/\D/g, "");
    const cleanedLocal = guestData.phone.replace(/\D/g, "");
    const cleanedPhone = joinPhone(cleanedCountry, cleanedLocal);

    if (!internalUse) {
      if (!cleanedCountry) { toast.error("Informe o código do país (DDI) do WhatsApp."); return; }
      if (!isLocalNumberValid(cleanedCountry, cleanedLocal)) { toast.error("O número de WhatsApp digitado é muito curto."); return; }
    }

    setLoading(true);
    const toastId = toast.loading(internalUse ? "Criando reserva de uso da casa..." : "Validando número na Meta (WhatsApp)...");

    try {
      const hasGuest = !!guestData.fullName;
      let savedGuestId: string | null = null;

      if (hasGuest) {
        if (!internalUse && cleanedPhone.length >= 10) {
          const whatsRes = await fetch("/api/whatsapp/check-number", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ number: cleanedPhone, propertyId: property.id }),
          });
          const whatsData = await whatsRes.json();
          if (!whatsRes.ok || !whatsData.exists) toast.warning("WhatsApp não confirmado pela API, mas prosseguindo com a reserva.", { id: toastId });
          else toast.success("WhatsApp validado! Criando registros...", { id: toastId });

          const existingContact = await ContactService.findByPhone(property.id, cleanedPhone);
          if (existingContact?.isGuest && existingContact.guestId) {
            const cleanDocCheck = docNumber.replace(/\D/g, "");
            const isConflict = cleanDocCheck ? existingContact.guestId !== cleanDocCheck : existingContact.name.toLowerCase() !== guestData.fullName.toLowerCase();
            if (isConflict) toast.warning(`Atenção: este número já está cadastrado para "${existingContact.name}". Prosseguindo com a reserva.`, { duration: 6000 });
          }
        }

        const cleanDoc = docNumber.replace(/\D/g, "");
        const initialGuestId = cleanDoc.length > 0 ? cleanDoc : `GUEST-${Date.now()}`;
        savedGuestId = await GuestService.upsertGuest(property.id, {
          id: initialGuestId, propertyId: property.id, fullName: guestData.fullName, email: guestData.email, phone: cleanedPhone,
          nationality: "Brasil", document: { type: docType, number: docNumber || "N/A" }, preferredLanguage: guestData.preferredLanguage,
          birthDate: "", gender: "Outro", occupation: "", allergies: [],
          address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil" },
        }, userData?.id, userData?.fullName);

        if (cleanedPhone.length >= 10) {
          await ContactService.upsertContact(property.id, guestData.fullName, cleanedPhone, true, savedGuestId, userData.id, userData.fullName);
        }
      }

      const cabinConfigs = cabinSelections.length > 0
        ? cabinSelections
        : [{ cabinId: null, name: internalUse ? (internalLabel.trim() || "Uso da Casa") : "Sem Cabana", ...seedPax }];

      const result = await StayService.createStayRecord({
        propertyId: property.id, guestId: savedGuestId, cabinConfigs,
        checkIn: dateRange.from, checkOut: dateRange.to,
        checkInTime: property.settings?.checkInTime, checkOutTime: property.settings?.checkOutTime,
        sendAutomations, internalUse, internalLabel: internalUse ? (internalLabel.trim() || undefined) : undefined,
        actorId: userData.id, actorName: userData.fullName,
      });

      if (savedGuestId) chatwootSyncOnStayCreated(property.id, savedGuestId, result.stayId).catch(() => {});

      // Veio do funil: fecha o ciclo orçamento → estadia.
      if (prefilledQuoteId) {
        try {
          const linkRes = await fetch("/api/admin/tarifario/quotes/link-stay", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId: property.id, quoteId: prefilledQuoteId, stayId: result.stayId }),
          });
          if (linkRes.ok) {
            const link = await linkRes.json().catch(() => null);
            toast.success(link?.nightlyRate ? `Orçamento vinculado — diária de R$ ${Number(link.nightlyRate).toFixed(2)} programada no fólio.` : "Orçamento vinculado à estadia.");
          } else {
            toast.warning("Estadia criada, mas não consegui vincular o orçamento (faça pelo Funil).");
          }
        } catch {
          toast.warning("Estadia criada, mas não consegui vincular o orçamento (faça pelo Funil).");
        }
      }

      toast.dismiss(toastId);
      setCreatedInfo({ code: result.accessCode });
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "";
      if (msg.startsWith("CABIN_OVERLAP:")) {
        const conflictingCabinId = msg.split(":")[1];
        const sel = cabinSelections.find(s => s.cabinId === conflictingCabinId);
        toast.error(`Conflito de datas: ${sel?.name || conflictingCabinId} já possui uma reserva neste período.`, { id: toastId, duration: 6000 });
      } else {
        toast.error("Erro interno ao processar hospedagem.", { id: toastId });
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    router, property,
    loading, searchingGuest, availableCabins, loadingCabins,
    docType, setDocType, docNumber, setDocNumber, guestData, setGuestData,
    phoneCountry, setPhoneCountry: (v: string) => { countryTouched.current = true; setPhoneCountry(v); },
    cabinSelections, toggleCabin, setSelectedCabinIds, updateCabinACF,
    dateRange, setDateRange, sendAutomations, setSendAutomations, internalUse, toggleInternalUse, internalLabel, setInternalLabel,
    createdInfo, handleSearchGuest, handleCreate,
  };
}
