// src/app/check-in/form/[stayId]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { PropertyService } from "@/services/property-service";
import {
  Loader2, CheckCircle2, User, MapPin,
  Dog, ArrowRight, Edit3, ChevronDown,
  Users, Plane, AlertCircle, Plus, Trash2, Clock, CheckCircle, FileText, X, Globe
} from "lucide-react";
import { fetchCEP, sanitizeDocumentForFnrh, validateCPF } from "@/lib/utils-checkin";
import { FnrhService, FnrhDomain } from "@/services/fnrh-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const countries = [
  { name: "Brasil", flag: "🇧🇷", ddi: "+55" },
  { name: "Estados Unidos", flag: "🇺🇸", ddi: "+1" },
  { name: "Argentina", flag: "🇦🇷", ddi: "+54" },
  { name: "Portugal", flag: "🇵🇹", ddi: "+351" },
  { name: "Uruguai", flag: "🇺🇾", ddi: "+598" },
  { name: "Chile", flag: "🇨🇱", ddi: "+56" },
  { name: "Paraguai", flag: "🇵🇾", ddi: "+595" },
  { name: "Outro", flag: "🌍", ddi: "" },
];

// Dicionário de Traduções Estáticas
const translations = {
  pt: {
    titleHolder: "Titular da Reserva",
    nationality: "Nacionalidade *",
    select: "Selecione...",
    searchCountry: "Pesquisar país...",
    doc: "Passaporte / ID *",
    fullName: "Nome Completo *",
    birth: "Nascimento *",
    gender: "Gênero *",
    male: "Masculino",
    female: "Feminino",
    other: "Outro",
    occupation: "Profissão *",
    companions: "Acompanhantes",
    adult: "Adulto",
    child: "Criança",
    free: "Free (Bebê)",
    docOpt: "(Opcional)",
    add: "Add",
    ageRule: "Adulto: 18+ anos | Criança: 6 a 17 anos | Free (Bebê): Até 5 anos",
    residence: "Residência",
    zip: "CEP / Zip *",
    street: "Logradouro (Rua/Av) *",
    number: "Número *",
    complement: "Complemento",
    neighborhood: "Bairro *",
    city: "Cidade *",
    state: "Estado (UF) *",
    travel: "Viagem",
    arrTime: "Horário Previsto de Chegada *",
    origin: "Origem (Cidade/UF) *",
    originDesc: "De onde você está vindo? (Última hospedagem/casa)",
    dest: "Destino (Cidade/UF) *",
    destDesc: "Para onde vai após o check-out?",
    transport: "Meio de Transporte",
    transportCar: "Carro",
    transportBus: "Ônibus",
    transportPlane: "Avião",
    transportShip: "Navio",
    transportOther: "Outro",
    carPlate: "Placa do Veículo",
    roomSetup: "Montagem da Unidade",
    accomodationDistrib: "Distribuição de Acomodação",
    assignBed: "Atribuir hóspede",
    governanceNote: "Esta montagem será solicitada à governança",
    unassigned: "Não alocado",
    petTitle: "Viajando com Pet?",
    petDesc: "Consulte nossa política",
    petName: "Nome do Pet",
    petBreed: "Raça",
    petDog: "Cachorro",
    petCat: "Gato",
    petOther: "Outro",
    petWeight: "Peso",
    termsTitle: "Termos e Aceite",
    termsDesc: "Para finalizar o seu pré-check-in, por favor, leia e concorde com as políticas da nossa propriedade.",
    agree: "Li e concordo com a",
    polGen: "Política Geral da Propriedade",
    polPriv: "Política de Privacidade (LGPD)",
    polPet: "Política Pet",
    mandatoryWarn: "Todos os campos e termos marcados com * são obrigatórios para emissão da FNRH.",
    submit: "Finalizar Check-in",
    successTitle: "Check-in Concluído!",
    successDesc: "Sua ficha foi enviada com sucesso para a nossa equipe.",
    resCode: "Seu Código de Reserva",
    pendingStays: "Você ainda possui acomodação(ões) pendentes de check-in neste grupo.",
    nextUnit: "Preencher Próxima Unidade",
    whatsappBtn: "Falar com a Recepção no WhatsApp",
    alreadyDoneTitle: "Ficha Pronta!",
    alreadyDoneDesc: "Identificamos que seu pré-check-in já foi preenchido.",
    reviewBtn: "Revisar / Alterar Dados",
    groupTitle: "Reserva de Grupo",
    groupDesc: "Identificamos acomodações. Qual delas você deseja preencher agora?",
    unit: "Unidade",
    done: "Preenchido",
    pending: "Pendente",
    timeWarnTitle: "Aviso sobre o Horário",
    awareBtn: "Estou ciente, Enviar",
    backBtn: "Voltar e alterar horário",
    readAgree: "Li e Concordo",
    errorTitle: "Erro ao carregar",
    errorDesc: "Não foi possível encontrar os dados desta reserva. Verifique se o link está correto ou entre em contato com a recepção.",
    loadingLoc: "Endereço localizado!"
  },
  en: {
    titleHolder: "Reservation Holder",
    nationality: "Nationality *",
    select: "Select...",
    searchCountry: "Search country...",
    doc: "Passport / ID *",
    fullName: "Full Name *",
    birth: "Date of Birth *",
    gender: "Gender *",
    male: "Male",
    female: "Female",
    other: "Other",
    occupation: "Occupation *",
    companions: "Companions",
    adult: "Adult",
    child: "Child",
    free: "Infant (Free)",
    docOpt: "(Optional)",
    add: "Add",
    ageRule: "Adult: 18+ years | Child: 6 to 17 years | Infant: Under 5 years",
    residence: "Residence",
    zip: "Zip / Postal Code *",
    street: "Street Address *",
    number: "Number *",
    complement: "Complement",
    neighborhood: "Neighborhood / District *",
    city: "City *",
    state: "State / Province *",
    travel: "Travel",
    arrTime: "Estimated Arrival Time *",
    origin: "Origin (City/State) *",
    originDesc: "Where are you coming from? (Last stay/home)",
    dest: "Destination (City/State) *",
    destDesc: "Where are you going after check-out?",
    transport: "Mode of Transport",
    transportCar: "Car",
    transportBus: "Bus",
    transportPlane: "Airplane",
    transportShip: "Ship",
    transportOther: "Other",
    carPlate: "License Plate",
    roomSetup: "Room Setup",
    accomodationDistrib: "Room Allocation",
    assignBed: "Assign guest",
    governanceNote: "This setup will be requested to housekeeping",
    unassigned: "Unassigned",
    petTitle: "Traveling with a Pet?",
    petDesc: "Check our policy",
    petName: "Pet Name",
    petBreed: "Breed",
    petDog: "Dog",
    petCat: "Cat",
    petOther: "Other",
    petWeight: "Weight",
    termsTitle: "Terms and Agreement",
    termsDesc: "To complete your pre-check-in, please read and agree to our property's policies.",
    agree: "I have read and agree to the",
    polGen: "General Property Policy",
    polPriv: "Privacy Policy",
    polPet: "Pet Policy",
    mandatoryWarn: "All fields and terms marked with * are mandatory for guest registration.",
    submit: "Complete Check-in",
    successTitle: "Check-in Complete!",
    successDesc: "Your form has been successfully submitted to our team.",
    resCode: "Your Reservation Code",
    pendingStays: "You still have pending accommodations for check-in in this group.",
    nextUnit: "Fill Next Unit",
    whatsappBtn: "Contact Reception via WhatsApp",
    alreadyDoneTitle: "Form Complete!",
    alreadyDoneDesc: "We noticed your pre-check-in is already filled out.",
    reviewBtn: "Review / Edit Data",
    groupTitle: "Group Reservation",
    groupDesc: "We identified multiple accommodations. Which one do you want to fill out now?",
    unit: "Unit",
    done: "Completed",
    pending: "Pending",
    timeWarnTitle: "Time Notice",
    awareBtn: "I understand, Submit",
    backBtn: "Go back and change time",
    readAgree: "I Read and Agree",
    errorTitle: "Error loading",
    errorDesc: "Could not find data for this reservation. Please check the link or contact reception.",
    loadingLoc: "Address located!"
  },
  es: {
    titleHolder: "Titular de la Reserva",
    nationality: "Nacionalidad *",
    select: "Seleccione...",
    searchCountry: "Buscar país...",
    doc: "Pasaporte / ID *",
    fullName: "Nombre Completo *",
    birth: "Fecha de Nacimiento *",
    gender: "Género *",
    male: "Masculino",
    female: "Femenino",
    other: "Otro",
    occupation: "Profesión *",
    companions: "Acompañantes",
    adult: "Adulto",
    child: "Niño",
    free: "Bebé (Gratis)",
    docOpt: "(Opcional)",
    add: "Añadir",
    ageRule: "Adulto: 18+ años | Niño: 6 a 17 años | Bebé: Menos de 5 años",
    residence: "Residencia",
    zip: "Código Postal *",
    street: "Dirección (Calle/Av) *",
    number: "Número *",
    complement: "Complemento",
    neighborhood: "Barrio / Distrito *",
    city: "Ciudad *",
    state: "Estado / Provincia *",
    travel: "Viaje",
    arrTime: "Hora Estimada de Llegada *",
    origin: "Origen (Ciudad/Estado) *",
    originDesc: "¿De dónde viene? (Último alojamiento/casa)",
    dest: "Destino (Ciudad/Estado) *",
    destDesc: "¿A dónde va después del check-out?",
    transport: "Medio de Transporte",
    transportCar: "Coche",
    transportBus: "Autobús",
    transportPlane: "Avión",
    transportShip: "Barco",
    transportOther: "Otro",
    carPlate: "Matrícula del Vehículo",
    roomSetup: "Configuración de la Habitación",
    accomodationDistrib: "Distribución de Alojamiento",
    assignBed: "Asignar huésped",
    governanceNote: "Esta configuración será solicitada a housekeeping",
    unassigned: "Sin asignar",
    petTitle: "¿Viaja con Mascota?",
    petDesc: "Consulte nuestra política",
    petName: "Nombre de la Mascota",
    petBreed: "Raza",
    petDog: "Perro",
    petCat: "Gato",
    petOther: "Otro",
    petWeight: "Peso",
    termsTitle: "Términos y Aceptación",
    termsDesc: "Para finalizar su pre-check-in, lea y acepte las políticas de nuestra propiedad.",
    agree: "He leído y acepto la",
    polGen: "Política General de la Propiedad",
    polPriv: "Política de Privacidad",
    polPet: "Política de Mascotas",
    mandatoryWarn: "Todos los campos y términos marcados con * son obligatorios para el registro.",
    submit: "Finalizar Check-in",
    successTitle: "¡Check-in Completado!",
    successDesc: "Su formulario ha sido enviado con éxito a nuestro equipo.",
    resCode: "Su Código de Reserva",
    pendingStays: "Aún tiene alojamientos pendientes de check-in en este grupo.",
    nextUnit: "Completar Siguiente Unidad",
    whatsappBtn: "Contactar Recepción por WhatsApp",
    alreadyDoneTitle: "¡Formulario Listo!",
    alreadyDoneDesc: "Hemos identificado que su pre-check-in ya está completo.",
    reviewBtn: "Revisar / Editar Datos",
    groupTitle: "Reserva de Grupo",
    groupDesc: "Identificamos varios alojamientos. ¿Cuál desea completar ahora?",
    unit: "Unidad",
    done: "Completado",
    pending: "Pendiente",
    timeWarnTitle: "Aviso de Horario",
    awareBtn: "Estoy de acuerdo, Enviar",
    backBtn: "Volver y cambiar horario",
    readAgree: "He Leído y Acepto",
    errorTitle: "Error al cargar",
    errorDesc: "No se pudieron encontrar los datos de esta reserva. Verifique el enlace o contacte a recepción.",
    loadingLoc: "¡Dirección localizada!"
  }
};

type LangType = 'pt' | 'en' | 'es';

function hexToHSL(hex: string): string {
  if (!hex) return '0 0% 0%';
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function UnifiedPreCheckin() {
  const { stayId } = useParams();
  const router = useRouter();

  const [lang, setLang] = useState<LangType>('pt');
  const t = translations[lang];

  const [step, setStep] = useState<'loading' | 'error' | 'group_manager' | 'already_done' | 'form' | 'success'>('loading');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [timeWarning, setTimeWarning] = useState<{ type: 'early' | 'late', message: string } | null>(null);

  const [newAccessCode, setNewAccessCode] = useState<string | null>(null);

  const [fnrhDomains, setFnrhDomains] = useState<{
    generos: FnrhDomain[];
    racas: FnrhDomain[];
    transportes: FnrhDomain[];
    motivos: FnrhDomain[];
    tiposDocumento: FnrhDomain[];
  } | null>(null);

  const [policyModal, setPolicyModal] = useState<'general' | 'privacy' | 'pet' | null>(null);

  const [agreedGeneral, setAgreedGeneral] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [agreedPet, setAgreedPet] = useState(false);

  const [propertyData, setPropertyData] = useState<any>(null);
  const [guest, setGuest] = useState<any>({
    address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", complement: "", ibgeCityId: "" },
    document: { number: "", type: "CPF" },
    nationality: "Brasil", fullName: "", birthDate: "", gender: "", raca: "NAO_DECLARADO", phone: "", email: ""
  });

  const [stay, setStay] = useState<any>({
    transportation: 'CARRO',
    travelReason: 'TURISMO',
    petDetails: { species: 'Cachorro', weight: 5, name: "", breed: "" },
    lastCity: "", nextCity: "", vehiclePlate: "", expectedArrivalTime: "",
    additionalGuests: [], counts: { adults: 1, children: 0, babies: 0 },
    areaConfigs: [], bedAssignments: []
  });

  const [cabin, setCabin] = useState<any>(null);
  const [groupStays, setGroupStays] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(5);

  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    const browserLang = navigator.language.slice(0, 2);
    if (browserLang === 'es') setLang('es');
    else if (browserLang === 'en') setLang('en');
    else setLang('pt');
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        if (!stayId) {
          setStep('error');
          return;
        }

        const targetPropertyId = await StayService.findPropertyIdByStayId(stayId as string);
        if (!targetPropertyId) {
          setStep('error');
          return;
        }

        const [data, propData, generos, racas, transportes, motivos, tiposDocumento] = await Promise.all([
          StayService.getStayWithGuestAndCabin(targetPropertyId, stayId as string),
          PropertyService.getPropertyById(targetPropertyId),
          FnrhService.getGeneros(),
          FnrhService.getRacas(),
          FnrhService.getMeiosTransporte(),
          FnrhService.getMotivosViagem(),
          FnrhService.getTiposDocumento()
        ]);

        if (data && propData) {
          setPropertyData(propData);
          setFnrhDomains({ generos, racas, transportes, motivos, tiposDocumento });

          setGuest((prev: any) => ({ ...prev, ...data.guest, address: { ...prev.address, ...(data.guest?.address || {}) }, document: { ...prev.document, ...(data.guest?.document || {}) } }));
          setStay((prev: any) => ({ ...prev, ...data.stay, propertyId: targetPropertyId, petDetails: { ...prev.petDetails, ...(data.stay?.petDetails || {}) }, additionalGuests: data.stay.additionalGuests || [], counts: data.stay.counts || { adults: 1, children: 0, babies: 0 }, areaConfigs: data.stay.areaConfigs || [], bedAssignments: data.stay.bedAssignments || [] }));
          setCabin(data.cabin);

          if (data.stay.groupId) {
            const allStays = await StayService.getGroupStays(data.stay.accessCode);
            setGroupStays(allStays);

            const urlParams = new URLSearchParams(window.location.search);
            const fromGroup = urlParams.get('fromGroup');

            if (allStays.length > 1 && !fromGroup) {
              setStep('group_manager');
              return;
            }
          }

          const isAlreadyFilled = !!data.stay.expectedArrivalTime && !!data.guest?.document?.number;

          if (isAlreadyFilled) {
            setStep('already_done');
          } else {
            setStep('form');
          }
        } else {
          setStep('error');
        }
      } catch (error) {
        setStep('error');
      }
    }
    loadData();
  }, [stayId]);

  // Auto-redirect removed

  const handleCEPChange = async (cep: string) => {
    setGuest((prev: any) => ({ ...prev, address: { ...prev.address, zipCode: cep } }));
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      setLoadingCep(true);
      try {
        const data = await fetchCEP(cleanCep);
        if (data && !data.erro) {
          setGuest((prev: any) => ({
            ...prev,
            address: {
              ...prev.address,
              street: data.logradouro || "",
              neighborhood: data.bairro || "",
              city: data.localidade || "",
              state: data.uf || "",
              zipCode: cleanCep,
              country: "Brasil",
              ibgeCityId: data.ibge || ""
            }
          }));
          toast.success(t.loadingLoc);
        }
      } catch (err) { } finally { setLoadingCep(false); }
    }
  };

  const validateForm = () => {
    const errors = [];
    if (!guest.fullName) errors.push(t.fullName);
    if (!guest.document?.number) {
      errors.push(t.doc);
    } else if (guest.document?.type === "CPF" && !validateCPF(guest.document.number)) {
      errors.push("CPF Inválido");
    }
    if (!guest.birthDate) errors.push(t.birth);
    if (!guest.gender) errors.push(t.gender);
    if (!guest.occupation) errors.push(t.occupation);
    if (!guest.address?.zipCode) errors.push(t.zip);
    if (!guest.address?.street) errors.push(t.street);
    if (!guest.address?.number) errors.push(t.number);
    if (!guest.address?.neighborhood) errors.push(t.neighborhood);
    if (!guest.address?.city) errors.push(t.city);
    if (!guest.address?.state) errors.push(t.state);
    if (!stay.lastCity) errors.push(t.origin);
    if (!stay.nextCity) errors.push(t.dest);
    if (!stay.expectedArrivalTime) errors.push(t.arrTime);

    stay.additionalGuests?.forEach((g: any, index: number) => {
      if (!g.fullName) errors.push(`${t.companions} #${index + 1} (${t.fullName})`);
      if (!g.document && g.type === 'adult') {
        errors.push(`${t.companions} #${index + 1} (${t.doc})`);
      } else if (g.document && sanitizeDocumentForFnrh(g.document).length === 11 && !validateCPF(g.document)) {
        errors.push(`${t.companions} #${index + 1} (CPF Inválido)`);
      }
    });

    if (!agreedGeneral) errors.push(t.polGen);
    if (!agreedPrivacy) errors.push(t.polPriv);
    if (stay.hasPet && !agreedPet) errors.push(t.polPet);

    return errors;
  };

  const executeSave = async () => {
    setIsSaving(true);
    try {
      // Create a payload copy with sanitized fields for FNRH
      const fnrhGuestPayload = {
        ...guest,
        preferredLanguage: lang,
        document: {
          ...guest.document,
          number: sanitizeDocumentForFnrh(guest.document?.number)
        }
      };

      const fnrhStayPayload = {
        ...stay,
        additionalGuests: stay.additionalGuests.map((ag: any) => ({
          ...ag,
          document: ag.document ? sanitizeDocumentForFnrh(ag.document) : ""
        }))
      };

      const returnedCode = await StayService.completePreCheckin(stay.propertyId, stayId as string, fnrhStayPayload, fnrhGuestPayload);
      setNewAccessCode(returnedCode);
      setStep('success');
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveIntercept = async (e: React.FormEvent) => {
    e.preventDefault();
    const emptyErrors = validateForm();
    if (emptyErrors.length > 0) {
      alert(`Faltam os seguintes campos ou termos:\n\n- ${emptyErrors.join("\n- ")}`);
      return;
    }

    const checkInTime = propertyData?.settings?.checkInTime || "14:00";
    const receptionEndTime = propertyData?.settings?.receptionEndTime || "20:00";
    const arrTime = stay.expectedArrivalTime;

    if (!timeWarning) {
      if (arrTime < checkInTime) {
        let msg = propertyData?.settings?.earlyCheckInMessage?.[lang] || propertyData?.settings?.earlyCheckInMessage?.pt || `Standard check-in starts at [checkintime].`;
        msg = msg.replace(/\[expectedArrivalTime\]/g, arrTime).replace(/\[checkintime\]/g, checkInTime);
        setTimeWarning({ type: 'early', message: msg });
        return;
      }

      if (arrTime > receptionEndTime) {
        let msg = propertyData?.settings?.lateCheckInMessage?.[lang] || propertyData?.settings?.lateCheckInMessage?.pt || `Reception closes at [receptionendtime].`;
        msg = msg.replace(/\[expectedArrivalTime\]/g, arrTime).replace(/\[receptionendtime\]/g, receptionEndTime);
        setTimeWarning({ type: 'late', message: msg });
        return;
      }
    }

    executeSave();
  };

  const handleCPFBlur = (docType: string, docNumber: string, guestType: string = "Titular") => {
    if (docType === "CPF" && docNumber) {
      if (!validateCPF(docNumber)) {
        toast.error(`CPF Inválido (${guestType})`);
      }
    }
  };

  const getThemeStyles = () => {
    const theme = propertyData?.theme;
    if (!theme) return {};
    const c = theme.colors;
    if (!c) return {};
    return {
      '--primary': hexToHSL(c.primary),
      '--primary-foreground': hexToHSL(c.onPrimary),
      '--secondary': hexToHSL(c.secondary),
      '--secondary-foreground': hexToHSL(c.onSecondary),
      '--background': hexToHSL(c.background),
      '--card': hexToHSL(c.surface),
      '--card-foreground': hexToHSL(c.textMain),
      '--foreground': hexToHSL(c.textMain),
      '--muted': hexToHSL(c.secondary),
      '--muted-foreground': hexToHSL(c.textMuted),
      '--accent': hexToHSL(c.accent),
      '--border': hexToHSL(c.accent),
      '--radius': theme.shape?.radius || '0.5rem'
    } as React.CSSProperties;
  };

  const PropertyHeader = () => {
    if (!propertyData) return null;
    return (
      <header className="flex flex-col items-center justify-center space-y-4 mb-8 animate-in fade-in slide-in-from-top-4 relative">
        <div className="absolute top-0 right-0 flex bg-secondary rounded-lg p-1 border border-border">
          {(['pt', 'en', 'es'] as const).map(l => (
            <button
              key={l} type="button" onClick={() => setLang(l)}
              className={cn("px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="pt-4 flex flex-col items-center">
          {propertyData.logoUrl ? (
            <img src={propertyData.logoUrl} alt={propertyData.name} className="h-16 md:h-20 object-contain drop-shadow-md" />
          ) : (
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground font-black text-3xl shadow-lg">
              {propertyData.name.charAt(0) || "A"}
            </div>
          )}
          <div className="text-center mt-2">
            <h2 className="text-2xl font-black text-foreground tracking-tighter">{propertyData.name}</h2>
            {propertyData.slogan && <p className="text-muted-foreground text-sm font-medium italic mt-1">{propertyData.slogan}</p>}
          </div>
        </div>
      </header>
    );
  };

  // Helper para nomear a exibição do Transporte sem alterar o valor no BD
  const getTransportLabel = (m: string) => {
    if (m === 'Carro') return t.transportCar;
    if (m === 'Onibus') return t.transportBus;
    if (m === 'Avião') return t.transportPlane;
    if (m === 'Navio') return t.transportShip;
    return t.transportOther;
  };

  const petPolicyAlert = propertyData?.settings?.petPolicyAlert?.[lang] || propertyData?.settings?.petPolicyAlert?.pt || "Pet Friendly! Read our policy.";
  const petPolicyText = propertyData?.settings?.petPolicyText?.[lang] || propertyData?.settings?.petPolicyText?.pt || "Pet policy not defined.";
  const generalPolicyText = propertyData?.settings?.generalPolicyText?.[lang] || propertyData?.settings?.generalPolicyText?.pt || "General policy not defined.";
  const privacyPolicyText = propertyData?.settings?.privacyPolicyText?.[lang] || propertyData?.settings?.privacyPolicyText?.pt || "Privacy policy not defined.";

  if (step === 'loading') return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={40} /></div>;

  if (step === 'error') return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center" style={getThemeStyles()}>
      <div className="max-w-md space-y-4 animate-in fade-in zoom-in duration-300">
        <AlertCircle size={64} className="mx-auto text-destructive opacity-80" />
        <h1 className="text-2xl font-black text-foreground uppercase tracking-tighter">{t.errorTitle}</h1>
        <p className="text-muted-foreground">{t.errorDesc}</p>
      </div>
    </div>
  );

  if (step === 'success') {
    // If it was a group stay, the accessCode will be different from stay.accessCode (which is the old group code)
    const isSeparatedFromGroup = newAccessCode !== null && newAccessCode !== stay.accessCode;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center" style={getThemeStyles()}>
        <PropertyHeader />
        <div className="max-w-md space-y-6 animate-in zoom-in duration-300 w-full">
          <CheckCircle2 size={80} className="mx-auto text-green-500" />
          <h1 className="text-3xl font-black text-foreground uppercase tracking-tighter">{t.successTitle}</h1>
          <p className="text-muted-foreground">{t.successDesc}</p>

          <div className="p-6 bg-secondary rounded-3xl border border-border shadow-sm">
            {isSeparatedFromGroup && (
              <p className="text-xs font-bold text-orange-500 bg-orange-500/10 px-3 py-1 rounded inline-block uppercase tracking-widest mb-3">Novo Código Gerado</p>
            )}
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {isSeparatedFromGroup ? "Código Exclusivo da Acomodação" : t.resCode}
            </p>
            <p className="text-4xl font-black text-primary tracking-widest mt-3">{newAccessCode || stay.accessCode}</p>

            {isSeparatedFromGroup && (
              <p className="text-sm mt-4 text-foreground/80 font-medium">Use este novo código para acessar o WI-FI, fazer pedidos e ver avisos desta acomodação.</p>
            )}
          </div>

          <div className="pt-4 space-y-3">
            {stay.groupId ? (
              <button
                onClick={() => window.location.href = `/check-in/${stay.accessCode}`}
                className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl flex flex-col items-center hover:opacity-90 transition-all shadow-lg shadow-primary/20"
              >
                <span>Voltar para o Grupo</span>
                <span className="text-[10px] font-medium opacity-80 normal-case tracking-normal">({stay.accessCode})</span>
              </button>
            ) : (
              <button
                onClick={() => window.location.href = `/check-in/${newAccessCode || stay.accessCode}`}
                className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20"
              >
                Acessar Portal
              </button>
            )}

            <button
              onClick={() => window.open(`https://wa.me/${propertyData?.settings?.whatsappNumber?.replace(/\D/g, '') || ''}`, '_blank')}
              className="w-full py-4 bg-secondary text-foreground font-bold rounded-2xl hover:bg-accent transition-all flex items-center justify-center gap-2"
            >
              {t.whatsappBtn}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'already_done') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center" style={getThemeStyles()}>
        <PropertyHeader />
        <div className="max-w-md w-full space-y-8 animate-in fade-in duration-300">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
            <CheckCircle size={48} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-foreground uppercase tracking-tighter">{t.alreadyDoneTitle}</h1>
            <p className="text-muted-foreground">{t.alreadyDoneDesc}</p>
          </div>
          <div className="flex flex-col gap-3 pt-4">
            <button onClick={() => setStep('form')} className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20">
              {t.reviewBtn}
            </button>
            <button
              onClick={() => window.open(`https://wa.me/${propertyData?.settings?.whatsappNumber?.replace(/\D/g, '') || ''}`, '_blank')}
              className="w-full py-4 bg-secondary text-foreground font-bold rounded-2xl hover:bg-accent transition-all"
            >
              {t.whatsappBtn}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'group_manager') {
    return (
      <main className="min-h-screen bg-background text-foreground p-6 flex flex-col items-center justify-center space-y-8" style={getThemeStyles()}>
        <PropertyHeader />
        <div className="text-center space-y-2">
          <Users size={48} className="mx-auto text-primary mb-2" />
          <h1 className="text-3xl font-black uppercase tracking-tighter">{t.groupTitle}</h1>
          <p className="text-muted-foreground italic">{t.groupDesc}</p>
        </div>
        <div className="grid gap-4 w-full max-w-md">
          {groupStays.map((s) => {
            const isStayDone = !!s.expectedArrivalTime;
            return (
              <button
                key={s.id}
                onClick={() => {
                  if (s.id !== stayId) window.location.href = `/check-in/form/${s.id}?fromGroup=1`;
                  else setStep(isStayDone ? 'already_done' : 'form');
                }}
                className={cn(
                  "p-6 rounded-[32px] border text-left transition-all flex justify-between items-center group shadow-sm",
                  s.id === stayId ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-secondary hover:bg-accent hover:border-primary/40"
                )}
              >
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{t.unit}</p>
                  <p className="text-xl font-black text-foreground">{s.cabinName || "Acomodação"}</p>
                  <span className={cn("text-[9px] font-bold uppercase mt-2 inline-block px-2 py-1 rounded", isStayDone ? "bg-green-500/10 text-green-600" : "bg-orange-500/10 text-orange-600")}>
                    {isStayDone ? t.done : t.pending}
                  </span>
                </div>
                <ArrowRight size={20} className={cn("transition-transform group-hover:translate-x-1", s.id === stayId ? "text-primary" : "text-muted-foreground")} />
              </button>
            )
          })}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-6 pb-24 font-sans relative" style={getThemeStyles()}>

      <PropertyHeader />

      <form onSubmit={handleSaveIntercept} className="max-w-2xl mx-auto space-y-12 animate-in fade-in duration-700">

        {/* 1. Identidade Titular */}
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
            <User size={20} className="text-primary" /> 1. {t.titleHolder}
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.nationality}</label>
              <select
                value={guest.nationality || "Brasil"}
                onChange={e => setGuest({ ...guest, nationality: e.target.value })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm appearance-none"
              >
                {countries.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.doc}</label>
              <select
                value={guest.document?.type || ""}
                onChange={e => setGuest({ ...guest, document: { ...guest.document, type: e.target.value } })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm appearance-none"
              >
                {fnrhDomains?.tiposDocumento.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Nº de Identificação</label>
              <input
                value={guest.document?.number || ""}
                onChange={e => setGuest({ ...guest, document: { ...guest.document, number: e.target.value } })}
                onBlur={() => handleCPFBlur(guest.document?.type, guest.document?.number)}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm"
                placeholder={guest.document?.type === "CPF" ? "000.000.000-00" : "Documento"}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.fullName}</label>
            <div className="flex gap-2">
              <input
                readOnly={!isEditingName}
                value={guest.fullName || ""}
                onChange={e => setGuest({ ...guest, fullName: e.target.value })}
                className={cn(
                  "flex-1 bg-secondary p-4 rounded-2xl outline-none transition-all text-sm font-medium",
                  isEditingName ? "border border-primary focus:border-primary" : "border border-border opacity-80"
                )}
              />
              <button
                type="button"
                onClick={() => setIsEditingName(!isEditingName)}
                className="p-4 bg-secondary rounded-2xl text-primary border border-border hover:bg-accent transition-colors"
              >
                <Edit3 size={18} />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.birth}</label>
              <input type="date"
                value={guest.birthDate || ""}
                onChange={e => setGuest({ ...guest, birthDate: e.target.value })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none text-sm font-medium focus:border-primary/50 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 opacity-80 pt-2 border-t border-border mt-2">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-muted-foreground uppercase">{t.gender} (Opcional)</label>
                <select
                  value={guest.gender || "NAO_INFORMADO"}
                  onChange={e => setGuest({ ...guest, gender: e.target.value })}
                  className="w-full bg-secondary border border-border p-3 rounded-xl outline-none text-xs font-medium focus:border-primary/50 transition-colors appearance-none"
                >
                  <option value="" disabled>{t.select}</option>
                  {fnrhDomains?.generos.map(g => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-muted-foreground uppercase">Raça / Cor (Opcional)</label>
                <select
                  value={guest.raca || "NAO_DECLARADO"}
                  onChange={e => setGuest({ ...guest, raca: e.target.value })}
                  className="w-full bg-secondary border border-border p-3 rounded-xl outline-none text-xs font-medium focus:border-primary/50 transition-colors appearance-none"
                >
                  <option value="" disabled>{t.select}</option>
                  {fnrhDomains?.racas.map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.occupation}</label>
            <input
              value={guest.occupation || ""}
              onChange={e => setGuest({ ...guest, occupation: e.target.value })}
              className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm font-medium"
              placeholder={t.occupation.replace(" *", "")}
            />
          </div>
        </section>

        {/* 2. Acompanhantes */}
        <section className="space-y-6">
          <div className="flex justify-between items-center border-b border-border pb-4">
            <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
              <Users size={20} className="text-primary" /> 2. {t.companions}
            </h3>
            {cabin?.capacity && (
              <span className="text-[10px] font-bold uppercase text-muted-foreground bg-secondary px-3 py-1.5 rounded-lg border border-border">
                {1 + (stay.additionalGuests?.length || 0)}/{cabin.capacity}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {stay.additionalGuests?.map((g: any, idx: number) => (
              <div key={idx} className="bg-secondary border border-border p-4 rounded-2xl space-y-4 animate-in slide-in-from-left">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase text-primary bg-background border border-border px-3 py-1.5 rounded-lg">
                    {g.type === 'adult' ? t.adult : g.type === 'child' ? t.child : t.free}
                  </span>
                  <button type="button" onClick={() => {
                    setStay((prev: any) => ({ ...prev, additionalGuests: prev.additionalGuests.filter((_: any, i: number) => i !== idx) }));
                  }} className="text-destructive hover:bg-destructive/10 p-2 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-muted-foreground">{t.fullName}</label>
                    <input
                      value={g.fullName}
                      onChange={e => {
                        const newGuests = [...stay.additionalGuests];
                        newGuests[idx].fullName = e.target.value;
                        setStay({ ...stay, additionalGuests: newGuests });
                      }}
                      className="w-full bg-background border border-border p-3 rounded-xl outline-none text-sm focus:border-primary/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-muted-foreground">{t.doc} {g.type === 'adult' ? '*' : t.docOpt}</label>
                    <input
                      value={g.document}
                      onChange={e => {
                        const newGuests = [...stay.additionalGuests];
                        newGuests[idx].document = e.target.value;
                        setStay({ ...stay, additionalGuests: newGuests });
                      }}
                      onBlur={() => handleCPFBlur("CPF", g.document, "Acompanhante")}
                      className="w-full bg-background border border-border p-3 rounded-xl outline-none text-sm focus:border-primary/50 transition-colors"
                    />
                  </div>
                </div>
              </div>
            ))}

            {(() => {
              const maxCapacity = cabin?.capacity || 99;
              const currentTotal = 1 + (stay.additionalGuests?.length || 0);
              const isFull = currentTotal >= maxCapacity;
              const addGuest = (type: string) => {
                if (isFull) {
                  toast.error(lang === 'en' ? `Maximum capacity reached (${maxCapacity} guests)` : lang === 'es' ? `Capacidad máxima alcanzada (${maxCapacity} huéspedes)` : `Capacidade máxima atingida (${maxCapacity} hóspedes)`);
                  return;
                }
                setStay((p: any) => ({ ...p, additionalGuests: [...p.additionalGuests, { id: Date.now().toString(), type, fullName: "", document: "" }] }));
              };
              return (
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  <button type="button" disabled={isFull} onClick={() => addGuest('adult')} className={cn("flex-1 min-w-[120px] py-3 bg-secondary border border-border rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase transition-all", isFull ? "opacity-40 cursor-not-allowed" : "hover:border-primary/50")}>
                    <Plus size={14} /> {t.adult}
                  </button>
                  <button type="button" disabled={isFull} onClick={() => addGuest('child')} className={cn("flex-1 min-w-[120px] py-3 bg-secondary border border-border rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase transition-all", isFull ? "opacity-40 cursor-not-allowed" : "hover:border-primary/50")}>
                    <Plus size={14} /> {t.child}
                  </button>
                  <button type="button" disabled={isFull} onClick={() => addGuest('free')} className={cn("flex-1 min-w-[120px] py-3 bg-secondary border border-border rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase transition-all", isFull ? "opacity-40 cursor-not-allowed" : "hover:border-primary/50")}>
                    <Plus size={14} /> {t.free}
                  </button>
                </div>
              );
            })()}

            <div className="bg-primary/5 border border-primary/20 p-3 rounded-xl mt-2">
              <p className="text-[10px] text-primary/80 font-medium text-center">
                {t.ageRule}
              </p>
            </div>
          </div>
        </section>

        {/* 2.5 — Distribuição de Acomodação */}
        {cabin?.layout && cabin.layout.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
              <Users size={20} className="text-primary" /> {t.accomodationDistrib}
            </h3>

            <div className="space-y-3">
              {cabin.layout.map((area: any) => {
                const configs: any[][] = area.configs ?? (area.beds ? [area.beds] : [[]]);
                const isFixed = configs.length <= 1;
                const selectedConfigIdx = stay.areaConfigs?.find((ac: any) => ac.areaId === area.id)?.configIndex ?? 0;

                const bedLabel = (b: any) => {
                  const typeLabel = b.type === 'single' ? (lang === 'en' ? 'Single' : lang === 'es' ? 'Individual' : 'Solteiro')
                    : b.type === 'double' ? (lang === 'en' ? 'Double' : lang === 'es' ? 'Doble' : 'Casal')
                    : b.type === 'sofa_bed' ? (lang === 'en' ? 'Sofa Bed' : lang === 'es' ? 'Sofá-Cama' : 'Sofá-Cama')
                    : (lang === 'en' ? 'Extra' : 'Extra');
                  return b.label || typeLabel;
                };

                return (
                  <div key={area.id} className="bg-secondary/60 border border-border rounded-3xl overflow-hidden">
                    {/* Cabeçalho da área */}
                    <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-widest text-primary">{area.name || area.type}</p>
                      {isFixed && (
                        <span className="text-[9px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-lg">
                          {lang === 'en' ? 'Standard' : lang === 'es' ? 'Estándar' : 'Padrão'}
                        </span>
                      )}
                    </div>

                    {isFixed ? (
                      /* Montagem única — apenas exibe os leitos */
                      <div className="px-5 pb-4 flex flex-wrap gap-2">
                        {(configs[0] || []).map((bed: any) => (
                          <span key={bed.id} className="flex items-center gap-1.5 bg-background border border-border px-3 py-2 rounded-xl text-sm font-semibold text-foreground">
                            <span className="text-primary text-base">🛏</span> {bedLabel(bed)}
                          </span>
                        ))}
                        {(configs[0] || []).length === 0 && (
                          <span className="text-xs text-muted-foreground italic">
                            {lang === 'en' ? 'No beds configured' : lang === 'es' ? 'Sin camas configuradas' : 'Sem leitos configurados'}
                          </span>
                        )}
                      </div>
                    ) : (
                      /* Múltiplas variantes — hóspede escolhe */
                      <div className="px-4 pb-4 flex flex-col gap-2">
                        {configs.map((cfg: any[], idx: number) => {
                          const label = cfg.length > 0 ? cfg.map(bedLabel).join(' + ') : `Opção ${String.fromCharCode(65 + idx)}`;
                          const hasGovernance = cfg.some((b: any) => b.type === 'extra' || b.type === 'sofa_bed');
                          const isSelected = selectedConfigIdx === idx;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setStay((s: any) => ({
                                ...s,
                                areaConfigs: [
                                  ...(s.areaConfigs || []).filter((ac: any) => ac.areaId !== area.id),
                                  { areaId: area.id, configIndex: idx }
                                ]
                              }))}
                              className={cn(
                                "w-full p-4 rounded-2xl border text-left font-bold transition-all active:scale-[0.98] flex items-center gap-3",
                                isSelected
                                  ? "bg-foreground text-background border-foreground shadow-md"
                                  : "bg-background border-border text-muted-foreground"
                              )}
                            >
                              {/* Indicador de seleção */}
                              <span className={cn(
                                "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                                isSelected ? "border-background bg-background/30" : "border-border"
                              )}>
                                {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-background" />}
                              </span>
                              <span className="flex-1 text-sm">{label}</span>
                              {hasGovernance && (
                                <span className={cn(
                                  "text-[9px] font-bold uppercase px-2 py-0.5 rounded-lg shrink-0",
                                  isSelected ? "bg-yellow-500/20 text-yellow-300 border border-yellow-400/30" : "bg-yellow-500/10 text-yellow-700 border border-yellow-500/20"
                                )}>
                                  {t.governanceNote}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. Residência */}
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
            <MapPin size={20} className="text-primary" /> 3. {t.residence}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.zip}</label>
              <div className="relative">
                <input
                  value={guest.address?.zipCode || ""}
                  onChange={e => handleCEPChange(e.target.value)}
                  className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
                  placeholder="00000-000"
                />
                {loadingCep && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />}
              </div>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.street}</label>
              <input
                value={guest.address?.street || ""}
                onChange={e => setGuest({ ...guest, address: { ...guest.address, street: e.target.value } })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
              />
            </div>

            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.number}</label>
              <input
                value={guest.address?.number || ""}
                onChange={e => setGuest({ ...guest, address: { ...guest.address, number: e.target.value } })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
                placeholder="S/N"
              />
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.complement}</label>
              <input
                value={guest.address?.complement || ""}
                onChange={e => setGuest({ ...guest, address: { ...guest.address, complement: e.target.value } })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.neighborhood}</label>
              <input
                value={guest.address?.neighborhood || ""}
                onChange={e => setGuest({ ...guest, address: { ...guest.address, neighborhood: e.target.value } })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
              />
            </div>
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.city}</label>
              <input
                value={guest.address?.city || ""}
                onChange={e => setGuest({ ...guest, address: { ...guest.address, city: e.target.value } })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
              />
            </div>
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.state}</label>
              <input
                value={guest.address?.state || ""}
                onChange={e => setGuest({ ...guest, address: { ...guest.address, state: e.target.value } })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
                maxLength={2}
              />
            </div>
          </div>
        </section>

        {/* 4. Viagem & Logística */}
        <section className="bg-secondary/30 border border-border p-8 rounded-[40px] space-y-8">
          <div className="space-y-6">
            <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2 text-foreground">
              <Plane size={20} className="text-primary" /> 4. {t.travel}
            </h3>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.arrTime}</label>
              <div className="flex items-center gap-2 bg-background border border-border p-4 rounded-2xl focus-within:border-primary/50 transition-colors">
                <Clock size={18} className="text-primary" />
                <input
                  type="time"
                  value={stay.expectedArrivalTime || ""}
                  onChange={e => setStay({ ...stay, expectedArrivalTime: e.target.value })}
                  className="bg-transparent outline-none text-foreground font-bold w-full [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase flex flex-col">
                  <span>{t.origin}</span>
                  <span className="text-[8px] font-normal opacity-70 normal-case mb-1 mt-0.5">{t.originDesc}</span>
                </label>
                <input
                  value={stay.lastCity || ""}
                  onChange={e => setStay({ ...stay, lastCity: e.target.value })}
                  className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase flex flex-col">
                  <span>{t.dest}</span>
                  <span className="text-[8px] font-normal opacity-70 normal-case mb-1 mt-0.5">{t.destDesc}</span>
                </label>
                <input
                  value={stay.nextCity || ""}
                  onChange={e => setStay({ ...stay, nextCity: e.target.value })}
                  className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Motivo da Viagem (FNRH)</label>
              <select
                value={stay.travelReason || ""}
                onChange={e => setStay({ ...stay, travelReason: e.target.value })}
                className="w-full bg-background border border-border p-4 rounded-2xl outline-none text-sm font-medium focus:border-primary/50 transition-colors appearance-none"
              >
                <option value="" disabled>{t.select}</option>
                {fnrhDomains?.motivos.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase text-primary">Meio de Transporte (FNRH)</label>
            <select
              value={stay.transportation || ""}
              onChange={e => setStay({ ...stay, transportation: e.target.value })}
              className="w-full bg-background border border-border p-4 rounded-2xl outline-none text-sm font-medium focus:border-primary/50 transition-colors appearance-none"
            >
              <option value="" disabled>{t.select}</option>
              {fnrhDomains?.transportes.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {['CARRO', 'MOTO'].includes(stay.transportation) && (
            <div className="space-y-2 animate-in slide-in-from-top-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Placa do Veículo (Opcional)</label>
              <input value={stay.vehiclePlate || ""} onChange={e => setStay({ ...stay, vehiclePlate: e.target.value.toUpperCase() })} placeholder="ABC1D23" className="w-full bg-background border border-border p-5 rounded-3xl font-mono text-2xl tracking-widest text-primary text-center focus:border-primary/50 outline-none transition-colors" />
            </div>
          )}

        </section>

        {/* 5. Pets */}
        {propertyData?.settings?.acceptsPets !== false && (
          <section className="bg-orange-500/5 border border-orange-500/20 p-8 rounded-[40px] space-y-6">
            <label className="flex items-center gap-4 cursor-pointer group">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-colors", stay.hasPet ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30" : "bg-background border border-orange-500/20 text-orange-500")}>
                <Dog size={24} />
              </div>
              <div className="flex-1">
                <p className="font-black text-lg text-foreground">{t.petTitle}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">{t.petDesc}</p>
              </div>
              <input type="checkbox" checked={stay.hasPet} onChange={e => {
                setStay({ ...stay, hasPet: e.target.checked });
                if (!e.target.checked) setAgreedPet(false);
              }} className="w-6 h-6 accent-orange-500 rounded-lg cursor-pointer" />
            </label>

            {stay.hasPet && (
              <div className="space-y-6 animate-in zoom-in duration-300">

                <div className="text-xs text-orange-600/90 bg-orange-500/10 p-4 rounded-xl border border-orange-500/20 leading-relaxed font-medium">
                  {petPolicyAlert}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    placeholder={t.petName}
                    value={stay.petDetails?.name || ""}
                    onChange={e => setStay({ ...stay, petDetails: { ...stay.petDetails, name: e.target.value } })}
                    className="bg-background border border-border p-4 rounded-2xl text-sm focus:border-orange-500/50 outline-none transition-colors text-foreground"
                  />
                  <input
                    placeholder={t.petBreed}
                    value={stay.petDetails?.breed || ""}
                    onChange={e => setStay({ ...stay, petDetails: { ...stay.petDetails, breed: e.target.value } })}
                    className="bg-background border border-border p-4 rounded-2xl text-sm focus:border-orange-500/50 outline-none transition-colors text-foreground"
                  />
                  <select
                    value={stay.petDetails?.species || "Cachorro"}
                    onChange={e => setStay({ ...stay, petDetails: { ...stay.petDetails, species: e.target.value } })}
                    className="bg-background border border-border p-4 rounded-2xl text-sm outline-none focus:border-orange-500/50 transition-colors text-foreground appearance-none"
                  >
                    <option value="Cachorro">{t.petDog}</option>
                    <option value="Gato">{t.petCat}</option>
                    <option value="Outro">{t.petOther}</option>
                  </select>
                </div>

                {/* Weight Selector with Size Categories */}
                {(() => {
                  const petMinWeight = propertyData?.settings?.petMinWeight || 1;
                  const petMaxWeight = propertyData?.settings?.petMaxWeight || 40;
                  const currentWeight = stay.petDetails?.weight || Math.max(5, petMinWeight);

                  const getSizeLabel = (w: number) => {
                    if (w <= 5) return { label: lang === 'en' ? 'Toy/Miniature' : lang === 'es' ? 'Miniatura/Toy' : 'Miniatura/Toy', color: 'text-blue-500' };
                    if (w <= 10) return { label: lang === 'en' ? 'Small' : lang === 'es' ? 'Pequeño' : 'Pequeno', color: 'text-green-500' };
                    if (w <= 25) return { label: lang === 'en' ? 'Medium' : lang === 'es' ? 'Mediano' : 'Médio', color: 'text-yellow-600' };
                    if (w <= 45) return { label: lang === 'en' ? 'Large' : lang === 'es' ? 'Grande' : 'Grande', color: 'text-orange-500' };
                    return { label: lang === 'en' ? 'Giant' : lang === 'es' ? 'Gigante' : 'Gigante', color: 'text-red-500' };
                  };

                  const sizeInfo = getSizeLabel(currentWeight);
                  const isBlocked = currentWeight < petMinWeight || currentWeight > petMaxWeight;

                  const handleWeightChange = (newWeight: number) => {
                    if (isNaN(newWeight)) return;
                    setStay({ ...stay, petDetails: { ...stay.petDetails, weight: newWeight } });
                  };

                  const handleBlur = (w: number) => {
                    let finalW = w;
                    if (w < petMinWeight) finalW = petMinWeight;
                    if (w > petMaxWeight) finalW = petMaxWeight;
                    setStay({ ...stay, petDetails: { ...stay.petDetails, weight: finalW } });
                  };

                  const decrement = () => handleWeightChange(Math.max(petMinWeight, currentWeight - 1));
                  const increment = () => handleWeightChange(Math.min(petMaxWeight, currentWeight + 1));

                  return (
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-orange-600">{t.petWeight}</span>
                          <p className={cn("text-2xl font-black", sizeInfo.color)}>
                            {currentWeight}{currentWeight >= 40 && petMaxWeight >= 40 ? '+' : ''}kg
                            <span className="text-sm font-bold ml-2 opacity-80">— {sizeInfo.label}</span>
                          </p>
                        </div>
                        {isBlocked && (
                          <span className="text-[9px] font-bold uppercase bg-red-500/10 text-red-500 px-2 py-1 rounded-lg">
                            {lang === 'en' ? 'Not accepted' : lang === 'es' ? 'No aceptado' : 'Não aceito'}
                          </span>
                        )}
                      </div>

                      {/* Premium Stepper */}
                      <div className="flex items-center gap-4 bg-background border border-border p-2 rounded-2xl w-full">
                        <button
                          type="button"
                          onClick={decrement}
                          disabled={currentWeight <= petMinWeight}
                          className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-orange-500 hover:text-white disabled:opacity-30 disabled:hover:bg-secondary disabled:hover:text-foreground transition-all active:scale-95"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>

                        <div className="flex-1 text-center relative">
                          <input
                            type="number"
                            value={currentWeight || ""}
                            onChange={(e) => handleWeightChange(parseInt(e.target.value))}
                            onBlur={(e) => handleBlur(parseInt(e.target.value) || petMinWeight)}
                            className="w-full text-center bg-transparent border-none outline-none text-2xl font-black text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-xs font-bold text-muted-foreground uppercase absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            {currentWeight >= 40 && petMaxWeight >= 40 ? '+ kg' : 'kg'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={increment}
                          disabled={currentWeight >= petMaxWeight}
                          className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-orange-500 hover:text-white disabled:opacity-30 disabled:hover:bg-secondary disabled:hover:text-foreground transition-all active:scale-95"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                      </div>

                      {/* Accepted range indicator */}
                      <div className="bg-orange-500/5 border border-orange-500/10 p-2 rounded-lg text-center">
                        <p className="text-[9px] font-bold text-orange-600/70 uppercase">
                          {lang === 'en' ? `Accepted range: ${petMinWeight}kg — ${petMaxWeight >= 40 ? '40+' : petMaxWeight}kg` : lang === 'es' ? `Rango aceptado: ${petMinWeight}kg — ${petMaxWeight >= 40 ? '40+' : petMaxWeight}kg` : `Faixa aceita: ${petMinWeight}kg — ${petMaxWeight >= 40 ? '40+' : petMaxWeight}kg`}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </section>
        )}

        {/* 6. Termos e Políticas */}
        <section className="bg-card border border-border p-8 rounded-[40px] space-y-6 shadow-sm">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2 text-foreground">
            <FileText size={20} className="text-primary" /> 5. {t.termsTitle}
          </h3>
          <p className="text-sm text-muted-foreground">{t.termsDesc}</p>

          <div className="space-y-4 pt-4">
            <label className="flex items-start gap-4 cursor-pointer group p-3 hover:bg-secondary rounded-2xl transition-colors">
              <input type="checkbox" checked={agreedGeneral} onChange={e => setAgreedGeneral(e.target.checked)} className="mt-1 w-5 h-5 accent-primary cursor-pointer shrink-0" />
              <span className="text-sm text-foreground">{t.agree} <button type="button" onClick={(e) => { e.preventDefault(); setPolicyModal('general'); }} className="text-primary hover:underline font-bold transition-all">{t.polGen}</button> *</span>
            </label>

            <label className="flex items-start gap-4 cursor-pointer group p-3 hover:bg-secondary rounded-2xl transition-colors">
              <input type="checkbox" checked={agreedPrivacy} onChange={e => setAgreedPrivacy(e.target.checked)} className="mt-1 w-5 h-5 accent-primary cursor-pointer shrink-0" />
              <span className="text-sm text-foreground">{t.agree} <button type="button" onClick={(e) => { e.preventDefault(); setPolicyModal('privacy'); }} className="text-primary hover:underline font-bold transition-all">{t.polPriv}</button> *</span>
            </label>

            {stay.hasPet && (
              <label className="flex items-start gap-4 cursor-pointer group p-3 hover:bg-orange-500/5 rounded-2xl transition-colors border border-orange-500/10">
                <input type="checkbox" checked={agreedPet} onChange={e => setAgreedPet(e.target.checked)} className="mt-1 w-5 h-5 accent-orange-500 cursor-pointer shrink-0" />
                <span className="text-sm text-foreground">{t.agree} <button type="button" onClick={(e) => { e.preventDefault(); setPolicyModal('pet'); }} className="text-orange-500 hover:underline font-bold transition-all">{t.polPet}</button> *</span>
              </label>
            )}
          </div>
        </section>

        <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-yellow-600 text-xs font-medium">
          <AlertCircle size={16} className="shrink-0" />
          <p>{t.mandatoryWarn}</p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-8 bg-primary text-primary-foreground font-black text-2xl uppercase tracking-widest rounded-[32px] hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-xl shadow-primary/20"
        >
          {isSaving ? <Loader2 className="animate-spin" /> : t.submit}
        </button>

      </form>

      {/* MODAL DE AVISO DE HORÁRIO (INTERCEPTADOR) */}
      {timeWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
          <div className="bg-card border border-border w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6 text-center">
            <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-sm", timeWarning.type === 'early' ? "bg-blue-500/10 text-blue-500" : "bg-orange-500/10 text-orange-500")}>
              <Clock size={40} />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground">{t.timeWarnTitle}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {timeWarning.message}
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setTimeWarning(null);
                  executeSave();
                }}
                className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20"
              >
                {t.awareBtn}
              </button>
              <button
                type="button"
                onClick={() => setTimeWarning(null)}
                className="w-full py-4 bg-secondary text-foreground font-bold rounded-2xl hover:bg-accent transition-all"
              >
                {t.backBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LEITURA DE POLÍTICAS */}
      {policyModal && (
        <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-4 md:p-8 bg-background/90 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card border border-border w-full max-w-2xl max-h-[85vh] rounded-[32px] shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 md:zoom-in-95">
            <div className="p-6 border-b border-border flex justify-between items-center shrink-0">
              <h3 className={cn("font-black text-xl flex items-center gap-2", policyModal === 'pet' ? "text-orange-500" : "text-primary")}>
                {policyModal === 'general' ? <FileText /> : policyModal === 'privacy' ? <FileText /> : <Dog />}
                {policyModal === 'general' ? t.polGen : policyModal === 'privacy' ? t.polPriv : t.polPet}
              </h3>
              <button type="button" onClick={() => setPolicyModal(null)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-foreground whitespace-pre-wrap leading-relaxed font-medium">
              {policyModal === 'general' ? generalPolicyText : policyModal === 'privacy' ? privacyPolicyText : petPolicyText}
            </div>

            <div className="p-6 border-t border-border shrink-0 bg-secondary/50 rounded-b-[32px]">
              <button type="button" onClick={() => {
                if (policyModal === 'general') setAgreedGeneral(true);
                if (policyModal === 'privacy') setAgreedPrivacy(true);
                if (policyModal === 'pet') setAgreedPet(true);
                setPolicyModal(null);
              }} className={cn("w-full py-4 text-primary-foreground font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all", policyModal === 'pet' ? "bg-orange-500 text-white" : "bg-primary")}>
                {t.readAgree}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}