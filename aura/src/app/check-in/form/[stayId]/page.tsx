// src/app/check-in/form/[stayId]/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { GuestApi } from "@/lib/guest-api";
import { chatwootSyncOnPreCheckinComplete } from "@/app/actions/chatwoot-actions";
import {
  Loader2, CheckCircle2, User, MapPin,
  Dog, ArrowRight, Edit3, ChevronDown,
  Users, Plane, AlertCircle, Plus, Trash2, Clock, CheckCircle, FileText, X, Globe
} from "lucide-react";
import { fetchCEP, sanitizeDocumentForFnrh, validateCPF } from "@/lib/utils-checkin";
import { defaultCountryForLang, splitPhone, joinPhone, isLocalNumberValid } from "@/lib/phone";
import { DEFAULT_PET_WEIGHT, EMPTY_PET, PET_HARD_CAP, classifyPets, maxPetsOf, readPets, writePets } from "@/lib/pets";
import { FnrhService, FnrhDomain } from "@/services/fnrh-service";
import { toast, Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { COUNTRIES } from "@/lib/countries";

const countries = COUNTRIES;

// Dicionário de Traduções Estáticas
const translations = {
  pt: {
    titleHolder: "Titular da Reserva",
    preferredLang: "Idioma Preferido",
    nationality: "Nacionalidade *",
    nationalityISO: "ISO",
    select: "Selecione...",
    searchCountry: "Pesquisar país...",
    doc: "Passaporte / ID",
    fullName: "Nome Completo *",
    birth: "Nascimento *",
    gender: "Gênero *",
    male: "Masculino",
    female: "Feminino",
    other: "Outro",
    notInformed: "Não Informado",
    occupation: "Profissão *",
    email: "E-mail *",
    companions: "Acompanhantes",
    adult: "Adulto",
    child: "Criança",
    free: "Free (Bebê)",
    docOpt: "(Opcional)",
    birthDateOpt: "Nascimento (Opcional)",
    add: "Add",
    ageRule: "Adulto: 18+ anos | Criança: 6 a 17 anos | Free (Bebê): Até 5 anos",
    residenceCountry: "País de Residência *",
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
    petOne: "Pet",
    petAdd: "Adicionar outro pet",
    petRemove: "Remover pet",
    petOverLimit: "Nossa política prevê até {n} por acomodação. Registramos a informação e a recepção confirma a possibilidade antes da sua chegada.",
    petExcTitle: "Seu pedido ficará em análise",
    petExcBody: "O que você informou está fora da nossa Política Pet, então a hospedagem do animal depende de autorização. Avaliamos caso a caso — considerando a ocupação do período, as datas, a acomodação reservada e o porte do animal — e retornamos com a resposta. Enquanto não houver autorização expressa, não há autorização.",
    petExcWhy: "Motivo da análise:",
    petExcCount: "{n} animais (nossa política prevê {max})",
    petExcWeight: "{name} tem {w} kg (nossa política prevê até {max} kg)",
    petExcSpecies: "{name} é de espécie fora das que recebemos habitualmente",
    petExcBadge: "Em análise",
    petBlockedTitle: "Não conseguimos receber este animal",
    petBlockedBody: "O que foi informado está além do que analisamos. Fale com a recepção antes de seguir — ajuste os dados para continuar o pré-check-in.",
    petBlockedCount: "Não analisamos pedidos acima de {max} animais",
    petBlockedWeight: "Não analisamos pedidos de animal acima de {max} kg",
    petBlockedUnder: "Peso abaixo de {max} kg — confira o valor informado",
    termsTitle: "Termos e Aceite",
    termsDesc: "Para finalizar o seu pré-check-in, por favor, leia e concorde com as políticas da nossa propriedade.",
    agree: "Li e concordo com a",
    polGen: "Política Geral da Propriedade",
    polPriv: "Política de Privacidade (LGPD)",
    polPet: "Política Pet",
    polPetExc: "Política Pet — Exceção",
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
    loadingLoc: "Endereço localizado!",
    next: "Avançar",
    change: "Alterar",
    defaultLabel: "Padrão",
    saving: "Salvando...",
    stepOf: "Etapa %s de 4",
    step1Title: "Seus Dados",
    step2Title: "Acompanhantes",
    step3Title: "Residência",
    step4Title: "Viagem"
  },
  en: {
    titleHolder: "Reservation Holder",
    preferredLang: "Preferred Language",
    nationality: "Nationality *",
    nationalityISO: "ISO",
    select: "Select...",
    searchCountry: "Search country...",
    doc: "Passport / ID",
    fullName: "Full Name *",
    birth: "Date of Birth *",
    gender: "Gender *",
    male: "Male",
    female: "Female",
    other: "Other",
    notInformed: "Not Informed",
    occupation: "Occupation *",
    email: "E-mail *",
    companions: "Companions",
    adult: "Adult",
    child: "Child",
    free: "Infant (Free)",
    docOpt: "(Optional)",
    birthDateOpt: "Date of Birth (Optional)",
    add: "Add",
    ageRule: "Adult: 18+ years | Child: 6 to 17 years | Infant: Under 5 years",
    residenceCountry: "Country of Residence *",
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
    petOne: "Pet",
    petAdd: "Add another pet",
    petRemove: "Remove pet",
    petOverLimit: "Our policy allows up to {n} per accommodation. We have recorded your information and the front desk will confirm before your arrival.",
    petExcTitle: "Your request will be reviewed",
    petExcBody: "What you entered falls outside our Pet Policy, so hosting the animal depends on authorization. We assess each case — occupancy for the period, the dates, the accommodation booked and the animal's size — and get back to you. Until there is express authorization, there is no authorization.",
    petExcWhy: "Reason for review:",
    petExcCount: "{n} animals (our policy allows {max})",
    petExcWeight: "{name} weighs {w} kg (our policy allows up to {max} kg)",
    petExcSpecies: "{name} is a species outside the ones we usually host",
    petExcBadge: "Under review",
    petBlockedTitle: "We are not able to host this animal",
    petBlockedBody: "What you entered is beyond what we review. Please talk to the front desk — adjust the details to continue your pre-check-in.",
    petBlockedCount: "We do not review requests above {max} animals",
    petBlockedWeight: "We do not review requests for animals above {max} kg",
    petBlockedUnder: "Weight below {max} kg — please check the value entered",
    termsTitle: "Terms and Agreement",
    termsDesc: "To complete your pre-check-in, please read and agree to our property's policies.",
    agree: "I have read and agree to the",
    polGen: "General Property Policy",
    polPriv: "Privacy Policy",
    polPet: "Pet Policy",
    polPetExc: "Pet Policy — Exception",
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
    loadingLoc: "Address located!",
    next: "Next",
    change: "Change",
    defaultLabel: "Standard",
    saving: "Saving...",
    stepOf: "Step %s of 4",
    step1Title: "Your Details",
    step2Title: "Companions",
    step3Title: "Residence",
    step4Title: "Trip"
  },
  es: {
    titleHolder: "Titular de la Reserva",
    preferredLang: "Idioma Preferido",
    nationality: "Nacionalidad *",
    nationalityISO: "ISO",
    select: "Seleccione...",
    searchCountry: "Buscar país...",
    doc: "Pasaporte / ID",
    fullName: "Nombre Completo *",
    birth: "Fecha de Nacimiento *",
    gender: "Género *",
    male: "Masculino",
    female: "Femenino",
    other: "Otro",
    notInformed: "No Informado",
    occupation: "Profesión *",
    email: "Correo Electrónico *",
    companions: "Acompañantes",
    adult: "Adulto",
    child: "Niño",
    free: "Bebé (Gratis)",
    docOpt: "(Opcional)",
    birthDateOpt: "Fecha de Nacimiento (Opcional)",
    add: "Añadir",
    ageRule: "Adulto: 18+ años | Niño: 6 a 17 años | Bebé: Menos de 5 años",
    residenceCountry: "País de Residencia *",
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
    petOne: "Mascota",
    petAdd: "Añadir otra mascota",
    petRemove: "Quitar mascota",
    petOverLimit: "Nuestra política permite hasta {n} por alojamiento. Registramos la información y la recepción lo confirmará antes de su llegada.",
    petExcTitle: "Su solicitud quedará en análisis",
    petExcBody: "Lo que informó está fuera de nuestra Política de Mascotas, por lo que el alojamiento del animal depende de autorización. Evaluamos caso por caso — la ocupación del período, las fechas, el alojamiento reservado y el porte del animal — y le respondemos. Mientras no haya autorización expresa, no hay autorización.",
    petExcWhy: "Motivo del análisis:",
    petExcCount: "{n} animales (nuestra política permite {max})",
    petExcWeight: "{name} pesa {w} kg (nuestra política permite hasta {max} kg)",
    petExcSpecies: "{name} es de una especie fuera de las que recibimos habitualmente",
    petExcBadge: "En análisis",
    petBlockedTitle: "No podemos recibir a este animal",
    petBlockedBody: "Lo informado está más allá de lo que analizamos. Hable con la recepción — ajuste los datos para continuar su pre-check-in.",
    petBlockedCount: "No analizamos solicitudes de más de {max} animales",
    petBlockedWeight: "No analizamos solicitudes de animales de más de {max} kg",
    petBlockedUnder: "Peso por debajo de {max} kg — revise el valor informado",
    termsTitle: "Términos y Aceptación",
    termsDesc: "Para finalizar su pre-check-in, lea y acepte las políticas de nuestra propiedad.",
    agree: "He leído y acepto la",
    polGen: "Política General de la Propiedad",
    polPriv: "Política de Privacidad",
    polPet: "Política de Mascotas",
    polPetExc: "Política de Mascotas — Excepción",
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
    loadingLoc: "¡Dirección localizada!",
    next: "Siguiente",
    change: "Cambiar",
    defaultLabel: "Estándar",
    saving: "Guardando...",
    stepOf: "Paso %s de 4",
    step1Title: "Sus Datos",
    step2Title: "Acompañantes",
    step3Title: "Residencia",
    step4Title: "Viaje"
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

/**
 * Seletor de peso de UM pet. Vive no nível do módulo (e não inline na seção) porque
 * agora se repete por pet — inline, cada tecla digitada remontaria o input e o campo
 * perderia o foco.
 *
 * O peso deixou de bloquear na faixa do meio: acima de `baseMax` o pet aparece
 * como "em análise" (pedido de exceção) e o stepper continua andando até `max`,
 * que é o teto absoluto da propriedade. Travar em 15 kg só ensinava o hóspede a
 * digitar 14 — e chegar com o cachorro de 20 assim mesmo.
 */
function PetWeightField({ value, onChange, min, max, baseMax, label, lang, badge }: {
  value: number;
  onChange: (weight: number) => void;
  min: number;
  max: number;
  baseMax: number;
  label: string;
  lang: 'pt' | 'en' | 'es';
  badge: string;
}) {
  const current = value || Math.max(DEFAULT_PET_WEIGHT, min);

  const sizeInfo = (w: number) => {
    if (w <= 5)  return { label: lang === 'en' ? 'Toy/Miniature' : 'Miniatura/Toy', color: 'text-blue-500' };
    if (w <= 10) return { label: lang === 'en' ? 'Small' : lang === 'es' ? 'Pequeño' : 'Pequeno', color: 'text-green-500' };
    if (w <= 25) return { label: lang === 'en' ? 'Medium' : lang === 'es' ? 'Mediano' : 'Médio', color: 'text-yellow-600' };
    if (w <= 45) return { label: lang === 'en' ? 'Large' : 'Grande', color: 'text-orange-500' };
    return { label: lang === 'en' ? 'Giant' : 'Gigante', color: 'text-red-500' };
  };

  const size = sizeInfo(current);
  const needsReview = current > baseMax;
  const clamp = (w: number) => Math.min(max, Math.max(min, w));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <span className="text-[10px] font-bold uppercase text-orange-600">{label}</span>
          <p className={cn("text-2xl font-black", size.color)}>
            {current}{current >= 40 && max >= 40 ? '+' : ''}kg
            <span className="text-sm font-bold ml-2 opacity-80">— {size.label}</span>
          </p>
        </div>
        {needsReview && (
          <span className="text-[9px] font-bold uppercase bg-amber-500/15 text-amber-600 px-2 py-1 rounded-lg">
            {badge}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 bg-background border border-border p-2 rounded-2xl w-full">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, current - 1))}
          disabled={current <= min}
          className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-orange-500 hover:text-white disabled:opacity-30 disabled:hover:bg-secondary disabled:hover:text-foreground transition-all active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>

        <div className="flex-1 text-center relative">
          <input
            type="number"
            value={current || ""}
            onChange={(e) => { const w = parseInt(e.target.value); if (!isNaN(w)) onChange(w); }}
            onBlur={(e) => onChange(clamp(parseInt(e.target.value) || min))}
            className="w-full text-center bg-transparent border-none outline-none text-2xl font-black text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs font-bold text-muted-foreground uppercase absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            {current >= 40 && max >= 40 ? '+ kg' : 'kg'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onChange(Math.min(max, current + 1))}
          disabled={current >= max}
          className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-orange-500 hover:text-white disabled:opacity-30 disabled:hover:bg-secondary disabled:hover:text-foreground transition-all active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>

      <div className="bg-orange-500/5 border border-orange-500/10 p-2 rounded-lg text-center">
        <p className="text-[9px] font-bold text-orange-600/70 uppercase">
          {lang === 'en' ? `Accepted range: ${min}kg — ${max >= 40 ? '40+' : max}kg`
            : lang === 'es' ? `Rango aceptado: ${min}kg — ${max >= 40 ? '40+' : max}kg`
            : `Faixa aceita: ${min}kg — ${max >= 40 ? '40+' : max}kg`}
        </p>
      </div>
    </div>
  );
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
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

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
    nationality: "BR", nationalityName: "Brasil", residenceCountry: "BR",
    fullName: "", birthDate: "", gender: "", raca: "NAO_DECLARADO", phone: "", email: ""
  });

  const [stay, setStay] = useState<any>({
    transportation: 'CARRO',
    travelReason: 'TURISMO',
    pets: [],
    lastCity: "", nextCity: "", vehiclePlate: "", expectedArrivalTime: "",
    additionalGuests: [], counts: { adults: 1, children: 0, babies: 0 },
    areaConfigs: [], bedAssignments: []
  });

  const [cabin, setCabin] = useState<any>(null);
  const [groupStays, setGroupStays] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(5);

  // DDI do WhatsApp separado do número: pt nasce "55" e editável; en/es nasce
  // vazio e obrigatório. `guest.phone` guarda só o número local; o DDI é aqui.
  const [phoneCountry, setPhoneCountry] = useState("55");
  const countryTouched = React.useRef(false);

  /**
   * Teto de hóspedes da ficha. NÃO é só a capacidade cadastrada da cabana: a
   * reserva pode ter sido vendida em exceção de ocupação (combinada ainda no
   * orçamento) e a ficha pode já ter mais gente do que a capacidade. O hóspede
   * nunca pode travar num número menor do que aquilo que ele já comprou.
   */
  const maxCapacity = useMemo(() => {
    const c = stay.counts || {};
    const declared = (c.adults || 0) + (c.children || 0) + (c.babies || 0);
    const current = 1 + (stay.additionalGuests?.length || 0);
    return Math.max(cabin?.capacity || 0, declared, current) || 99;
  }, [cabin, stay.counts, stay.additionalGuests]);

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

        // Reserva, hóspede, cabana, grupo e propriedade numa chamada service-role.
        // (As listas do FNRH são estáticas — não tocam o banco.)
        const boot = await GuestApi.precheckin(stayId as string).catch(() => null);
        if (!boot) { setStep('error'); return; }

        const targetPropertyId = boot.propertyId;
        const [generos, racas, transportes, motivos, tiposDocumento] = await Promise.all([
          FnrhService.getGeneros(),
          FnrhService.getRacas(),
          FnrhService.getMeiosTransporte(),
          FnrhService.getMotivosViagem(),
          FnrhService.getTiposDocumento()
        ]);
        const data = { stay: boot.stay, guest: boot.guest, cabin: boot.cabin };
        const propData = boot.property;

        if (data && propData) {
          setPropertyData(propData);
          setFnrhDomains({ generos, racas, transportes, motivos, tiposDocumento });

          // Telefone já gravado (recepção/edição) entra dividido: DDI no campo
          // próprio, número local no guest.phone. Idioma do hóspede decide o
          // DDI padrão quando o número veio sem código de país.
          const guestLang = (data.guest?.preferredLanguage as string) || lang;
          const split = splitPhone(data.guest?.phone, guestLang);
          if (split.hadCountry) countryTouched.current = true; // só quando o DDI veio do número salvo
          setPhoneCountry(split.country);
          setGuest((prev: any) => ({
            ...prev, ...data.guest,
            phone: split.number,
            address: { ...prev.address, ...(data.guest?.address || {}) },
            document: { ...prev.document, ...(data.guest?.document || {}) },
            nationality: data.guest?.nationality || prev.nationality || "BR",
            nationalityName: data.guest?.nationalityName || data.guest?.nationality || prev.nationalityName || "Brasil",
            residenceCountry: data.guest?.residenceCountry || data.guest?.nationality || prev.residenceCountry || "BR",
            gender: data.guest?.gender || prev.gender || "",
          }));
          setStay((prev: any) => ({
            ...prev, ...data.stay, propertyId: targetPropertyId,
            pets: readPets(data.stay),
            additionalGuests: data.stay.additionalGuests || [],
            counts: data.stay.counts || { adults: 1, children: 0, babies: 0 },
            areaConfigs: data.stay.areaConfigs || [],
            bedAssignments: data.stay.bedAssignments || [],
            transportation: data.stay?.transportation || prev.transportation || "CARRO",
            travelReason: data.stay?.travelReason || prev.travelReason || "TURISMO",
          }));
          setCabin(data.cabin);

          if (data.stay.groupId) {
            const allStays = boot.groupStays;
            setGroupStays(allStays);

            const urlParams = new URLSearchParams(window.location.search);
            const fromGroup = urlParams.get('fromGroup');

            if (allStays.length > 1 && !fromGroup) {
              setStep('group_manager');
              return;
            }
          }

          const isAlreadyFilled = data.stay.status === 'pre_checkin_done';

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
    if (!guest.birthDate) {
      errors.push(t.birth);
    } else {
      const age = getAge(guest.birthDate);
      if (age === null) errors.push(lang === 'en' ? 'Invalid date of birth' : lang === 'es' ? 'Fecha de nacimiento inválida' : 'Data de nascimento inválida');
      else if (age < 18) errors.push(lang === 'en' ? 'Holder must be 18 or older' : lang === 'es' ? 'El titular debe tener 18 años o más' : 'O titular deve ter 18 anos ou mais');
    }
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
      if (g.document && sanitizeDocumentForFnrh(g.document).length === 11 && !validateCPF(g.document)) {
        errors.push(`${t.companions} #${index + 1} (CPF Inválido)`);
      }
    });

    if (!agreedGeneral) errors.push(t.polGen);
    if (!agreedPrivacy) errors.push(t.polPriv);
    if (stay.hasPet && !agreedPet) errors.push(isPetExc ? t.polPetExc : t.polPet);
    // Único bloqueio que sobrou no formulário: acima do teto absoluto não vira
    // nem pedido. Tudo entre a política base e o teto passa como exceção.
    if (stay.hasPet && petCheck.band === "blocked") errors.push(t.petBlockedTitle);

    return errors;
  };

  const getAge = (birthDate: string): number | null => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const validateStep = (step: 1 | 2 | 3): string[] => {
    const errors: string[] = [];
    if (step === 1) {
      if (!guest.fullName) errors.push(t.fullName);
      if (!guest.document?.number) errors.push(t.doc);
      else if (guest.document?.type === "CPF" && !validateCPF(guest.document.number)) errors.push("CPF Inválido");
      if (!guest.birthDate) {
        errors.push(t.birth);
      } else {
        const age = getAge(guest.birthDate);
        if (age === null) errors.push(lang === 'en' ? 'Invalid date of birth' : lang === 'es' ? 'Fecha de nacimiento inválida' : 'Data de nascimento inválida');
        else if (age < 18) errors.push(lang === 'en' ? 'Holder must be 18 or older' : lang === 'es' ? 'El titular debe tener 18 años o más' : 'O titular deve ter 18 anos ou mais');
      }
      if (!guest.occupation) errors.push(t.occupation);
      if (!guest.email) errors.push(t.email);
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email)) {
        errors.push(lang === 'en' ? 'Invalid e-mail' : lang === 'es' ? 'Correo electrónico inválido' : 'E-mail inválido');
      }
      // WhatsApp com DDI: código do país + número local válidos.
      const ddi = phoneCountry.replace(/\D/g, '');
      const local = (guest.phone || '').replace(/\D/g, '');
      if (!ddi) errors.push(lang === 'en' ? 'Country code' : lang === 'es' ? 'Código de país' : 'Código do país (WhatsApp)');
      if (!local || !isLocalNumberValid(ddi, local)) errors.push('WhatsApp');
    }
    if (step === 2) {
      stay.additionalGuests?.forEach((g: any, index: number) => {
        if (!g.fullName || g.fullName === 'ACOMPANHANTE') errors.push(`${t.companions} #${index + 1} (${t.fullName})`);
      });
    }
    if (step === 3) {
      if (!guest.address?.zipCode) errors.push(t.zip);
      if (!guest.address?.street) errors.push(t.street);
      if (!guest.address?.number) errors.push(t.number);
      if (!guest.address?.neighborhood) errors.push(t.neighborhood);
      if (!guest.address?.city) errors.push(t.city);
      if (!guest.address?.state) errors.push(t.state);
      if (!guest.residenceCountry) errors.push(t.residenceCountry);
    }
    return errors;
  };

  // Troca de idioma reposiciona o DDI padrão enquanto o hóspede não editar.
  useEffect(() => {
    if (countryTouched.current) return;
    setPhoneCountry(defaultCountryForLang(lang));
  }, [lang]);

  const getDraftPayload = (step: 1 | 2 | 3) => {
    if (step === 1) return {
      guestData: {
        fullName: guest.fullName,
        document: { ...guest.document, number: sanitizeDocumentForFnrh(guest.document?.number) },
        birthDate: guest.birthDate,
        gender: guest.gender,
        raca: guest.raca,
        occupation: guest.occupation,
        nationality: guest.nationality,
        email: guest.email,
        // DDI + número local viram o telefone salvo (já com código de país).
        phone: joinPhone(phoneCountry, guest.phone),
        preferredLanguage: lang
      },
      stayData: {} as Record<string, any>
    };
    if (step === 2) return {
      stayData: { additionalGuests: stay.additionalGuests, counts: stay.counts, areaConfigs: stay.areaConfigs },
      guestData: {} as Record<string, any>
    };
    return {
      guestData: { address: guest.address },
      stayData: {} as Record<string, any>
    };
  };

  const handleNextStep = async (currentStep: 1 | 2 | 3) => {
    const errors = validateStep(currentStep);
    if (errors.length > 0) {
      toast.error(`${lang === 'en' ? 'Required' : lang === 'es' ? 'Obligatorios' : 'Obrigatórios'}: ${errors.join(', ')}`);
      return;
    }
    setIsSavingDraft(true);
    try {
      const { stayData, guestData } = getDraftPayload(currentStep);
      await GuestApi.precheckinAction({ action: "draft", stayId: stayId as string, stayData, guestData });
      setWizardStep((currentStep + 1) as 2 | 3 | 4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast.error(lang === 'en' ? 'Error saving. Try again.' : lang === 'es' ? 'Error al guardar.' : 'Erro ao salvar. Tente novamente.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const executeSave = async () => {
    setIsSaving(true);
    try {
      // Create a payload copy with sanitized fields for FNRH
      const { nationalityName: _nn, residenceCountry: _rc, ...guestForDb } = guest;
      const fnrhGuestPayload = {
        ...guestForDb,
        // Sobrescreve o phone local do estado pelo valor com DDI (o que vai ao banco).
        phone: joinPhone(phoneCountry, guest.phone),
        preferredLanguage: lang,
        document: {
          ...guest.document,
          number: sanitizeDocumentForFnrh(guest.document?.number)
        }
      };

      const { areaConfigs, bedAssignments, ...stayRest } = stay;
      const petsForWrite = writePets(!!stay.hasPet, stay.pets);
      const nowIso = new Date().toISOString();

      // Motivos em português: quem lê isto é a recepção, não o hóspede.
      const petReasonsPt = petCheck.reasons.map((r) => {
        const nameOf = (i: number) => (pets[i]?.name || "").trim() || `Pet ${i + 1}`;
        if (r.kind === "count") return `${r.value} animais (a política prevê ${r.limit})`;
        if (r.kind === "weight") return `${nameOf(r.index)} tem ${r.value} kg (a política prevê até ${r.limit} kg)`;
        if (r.kind === "underweight") return `${nameOf(r.index)} com peso abaixo de ${r.limit} kg`;
        return `${nameOf(r.index)} é de espécie "${r.value}"`;
      });

      const fnrhStayPayload = {
        ...stayRest,
        // Mantém pets/hasPet/petDetails coerentes entre si numa escrita só.
        ...petsForWrite,
        // O aceite deixa de ser decorativo: é ele que sustenta a análise da exceção
        // e a taxa. Sem gravar, não há base para recusar entrada nem para cobrar.
        petPolicyAcceptedAt: petsForWrite.hasPet && agreedPet ? nowIso : null,
        petException: petsForWrite.hasPet && isPetExc
          ? { status: "pending", reasons: petReasonsPt, requestedAt: nowIso }
          : null,
        additionalGuests: stay.additionalGuests.map((ag: any) => ({
          ...ag,
          document: ag.document ? sanitizeDocumentForFnrh(ag.document) : ""
        }))
      };

      const { accessCode: returnedCode } = await GuestApi.precheckinAction({ action: "complete", stayId: stayId as string, stayData: fnrhStayPayload as any, guestData: fnrhGuestPayload as any });
      chatwootSyncOnPreCheckinComplete(stayId as string).catch(() => {});
      // A rota devolve o código final (a reserva de grupo ganha um novo, desmembrado).
      setNewAccessCode(returnedCode ?? null);
      setStep('success');
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveIntercept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wizardStep !== 4) {
      await handleNextStep(wizardStep as 1 | 2 | 3);
      return;
    }
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
              {propertyData.name?.charAt(0) || "A"}
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

  // Regras de pet da propriedade. Duas camadas: a política base (maxPets,
  // petMaxWeight) e a exceção, que analisa o que passa disso até um teto absoluto.
  const petMinWeight: number = propertyData?.settings?.petMinWeight || 1;
  const petMaxWeight: number = propertyData?.settings?.petMaxWeight || 40;
  const maxPets = maxPetsOf(propertyData?.settings);
  const acceptsPetExceptions = propertyData?.settings?.acceptsPetExceptions !== false;
  const petExcMaxWeight = propertyData?.settings?.petExceptionMaxWeight ?? null;
  const pets: any[] = stay.pets ?? [];

  const petCheck = classifyPets(pets, {
    maxPets,
    petMinWeight,
    petMaxWeight,
    acceptsPetExceptions,
    petExceptionMaxPets: propertyData?.settings?.petExceptionMaxPets ?? null,
    petExceptionMaxWeight: petExcMaxWeight,
  });

  // Até onde o stepper anda. Sem exceção, para no limite da base; com exceção, no
  // teto absoluto — e se a propriedade não declarou teto, num valor de tela que só
  // existe para o botão ter fim (a classificação é que decide, não o input).
  const petWeightCeiling = !acceptsPetExceptions
    ? petMaxWeight
    : (petExcMaxWeight && petExcMaxWeight > petMaxWeight ? petExcMaxWeight : Math.max(petMaxWeight, 80));

  // Em exceção, o hóspede aceita a POLÍTICA PET EXCEÇÃO — não a base. Assinar o
  // texto que diz "só 1 animal" para trazer 2 é a contradição que este módulo existe
  // para acabar. O checkbox é o mesmo; o que muda é o documento por trás dele.
  const isPetExc = petCheck.band === "exception";

  /** Motivo em texto, para o hóspede saber exatamente o que saiu da regra. */
  const petReasonLabel = (r: (typeof petCheck.reasons)[number]): string => {
    const nameOf = (i: number) => (pets[i]?.name || "").trim() || `${t.petOne} ${i + 1}`;
    if (r.kind === "count") return t.petExcCount.replace("{n}", String(r.value)).replace("{max}", String(r.limit));
    if (r.kind === "weight") return t.petExcWeight.replace("{name}", nameOf(r.index)).replace("{w}", String(r.value)).replace("{max}", String(r.limit));
    if (r.kind === "underweight") return t.petBlockedUnder.replace("{max}", String(r.limit));
    return t.petExcSpecies.replace("{name}", nameOf(r.index));
  };

  /** Por que está bloqueado — fala do teto, não do caso. */
  const petBlockedLabel = (r: (typeof petCheck.blocking)[number]): string => {
    if (r.kind === "count") return t.petBlockedCount.replace("{max}", String(propertyData?.settings?.petExceptionMaxPets ?? r.limit));
    if (r.kind === "weight") return t.petBlockedWeight.replace("{max}", String(petExcMaxWeight ?? r.limit));
    if (r.kind === "underweight") return t.petBlockedUnder.replace("{max}", String(r.limit));
    return t.petExcSpecies.replace("{name}", (pets[r.index]?.name || "").trim() || `${t.petOne} ${r.index + 1}`);
  };

  /** Troca UM pet da lista sem tocar nos outros. */
  const patchPet = (idx: number, patch: Record<string, any>) =>
    setStay((prev: any) => ({
      ...prev,
      pets: (prev.pets ?? []).map((p: any, i: number) => (i === idx ? { ...p, ...patch } : p)),
    }));

  const addPet = () =>
    setStay((prev: any) => ({
      ...prev,
      pets: [...(prev.pets ?? []), { ...EMPTY_PET, weight: Math.max(DEFAULT_PET_WEIGHT, petMinWeight) }],
    }));

  const removePet = (idx: number) =>
    setStay((prev: any) => ({ ...prev, pets: (prev.pets ?? []).filter((_: any, i: number) => i !== idx) }));
  const petPolicyText = propertyData?.settings?.petPolicyText?.[lang] || propertyData?.settings?.petPolicyText?.pt || "Pet policy not defined.";
  // Sem texto de exceção cadastrado, cai na política base — nunca numa tela vazia.
  const petExcPolicyText = propertyData?.settings?.petExceptionPolicyText?.[lang] || propertyData?.settings?.petExceptionPolicyText?.pt || petPolicyText;
  const petExcAlert = propertyData?.settings?.petExceptionAlert?.[lang] || propertyData?.settings?.petExceptionAlert?.pt || t.petExcBody;
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

  const stepTitles = [t.step1Title, t.step2Title, t.step3Title, t.step4Title];

  return (
    <main className="min-h-screen bg-background text-foreground p-6 pb-24 font-sans relative" style={getThemeStyles()}>

      <PropertyHeader />

      <form onSubmit={handleSaveIntercept} className="max-w-2xl mx-auto animate-in fade-in duration-700">

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map(s => (
            <React.Fragment key={s}>
              <button
                type="button"
                onClick={() => { if (wizardStep > s) setWizardStep(s as 1 | 2 | 3 | 4); }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all shrink-0",
                  s === wizardStep ? "bg-primary text-primary-foreground shadow-md scale-110"
                    : s < wizardStep ? "bg-primary/30 text-primary cursor-pointer hover:bg-primary/50"
                    : "bg-secondary text-muted-foreground cursor-default"
                )}
              >
                {s < wizardStep ? <CheckCircle size={16} /> : s}
              </button>
              {s < 4 && <div className={cn("flex-1 h-0.5 transition-colors", s < wizardStep ? "bg-primary/40" : "bg-border")} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step label */}
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
          {t.stepOf.replace('%s', String(wizardStep))}
        </p>
        <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground mb-8">
          {stepTitles[wizardStep - 1]}
        </h2>

        <div className="space-y-8">

        {/* STEP 1 — Identidade Titular */}
        {wizardStep === 1 && (
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
            <User size={20} className="text-primary" /> {t.titleHolder}
          </h3>

          {/* Idioma preferido */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.preferredLang}</label>
            <div className="flex gap-2">
              {(['pt', 'en', 'es'] as const).map(l => (
                <button
                  key={l} type="button"
                  onClick={() => setLang(l)}
                  className={cn(
                    "flex-1 py-3 rounded-2xl text-sm font-black uppercase tracking-widest border transition-all",
                    lang === l
                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {l === 'pt' ? '🇧🇷 PT' : l === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.nationality}</label>
              <select
                value={guest.nationality || "BR"}
                onChange={e => {
                  const c = countries.find(c => c.iso === e.target.value);
                  setGuest({ ...guest, nationality: e.target.value, nationalityName: c?.name || e.target.value });
                }}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm appearance-none"
              >
                {countries.map(c => (
                  <option key={c.iso} value={c.iso}>{c.flag} {c.name} ({c.iso})</option>
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

            <div className="col-span-2 md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Nº de Identificação</label>
              <input
                value={guest.document?.number || ""}
                onChange={e => setGuest({ ...guest, document: { ...guest.document, number: e.target.value } })}
                onFocus={e => { if (e.target.value === 'N/A' || e.target.value === 'n/a') setGuest({ ...guest, document: { ...guest.document, number: '' } }); }}
                onBlur={() => handleCPFBlur(guest.document?.type, guest.document?.number)}
                className={`w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm ${(guest.document?.number === 'N/A' || guest.document?.number === 'n/a') ? 'text-muted-foreground/50 italic' : ''}`}
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
                  value={guest.gender || ""}
                  onChange={e => setGuest({ ...guest, gender: e.target.value })}
                  className="w-full bg-secondary border border-border p-3 rounded-xl outline-none text-xs font-medium focus:border-primary/50 transition-colors appearance-none"
                >
                  <option value="">{t.notInformed}</option>
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

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.email}</label>
            <input
              type="email"
              value={guest.email || ""}
              onChange={e => setGuest({ ...guest, email: e.target.value })}
              className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm font-medium"
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">
              WhatsApp *{" "}
              <span className="normal-case font-medium text-muted-foreground/70">
                {lang === 'en' ? '(country code + number)' : lang === 'es' ? '(código de país + número)' : '(código do país + número)'}
              </span>
            </label>
            <div className="flex gap-2">
              <div className="flex items-center bg-secondary border border-border rounded-2xl px-3 focus-within:border-primary/50 transition-colors">
                <span className="text-sm font-bold text-muted-foreground">+</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  aria-label={lang === 'en' ? 'Country code' : lang === 'es' ? 'Código de país' : 'Código do país (DDI)'}
                  value={phoneCountry.replace(/\D/g, "")}
                  onChange={e => { countryTouched.current = true; setPhoneCountry(e.target.value.replace(/\D/g, "").slice(0, 3)); }}
                  placeholder="55"
                  className="w-12 bg-transparent py-4 pl-1 outline-none text-sm font-medium font-mono text-center"
                />
              </div>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                aria-label={lang === 'en' ? 'Phone number' : lang === 'es' ? 'Número de teléfono' : 'Número com DDD'}
                value={(guest.phone || "").replace(/\D/g, "")}
                onChange={e => setGuest({ ...guest, phone: e.target.value.replace(/\D/g, "") })}
                className="flex-1 bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm font-medium font-mono"
                placeholder={lang === 'en' ? 'Area code + number' : lang === 'es' ? 'DDD + número' : '48 99999-9999'}
              />
            </div>
          </div>
        </section>
        )}

        {/* STEP 2 — Acompanhantes + Montagem */}
        {wizardStep === 2 && (
        <div className="space-y-8">
        <section className="space-y-6">
          <div className="flex justify-between items-center border-b border-border pb-4">
            <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
              <Users size={20} className="text-primary" /> {t.companions}
            </h3>
            {cabin?.capacity && (
              <span className="text-[10px] font-bold uppercase text-muted-foreground bg-secondary px-3 py-1.5 rounded-lg border border-border">
                {1 + (stay.additionalGuests?.length || 0)}/{maxCapacity}
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
                      onFocus={e => {
                        if (e.target.value === 'ACOMPANHANTE') {
                          const newGuests = [...stay.additionalGuests];
                          newGuests[idx].fullName = '';
                          setStay({ ...stay, additionalGuests: newGuests });
                        }
                      }}
                      className={`w-full bg-background border border-border p-3 rounded-xl outline-none text-sm focus:border-primary/50 transition-colors ${g.fullName === 'ACOMPANHANTE' ? 'text-muted-foreground/50 italic' : ''}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-muted-foreground">{t.doc} {t.docOpt}</label>
                    <input
                      value={g.document}
                      onChange={e => {
                        const newGuests = [...stay.additionalGuests];
                        newGuests[idx].document = e.target.value;
                        setStay({ ...stay, additionalGuests: newGuests });
                      }}
                      onBlur={() => g.document && handleCPFBlur("CPF", g.document, "Acompanhante")}
                      className="w-full bg-background border border-border p-3 rounded-xl outline-none text-sm focus:border-primary/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[9px] font-bold uppercase text-muted-foreground">{t.birthDateOpt}</label>
                    <input
                      type="date"
                      value={g.birthDate || ""}
                      onChange={e => {
                        const newGuests = [...stay.additionalGuests];
                        newGuests[idx].birthDate = e.target.value;
                        setStay({ ...stay, additionalGuests: newGuests });
                      }}
                      className="w-full bg-background border border-border p-3 rounded-xl outline-none text-sm focus:border-primary/50 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>
            ))}

            {(() => {
              const currentTotal = 1 + (stay.additionalGuests?.length || 0);
              const isFull = currentTotal >= maxCapacity;
              const addGuest = (type: string) => {
                if (isFull) {
                  toast.error(lang === 'en' ? `Maximum capacity reached (${maxCapacity} guests)` : lang === 'es' ? `Capacidad máxima alcanzada (${maxCapacity} huéspedes)` : `Capacidade máxima atingida (${maxCapacity} hóspedes)`);
                  return;
                }
                setStay((p: any) => ({ ...p, additionalGuests: [...p.additionalGuests, { id: Date.now().toString(), type, fullName: "", document: "", birthDate: "" }] }));
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

        {/* Layout/Montagem — dentro do step 2 */}
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
                    ) : expandedArea === area.id ? (
                      /* Múltiplas variantes — expandido: mostra radio buttons */
                      <div className="px-4 pb-4 flex flex-col gap-2">
                        {configs.map((cfg: any[], idx: number) => {
                          const label = cfg.length > 0 ? cfg.map(bedLabel).join(' + ') : `Opção ${String.fromCharCode(65 + idx)}`;
                          const isSelected = selectedConfigIdx === idx;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setStay((s: any) => ({
                                  ...s,
                                  areaConfigs: [
                                    ...(s.areaConfigs || []).filter((ac: any) => ac.areaId !== area.id),
                                    { areaId: area.id, configIndex: idx }
                                  ]
                                }));
                                setExpandedArea(null);
                              }}
                              className={cn(
                                "w-full p-4 rounded-2xl border text-left font-bold transition-all active:scale-[0.98] flex items-center gap-3",
                                isSelected
                                  ? "bg-foreground text-background border-foreground shadow-md"
                                  : "bg-background border-border text-muted-foreground"
                              )}
                            >
                              <span className={cn(
                                "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                                isSelected ? "border-background bg-background/30" : "border-border"
                              )}>
                                {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-background" />}
                              </span>
                              <span className="flex-1 text-sm">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      /* Múltiplas variantes — colapsado: mostra opção selecionada + botão Alterar */
                      <div className="px-5 pb-4 flex items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          {(configs[selectedConfigIdx] || configs[0] || []).map((bed: any) => (
                            <span key={bed.id} className="flex items-center gap-1.5 bg-background border border-border px-3 py-2 rounded-xl text-sm font-semibold text-foreground">
                              <span className="text-primary text-base">🛏</span> {bedLabel(bed)}
                            </span>
                          ))}
                          {(configs[selectedConfigIdx] || configs[0] || []).length === 0 && (
                            <span className="text-xs text-muted-foreground italic">
                              {lang === 'en' ? 'No beds configured' : lang === 'es' ? 'Sin camas configuradas' : 'Sem leitos configurados'}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedArea(area.id)}
                          className="shrink-0 px-3 py-2 bg-secondary border border-border rounded-xl text-xs font-bold uppercase text-primary hover:bg-accent transition-colors"
                        >
                          {t.change}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        </div>
        )}

        {/* STEP 3 — Residência */}
        {wizardStep === 3 && (
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
            <MapPin size={20} className="text-primary" /> {t.residence}
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

            <div className="md:col-span-4 space-y-1 pt-2 border-t border-border mt-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">{t.residenceCountry}</label>
              <select
                value={guest.residenceCountry || guest.nationality || "BR"}
                onChange={e => setGuest({ ...guest, residenceCountry: e.target.value })}
                className="w-full bg-secondary border border-border p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors text-sm appearance-none"
              >
                {countries.map(c => (
                  <option key={c.iso} value={c.iso}>{c.flag} {c.name} ({c.iso})</option>
                ))}
              </select>
              {guest.residenceCountry && guest.nationality && guest.residenceCountry !== guest.nationality && (
                <p className="text-[9px] text-primary/70 font-medium mt-1">
                  {lang === 'en'
                    ? `Nationality: ${countries.find(c => c.iso === guest.nationality)?.name || guest.nationality} — Residence: ${countries.find(c => c.iso === guest.residenceCountry)?.name || guest.residenceCountry}`
                    : lang === 'es'
                    ? `Nacionalidad: ${countries.find(c => c.iso === guest.nationality)?.name || guest.nationality} — Residencia: ${countries.find(c => c.iso === guest.residenceCountry)?.name || guest.residenceCountry}`
                    : `Nacionalidade: ${countries.find(c => c.iso === guest.nationality)?.name || guest.nationality} — Residência: ${countries.find(c => c.iso === guest.residenceCountry)?.name || guest.residenceCountry}`
                  }
                </p>
              )}
            </div>
          </div>
        </section>
        )}

        {/* STEP 4 — Viagem + Pets + Termos */}
        {wizardStep === 4 && (
        <div className="space-y-8">
        <section className="bg-secondary/30 border border-border p-8 rounded-[40px] space-y-8">
          <div className="space-y-6">
            <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2 text-foreground">
              <Plane size={20} className="text-primary" /> {t.travel}
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
              <input type="checkbox" checked={!!stay.hasPet} onChange={e => {
                const on = e.target.checked;
                // Ligar com a lista vazia semeia o primeiro pet; desligar limpa tudo.
                setStay((prev: any) => ({
                  ...prev,
                  hasPet: on,
                  pets: on
                    ? (prev.pets?.length ? prev.pets : [{ ...EMPTY_PET, weight: Math.max(DEFAULT_PET_WEIGHT, petMinWeight) }])
                    : [],
                }));
                if (!on) setAgreedPet(false);
              }} className="w-6 h-6 accent-orange-500 rounded-lg cursor-pointer" />
            </label>

            {stay.hasPet && (
              <div className="space-y-6 animate-in zoom-in duration-300">

                <div className="text-xs text-orange-600/90 bg-orange-500/10 p-4 rounded-xl border border-orange-500/20 leading-relaxed font-medium">
                  {petPolicyAlert}
                </div>

                {pets.map((pet: any, idx: number) => (
                  <div key={idx} className="space-y-4">
                    {pets.length > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-600">
                          {t.petOne} {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePet(idx)}
                          className="text-[10px] font-bold uppercase text-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {t.petRemove}
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input
                        placeholder={t.petName}
                        value={pet.name || ""}
                        onChange={e => patchPet(idx, { name: e.target.value })}
                        className="bg-background border border-border p-4 rounded-2xl text-sm focus:border-orange-500/50 outline-none transition-colors text-foreground"
                      />
                      <input
                        placeholder={t.petBreed}
                        value={pet.breed || ""}
                        onChange={e => patchPet(idx, { breed: e.target.value })}
                        className="bg-background border border-border p-4 rounded-2xl text-sm focus:border-orange-500/50 outline-none transition-colors text-foreground"
                      />
                      <select
                        value={pet.species || "Cachorro"}
                        onChange={e => patchPet(idx, { species: e.target.value })}
                        className="bg-background border border-border p-4 rounded-2xl text-sm outline-none focus:border-orange-500/50 transition-colors text-foreground appearance-none"
                      >
                        <option value="Cachorro">{t.petDog}</option>
                        <option value="Gato">{t.petCat}</option>
                        <option value="Outro">{t.petOther}</option>
                      </select>
                    </div>

                    <PetWeightField
                      value={pet.weight}
                      onChange={(w) => patchPet(idx, { weight: w })}
                      min={petMinWeight}
                      max={petWeightCeiling}
                      baseMax={petMaxWeight}
                      label={t.petWeight}
                      lang={lang}
                      badge={t.petExcBadge}
                    />

                    {idx < pets.length - 1 && <div className="border-t border-orange-500/20 pt-2" />}
                  </div>
                ))}

                {/* Fora da política base o pedido NÃO é recusado no formulário: vira exceção
                    em análise. Omitir o 2º pet é sempre pior que declará-lo. Só o que passa
                    do teto absoluto bloqueia — e aí a tela diz o que fazer. */}
                {petCheck.band === "exception" && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-3">
                    <p className="text-sm font-black uppercase tracking-tight text-amber-700">{t.petExcTitle}</p>
                    <p className="text-xs text-amber-800/90 leading-relaxed">{petExcAlert}</p>
                    <div className="pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/80">{t.petExcWhy}</p>
                      <ul className="mt-1 space-y-1">
                        {petCheck.reasons.map((r, i) => (
                          <li key={i} className="text-xs text-amber-900 font-semibold">• {petReasonLabel(r)}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {petCheck.band === "blocked" && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 space-y-3">
                    <p className="text-sm font-black uppercase tracking-tight text-red-600">{t.petBlockedTitle}</p>
                    <p className="text-xs text-red-700/90 leading-relaxed">{t.petBlockedBody}</p>
                    <ul className="space-y-1">
                      {petCheck.blocking.map((r, i) => (
                        <li key={i} className="text-xs text-red-800 font-semibold">• {petBlockedLabel(r)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {pets.length < PET_HARD_CAP && (
                  <button
                    type="button"
                    onClick={addPet}
                    className="w-full py-4 rounded-2xl border-2 border-dashed border-orange-500/30 text-orange-600 text-sm font-bold hover:bg-orange-500/5 hover:border-orange-500/50 transition-all active:scale-[0.99]"
                  >
                    + {t.petAdd}
                  </button>
                )}
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
                <span className="text-sm text-foreground">{t.agree} <button type="button" onClick={(e) => { e.preventDefault(); setPolicyModal('pet'); }} className={cn("hover:underline font-bold transition-all", isPetExc ? "text-amber-600" : "text-orange-500")}>{isPetExc ? t.polPetExc : t.polPet}</button> *</span>
              </label>
            )}
          </div>
        </section>

        <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-yellow-600 text-xs font-medium">
          <AlertCircle size={16} className="shrink-0" />
          <p>{t.mandatoryWarn}</p>
        </div>
        </div>
        )}

        </div>{/* end space-y-8 */}

        {/* Nav button */}
        <div className="mt-8">
          {wizardStep < 4 ? (
            <button
              type="button"
              disabled={isSavingDraft}
              onClick={() => handleNextStep(wizardStep as 1 | 2 | 3)}
              className="w-full py-6 bg-primary text-primary-foreground font-black text-xl uppercase tracking-widest rounded-[32px] hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-xl shadow-primary/20"
            >
              {isSavingDraft ? <><Loader2 className="animate-spin" size={20} /> {t.saving}</> : <>{t.next} <ArrowRight size={20} /></>}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-8 bg-primary text-primary-foreground font-black text-2xl uppercase tracking-widest rounded-[32px] hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-xl shadow-primary/20"
            >
              {isSaving ? <Loader2 className="animate-spin" /> : t.submit}
            </button>
          )}
        </div>

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
                {policyModal === 'general' ? t.polGen : policyModal === 'privacy' ? t.polPriv : isPetExc ? t.polPetExc : t.polPet}
              </h3>
              <button type="button" onClick={() => setPolicyModal(null)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-foreground whitespace-pre-wrap leading-relaxed font-medium">
              {policyModal === 'general' ? generalPolicyText : policyModal === 'privacy' ? privacyPolicyText : isPetExc ? petExcPolicyText : petPolicyText}
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

      <Toaster position="top-center" richColors expand duration={5000} />
    </main>
  );
}