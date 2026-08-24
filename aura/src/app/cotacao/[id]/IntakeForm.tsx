// O passo 2 da proposta: "para garantir sua reserva, precisamos dos seguintes
// detalhes" — a mensagem que a recepção mandava no WhatsApp, virada tela.
//
// Mora fora do ProposalClient de propósito: são duas telas com pouca coisa em
// comum, e o formulário sozinho já é maior que a escolha de cabana.
//
// O que vai para o servidor é só o que a pessoa digitou + o ID da condição de
// pagamento. Rótulo, desconto e valor são resolvidos lá (ver buildIntake em
// rate-quote-public-service.ts) — aqui o total com desconto é ilustração.
"use client";

import { useMemo, useRef, useState } from "react";
import { submitQuoteIntake } from "@/app/actions/quote-actions";
import { DISPLAY_FONT } from "@/app/check-in/[code]/_portal/ui";
import { COUNTRIES } from "@/lib/countries";
import { defaultCountryForLang } from "@/lib/phone";
import { PET_HARD_CAP } from "@/lib/pets";
import { MsgLang, paymentTotal } from "@/lib/rate-engine";
import { fetchCEP, validateCPF } from "@/lib/utils-checkin";
import type { PetDetails } from "@/types/aura";
import type { PublicQuoteView } from "@/services/rate-quote-public-service";

const money = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Dict = {
  title: string;
  intro: string;
  optional: string;
  holder: string;
  fullName: string;
  docType: string;
  docNumber: string;
  docInvalid: string;
  birthDate: string;
  email: string;
  phone: string;
  phoneCountry: string;
  address: string;
  country: string;
  zip: string;
  zipNotFound: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  companions: string;
  companionsHint: string;
  companionName: string;
  addCompanion: string;
  remove: string;
  kind: Record<"adult" | "child" | "baby", string>;
  vehicle: string;
  plate: string;
  plateHint: string;
  pets: string;
  addPet: string;
  petName: string;
  petSpecies: string;
  species: Record<PetDetails["species"], string>;
  petBreed: string;
  petWeight: string;
  petWeightRange: (min: number | null, max: number | null) => string;
  petNotQuoted: string;
  petsNotAccepted: string;
  payment: string;
  paymentWith: (v: string) => string;
  notes: string;
  notesPlaceholder: string;
  privacyTitle: string;
  privacyRead: string;
  privacyHide: string;
  consent: string;
  submit: string;
  sending: string;
  genericError: string;
  doneTitle: string;
  doneBody: string;
  docTypes: Record<string, string>;
};

const DICT: Record<MsgLang, Dict> = {
  pt: {
    title: "Falta pouco!",
    intro: "Para garantir a sua reserva, precisamos de alguns dados. Leva menos de dois minutos — e adianta o seu check-in.",
    optional: "opcional",
    holder: "Titular da reserva",
    fullName: "Nome completo",
    docType: "Documento",
    docNumber: "Número",
    docInvalid: "CPF inválido — confira os números.",
    birthDate: "Data de nascimento",
    email: "E-mail",
    phone: "Telefone / WhatsApp",
    phoneCountry: "País",
    address: "Endereço",
    country: "País",
    zip: "CEP",
    zipNotFound: "CEP não encontrado — preencha à mão.",
    street: "Rua",
    number: "Número",
    complement: "Complemento",
    neighborhood: "Bairro",
    city: "Cidade",
    state: "Estado",
    companions: "Acompanhantes",
    companionsHint: "Opcional, mas ajuda muito na chegada. Preencha quem já estiver definido.",
    companionName: "Nome",
    addCompanion: "Adicionar acompanhante",
    remove: "Remover",
    kind: { adult: "Adulto", child: "Criança", baby: "Bebê" },
    vehicle: "Veículo",
    plate: "Placa",
    plateHint: "Para liberar a entrada e o estacionamento.",
    pets: "Pet",
    addPet: "Vou levar um pet",
    petName: "Nome",
    petSpecies: "Espécie",
    species: { Cachorro: "Cachorro", Gato: "Gato", Outro: "Outro" },
    petBreed: "Raça",
    petWeight: "Peso (kg)",
    petWeightRange: (min, max) =>
      min != null && max != null ? `Aceitamos pets de ${min} a ${max} kg.`
      : max != null ? `Aceitamos pets de até ${max} kg.` : "",
    petNotQuoted: "A sua proposta foi calculada sem pet — a recepção vai confirmar a taxa com você.",
    petsNotAccepted: "No momento não recebemos pets. Fale com a pousada antes de confirmar.",
    payment: "Forma de pagamento",
    paymentWith: (v) => `Fica R$ ${v}`,
    notes: "Observações",
    notesPlaceholder: "Aniversário, lua de mel, restrição alimentar, chegada de madrugada…",
    privacyTitle: "Política de privacidade",
    privacyRead: "ler",
    privacyHide: "ocultar",
    consent: "Autorizo o uso destes dados para a minha reserva.",
    submit: "Enviar meus dados",
    sending: "Enviando…",
    genericError: "Não foi possível registrar os seus dados.",
    doneTitle: "Recebemos seus dados!",
    doneBody: "Está tudo com a recepção. Em instantes entramos em contato para confirmar a reserva e combinar o pagamento.",
    docTypes: { CPF: "CPF", PASSAPORTE: "Passaporte", RG: "RG", DNI: "DNI", CNH: "CNH", OUTRO: "Outro" },
  },
  en: {
    title: "Almost there!",
    intro: "To secure your booking we need a few details. It takes under two minutes — and speeds up your check-in.",
    optional: "optional",
    holder: "Main guest",
    fullName: "Full name",
    docType: "Document",
    docNumber: "Number",
    docInvalid: "Invalid CPF — please check the numbers.",
    birthDate: "Date of birth",
    email: "Email",
    phone: "Phone / WhatsApp",
    phoneCountry: "Country",
    address: "Address",
    country: "Country",
    zip: "Postal code",
    zipNotFound: "Postal code not found — please fill it in.",
    street: "Street",
    number: "Number",
    complement: "Unit / extra",
    neighborhood: "District",
    city: "City",
    state: "State",
    companions: "Other guests",
    companionsHint: "Optional, but it helps a lot on arrival. Fill in whoever is already confirmed.",
    companionName: "Name",
    addCompanion: "Add guest",
    remove: "Remove",
    kind: { adult: "Adult", child: "Child", baby: "Infant" },
    vehicle: "Vehicle",
    plate: "Licence plate",
    plateHint: "So we can clear your entry and parking.",
    pets: "Pet",
    addPet: "I'm bringing a pet",
    petName: "Name",
    petSpecies: "Species",
    species: { Cachorro: "Dog", Gato: "Cat", Outro: "Other" },
    petBreed: "Breed",
    petWeight: "Weight (kg)",
    petWeightRange: (min, max) =>
      min != null && max != null ? `We welcome pets from ${min} to ${max} kg.`
      : max != null ? `We welcome pets up to ${max} kg.` : "",
    petNotQuoted: "Your quote was calculated without a pet — the front desk will confirm the fee with you.",
    petsNotAccepted: "We can't host pets at the moment. Please talk to us before confirming.",
    payment: "Payment method",
    paymentWith: (v) => `Comes to R$ ${v}`,
    notes: "Anything else?",
    notesPlaceholder: "Birthday, honeymoon, dietary restriction, late arrival…",
    privacyTitle: "Privacy policy",
    privacyRead: "read",
    privacyHide: "hide",
    consent: "I allow these details to be used for my booking.",
    submit: "Send my details",
    sending: "Sending…",
    genericError: "We couldn't save your details.",
    doneTitle: "We've got your details!",
    doneBody: "Everything is with the front desk. We'll be in touch shortly to confirm your booking and arrange payment.",
    docTypes: { CPF: "CPF", PASSAPORTE: "Passport", RG: "ID card", DNI: "DNI", CNH: "Driver's licence", OUTRO: "Other" },
  },
  es: {
    title: "¡Falta poco!",
    intro: "Para garantizar su reserva necesitamos algunos datos. Toma menos de dos minutos — y adelanta su check-in.",
    optional: "opcional",
    holder: "Titular de la reserva",
    fullName: "Nombre completo",
    docType: "Documento",
    docNumber: "Número",
    docInvalid: "CPF inválido — revise los números.",
    birthDate: "Fecha de nacimiento",
    email: "Correo electrónico",
    phone: "Teléfono / WhatsApp",
    phoneCountry: "País",
    address: "Dirección",
    country: "País",
    zip: "Código postal",
    zipNotFound: "Código postal no encontrado — complete a mano.",
    street: "Calle",
    number: "Número",
    complement: "Complemento",
    neighborhood: "Barrio",
    city: "Ciudad",
    state: "Provincia / Estado",
    companions: "Acompañantes",
    companionsHint: "Opcional, pero ayuda mucho en la llegada. Complete quien ya esté definido.",
    companionName: "Nombre",
    addCompanion: "Agregar acompañante",
    remove: "Quitar",
    kind: { adult: "Adulto", child: "Niño/a", baby: "Bebé" },
    vehicle: "Vehículo",
    plate: "Patente",
    plateHint: "Para liberar la entrada y el estacionamiento.",
    pets: "Mascota",
    addPet: "Voy a llevar una mascota",
    petName: "Nombre",
    petSpecies: "Especie",
    species: { Cachorro: "Perro", Gato: "Gato", Outro: "Otro" },
    petBreed: "Raza",
    petWeight: "Peso (kg)",
    petWeightRange: (min, max) =>
      min != null && max != null ? `Aceptamos mascotas de ${min} a ${max} kg.`
      : max != null ? `Aceptamos mascotas de hasta ${max} kg.` : "",
    petNotQuoted: "Su presupuesto fue calculado sin mascota — recepción confirmará la tarifa con usted.",
    petsNotAccepted: "Por ahora no recibimos mascotas. Hable con la posada antes de confirmar.",
    payment: "Forma de pago",
    paymentWith: (v) => `Queda en R$ ${v}`,
    notes: "Observaciones",
    notesPlaceholder: "Cumpleaños, luna de miel, restricción alimentaria, llegada de madrugada…",
    privacyTitle: "Política de privacidad",
    privacyRead: "leer",
    privacyHide: "ocultar",
    consent: "Autorizo el uso de estos datos para mi reserva.",
    submit: "Enviar mis datos",
    sending: "Enviando…",
    genericError: "No se pudieron registrar sus datos.",
    doneTitle: "¡Recibimos sus datos!",
    doneBody: "Todo está con recepción. En breve nos pondremos en contacto para confirmar la reserva y coordinar el pago.",
    docTypes: { CPF: "CPF", PASSAPORTE: "Pasaporte", RG: "RG", DNI: "DNI", CNH: "Licencia", OUTRO: "Otro" },
  },
};

const DOC_TYPES = ["CPF", "PASSAPORTE", "RG", "DNI", "CNH", "OUTRO"];

// ── Peças de tela (mesma linguagem visual do ProposalClient) ────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "12px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface)",
  color: "var(--ink)", fontSize: 16, fontFamily: "inherit", outline: "none",
};

function Section({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section style={{
      background: "var(--surface)", border: "1px solid var(--line)",
      borderRadius: 16, padding: "16px 16px 18px", marginBottom: 14,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", margin: "0 0 4px" }}>
        {title}
      </h2>
      {hint && (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
      <div style={{ marginTop: hint ? 0 : 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </section>
  );
}

function Field({ label, optional, children, style }: {
  label: string; optional?: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "block", ...style }}>
      <span style={{
        display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
        textTransform: "uppercase", color: "var(--muted)", marginBottom: 5,
      }}>
        {label}{optional ? ` · ${optional}` : ""}
      </span>
      {children}
    </label>
  );
}

/** Grid de 2 colunas que vira 1 no celular estreito. */
const row2: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12,
};

type CompanionRow = {
  key: string;
  roomId: string;
  roomLabel: string;
  kind: "adult" | "child" | "baby";
  fullName: string;
  birthDate: string;
};

let seq = 0;

/**
 * As linhas nascem do pax cotado: a acomodação 1 desconta o titular (ele é um
 * dos adultos). Quem vier a mais ou a menos ajusta na mão.
 */
function seedCompanions(quote: PublicQuoteView): CompanionRow[] {
  const rows: CompanionRow[] = [];
  quote.rooms.forEach((room, i) => {
    const adults = Math.max(0, room.adults - (i === 0 ? 1 : 0));
    const push = (kind: CompanionRow["kind"], n: number) => {
      for (let k = 0; k < n; k++) {
        rows.push({
          key: `c${++seq}`, roomId: room.id, roomLabel: room.label,
          kind, fullName: "", birthDate: "",
        });
      }
    };
    push("adult", adults);
    push("child", room.children);
    push("baby", room.babies);
  });
  return rows;
}

/** `lang` vem do ProposalClient: as pastilhas PT/EN/ES do cabeçalho regem as
 *  duas telas (a troca é só estado local, nunca grava no banco). */
export default function IntakeForm({ quote, lang, total, onDone }: {
  quote: PublicQuoteView;
  lang: MsgLang;
  /** Total das cabanas ESCOLHIDAS (o `quote.total` ainda pode ser o "a partir
   *  de" do carregamento). Só ilustra o desconto — o servidor recalcula. */
  total: number;
  onDone: () => void;
}) {
  const t = DICT[lang];

  // Titular — tudo começa vazio de propósito: o link é encaminhável, então
  // nada do que o vendedor digitou (telefone, e-mail do lead) volta à tela.
  const [fullName, setFullName] = useState("");
  const [docType, setDocType] = useState(lang === "pt" ? "CPF" : "PASSAPORTE");
  const [document, setDocument] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(defaultCountryForLang(lang) || "55");
  const [phone, setPhone] = useState("");

  // Endereço
  const [country, setCountry] = useState(lang === "pt" ? "BR" : "XX");
  const [zip, setZip] = useState("");
  const [zipMsg, setZipMsg] = useState<string | null>(null);
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const numberRef = useRef<HTMLInputElement>(null);

  const [companions, setCompanions] = useState<CompanionRow[]>(() => seedCompanions(quote));
  const [plate, setPlate] = useState("");
  const [pets, setPets] = useState<PetDetails[]>(() =>
    Array.from({ length: quote.petsQuoted }, () => ({ name: "", species: "Cachorro", breed: "", weight: 0 }))
  );
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [consent, setConsent] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const openedAt = useRef(Date.now());

  const isBR = country === "BR";
  const cpfInvalid = docType === "CPF" && document.replace(/\D/g, "").length === 11
    && !validateCPF(document);

  const payment = quote.paymentOptions.find((o) => o.id === paymentId) ?? null;
  const discounted = useMemo(
    () => (payment && payment.discountPct > 0 ? paymentTotal(total, payment.discountPct) : null),
    [payment, total]
  );

  /** O botão só libera com o mínimo que a recepção precisa para abrir a ficha. */
  const canSubmit = (() => {
    if (fullName.trim().split(/\s+/).filter(Boolean).length < 2) return false;
    if (docType === "CPF" ? !validateCPF(document) : document.replace(/[^A-Za-z0-9]/g, "").length < 4) return false;
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())) return false;
    if ((phoneCountry + phone).replace(/\D/g, "").length < 10) return false;
    if (isBR) {
      if (zip.replace(/\D/g, "").length !== 8) return false;
      if (!street.trim() || !number.trim() || !city.trim() || state.trim().length < 2) return false;
    } else if (!street.trim() || !city.trim()) {
      return false;
    }
    return consent;
  })();

  const lookupCep = async (raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setZipMsg(null);
    try {
      const data = await fetchCEP(clean);
      if (!data || data.erro) { setZipMsg(t.zipNotFound); return; }
      setStreet(data.logradouro || "");
      setNeighborhood(data.bairro || "");
      setCity(data.localidade || "");
      setState(data.uf || "");
      numberRef.current?.focus();
    } catch {
      setZipMsg(t.zipNotFound);
    }
  };

  const patchCompanion = (key: string, patch: Partial<CompanionRow>) =>
    setCompanions((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const addCompanion = () =>
    setCompanions((list) => [...list, {
      key: `c${++seq}`,
      roomId: quote.rooms[0]?.id ?? "",
      roomLabel: quote.rooms[0]?.label ?? "",
      kind: "adult", fullName: "", birthDate: "",
    }]);

  const patchPet = (i: number, patch: Partial<PetDetails>) =>
    setPets((list) => list.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  const submit = async () => {
    if (!canSubmit || sending) return;
    setSending(true);
    setError(null);
    const res = await submitQuoteIntake(quote.id, {
      intake: {
        holder: {
          fullName: fullName.trim(),
          documentType: docType,
          document: document.trim(),
          birthDate: birthDate || undefined,
          email: email.trim(),
          phone: `${phoneCountry}${phone}`.replace(/\D/g, ""),
          address: {
            country, zipCode: zip, street, number,
            complement, neighborhood, city, state,
          },
        },
        companions: companions
          .filter((c) => c.fullName.trim() || c.birthDate)
          .map((c) => ({
            roomId: c.roomId, kind: c.kind,
            fullName: c.fullName.trim() || undefined,
            birthDate: c.birthDate || undefined,
          })),
        vehiclePlate: plate.trim() || undefined,
        paymentOptionId: paymentId ?? undefined,
        pets: pets.filter((p) => p.name.trim() || p.weight > 0),
        notes: notes.trim() || undefined,
        privacyAccepted: consent,
      },
      elapsedMs: Date.now() - openedAt.current,
      website: honeypot,
    });
    setSending(false);
    if (res.ok) onDone();
    else setError(res.error ?? t.genericError);
  };

  return (
    <div>
      <header style={{ textAlign: "center", marginBottom: 18 }}>
        <p style={{
          fontFamily: DISPLAY_FONT, fontSize: 24, color: "var(--ink)",
          margin: "0 0 6px", fontWeight: 400,
        }}>
          {t.title}
        </p>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0, lineHeight: 1.55 }}>
          {t.intro}
        </p>
      </header>

      {/* Titular */}
      <Section title={t.holder}>
        <Field label={t.fullName}>
          <input style={inputStyle} value={fullName} autoComplete="name"
            onChange={(e) => setFullName(e.target.value)} />
        </Field>

        <div style={row2}>
          <Field label={t.docType}>
            <select style={{ ...inputStyle, appearance: "none" }} value={docType}
              onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((d) => <option key={d} value={d}>{t.docTypes[d]}</option>)}
            </select>
          </Field>
          <Field label={t.docNumber}>
            <input style={{
              ...inputStyle,
              borderColor: cpfInvalid ? "var(--clay)" : "var(--line)",
            }}
              value={document} inputMode={docType === "CPF" ? "numeric" : "text"}
              autoComplete="off"
              onChange={(e) => setDocument(
                docType === "CPF" ? e.target.value.replace(/\D/g, "").slice(0, 11) : e.target.value
              )} />
            {cpfInvalid && (
              <span style={{ display: "block", fontSize: 11.5, color: "var(--clay)", marginTop: 4 }}>
                {t.docInvalid}
              </span>
            )}
          </Field>
        </div>

        <div style={row2}>
          <Field label={t.birthDate} optional={t.optional}>
            <input style={inputStyle} type="date" value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
          <Field label={t.email}>
            <input style={inputStyle} type="email" inputMode="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

        {/* DDI separado: número sem código de país trava o envio no WhatsApp. */}
        <Field label={t.phone}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{
              display: "flex", alignItems: "center", gap: 2,
              padding: "0 4px 0 12px", borderRadius: "12px 0 0 12px",
              border: "1px solid var(--line)", borderRight: "none",
              background: "var(--surface)", color: "var(--muted)", fontWeight: 700,
            }}>+</span>
            <input style={{
              ...inputStyle, width: 72, flexShrink: 0, borderRadius: 0,
              borderLeft: "none", textAlign: "center", marginLeft: -8,
            }}
              inputMode="numeric" aria-label={t.phoneCountry} placeholder="55"
              value={phoneCountry}
              onChange={(e) => setPhoneCountry(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            <input style={{ ...inputStyle, borderRadius: "0 12px 12px 0", borderLeft: "none", marginLeft: -8 }}
              type="tel" inputMode="tel" autoComplete="tel" placeholder="53 98116-9216"
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
          </div>
        </Field>
      </Section>

      {/* Endereço — começa pelo CEP, que preenche o resto. */}
      <Section title={t.address}>
        <div style={row2}>
          <Field label={t.country}>
            <select style={{ ...inputStyle, appearance: "none" }} value={country}
              onChange={(e) => { setCountry(e.target.value); setZipMsg(null); }}>
              {COUNTRIES.map((c) => (
                <option key={c.iso} value={c.iso}>{c.flag} {c.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t.zip} optional={isBR ? undefined : t.optional}>
            <input style={inputStyle} inputMode={isBR ? "numeric" : "text"}
              autoComplete="postal-code" value={zip}
              onChange={(e) => setZip(isBR ? e.target.value.replace(/\D/g, "").slice(0, 8) : e.target.value)}
              onBlur={() => { if (isBR) void lookupCep(zip); }} />
            {zipMsg && (
              <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                {zipMsg}
              </span>
            )}
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label={t.street}>
            <input style={inputStyle} value={street} autoComplete="address-line1"
              onChange={(e) => setStreet(e.target.value)} />
          </Field>
          {/* Fora do Brasil o endereço é livre: só rua e cidade travam o envio
              (é o que o servidor exige) — o resto precisa dizer isso. */}
          <Field label={t.number} optional={isBR ? undefined : t.optional}>
            <input ref={numberRef} style={inputStyle} value={number} inputMode="numeric"
              onChange={(e) => setNumber(e.target.value)} />
          </Field>
        </div>

        <div style={row2}>
          <Field label={t.complement} optional={t.optional}>
            <input style={inputStyle} value={complement}
              onChange={(e) => setComplement(e.target.value)} />
          </Field>
          <Field label={t.neighborhood} optional={isBR ? undefined : t.optional}>
            <input style={inputStyle} value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)} />
          </Field>
        </div>

        <div style={row2}>
          <Field label={t.city}>
            <input style={inputStyle} value={city} autoComplete="address-level2"
              onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label={t.state} optional={isBR ? undefined : t.optional}>
            <input style={inputStyle} value={state} autoComplete="address-level1"
              maxLength={isBR ? 2 : 40}
              onChange={(e) => setState(isBR ? e.target.value.toUpperCase().slice(0, 2) : e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* Acompanhantes — as linhas já vêm na quantidade cotada. */}
      {(companions.length > 0 || quote.rooms.length > 0) && (
        <Section title={t.companions} hint={t.companionsHint}>
          {companions.map((c) => (
            <div key={c.key} style={{
              border: "1px solid var(--line-soft)", borderRadius: 12, padding: "10px 12px",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                fontSize: 11.5, color: "var(--muted)",
              }}>
                <strong style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
                  {t.kind[c.kind]}
                </strong>
                {quote.rooms.length > 1 && <span>· {c.roomLabel}</span>}
                <button type="button" onClick={() => setCompanions((l) => l.filter((x) => x.key !== c.key))}
                  style={{
                    marginLeft: "auto", background: "none", border: "none", padding: 0,
                    color: "var(--muted)", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
                    textDecoration: "underline",
                  }}>
                  {t.remove}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                <input style={inputStyle} placeholder={t.companionName} value={c.fullName}
                  onChange={(e) => patchCompanion(c.key, { fullName: e.target.value })} />
                <input style={inputStyle} type="date" value={c.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => patchCompanion(c.key, { birthDate: e.target.value })} />
              </div>
            </div>
          ))}
          <button type="button" onClick={addCompanion}
            style={{
              alignSelf: "flex-start", background: "var(--brand-soft)", color: "var(--brand)",
              border: "none", borderRadius: 999, padding: "9px 16px", fontSize: 13,
              fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
            + {t.addCompanion}
          </button>
        </Section>
      )}

      {/* Veículo */}
      <Section title={t.vehicle} hint={t.plateHint}>
        <Field label={t.plate} optional={t.optional}>
          <input style={{ ...inputStyle, maxWidth: 200, textTransform: "uppercase" }}
            value={plate} maxLength={10}
            onChange={(e) => setPlate(e.target.value.toUpperCase())} />
        </Field>
      </Section>

      {/* Pet — o botão existe mesmo sem pet na cotação: é a forma de avisar
          antes da chegada (e a recepção acerta a taxa). */}
      <Section title={t.pets}>
        {pets.map((p, i) => (
          <div key={i} style={{
            border: "1px solid var(--line-soft)", borderRadius: 12, padding: "10px 12px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setPets((l) => l.filter((_, k) => k !== i))}
                style={{
                  background: "none", border: "none", padding: 0, color: "var(--muted)",
                  fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline",
                }}>
                {t.remove}
              </button>
            </div>
            <div style={row2}>
              <input style={inputStyle} placeholder={t.petName} value={p.name}
                onChange={(e) => patchPet(i, { name: e.target.value })} />
              <select style={{ ...inputStyle, appearance: "none" }} value={p.species}
                onChange={(e) => patchPet(i, { species: e.target.value as PetDetails["species"] })}>
                {(["Cachorro", "Gato", "Outro"] as const).map((s) => (
                  <option key={s} value={s}>{t.species[s]}</option>
                ))}
              </select>
            </div>
            <div style={row2}>
              <input style={inputStyle} placeholder={t.petBreed} value={p.breed ?? ""}
                onChange={(e) => patchPet(i, { breed: e.target.value })} />
              <input style={inputStyle} placeholder={t.petWeight} inputMode="decimal"
                value={p.weight ? String(p.weight) : ""}
                onChange={(e) => patchPet(i, { weight: Number(e.target.value.replace(",", ".")) || 0 })} />
            </div>
          </div>
        ))}

        {pets.length < PET_HARD_CAP && (
          <button type="button"
            onClick={() => setPets((l) => [...l, { name: "", species: "Cachorro", breed: "", weight: 0 }])}
            style={{
              alignSelf: "flex-start", background: "var(--brand-soft)", color: "var(--brand)",
              border: "none", borderRadius: 999, padding: "9px 16px", fontSize: 13,
              fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
            + {t.addPet}
          </button>
        )}

        {pets.length > 0 && !quote.petRules.accepts && (
          <p style={{ fontSize: 12, color: "var(--clay)", margin: 0, lineHeight: 1.5 }}>
            {t.petsNotAccepted}
          </p>
        )}
        {pets.length > 0 && quote.petsQuoted === 0 && quote.petRules.accepts && (
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
            {t.petNotQuoted}
          </p>
        )}
        {pets.length > 0 && t.petWeightRange(quote.petRules.minWeight, quote.petRules.maxWeight) && (
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
            {t.petWeightRange(quote.petRules.minWeight, quote.petRules.maxWeight)}
          </p>
        )}
      </Section>

      {/* Pagamento */}
      {quote.paymentOptions.length > 0 && (
        <Section title={t.payment}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {quote.paymentOptions.map((o) => {
              const picked = paymentId === o.id;
              return (
                <button key={o.id} type="button" onClick={() => setPaymentId(o.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                    background: picked ? "var(--brand-soft)" : "transparent",
                    border: `1.5px solid ${picked ? "var(--brand)" : "var(--line)"}`,
                    borderRadius: 14, padding: "12px 14px",
                  }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 999, flexShrink: 0,
                    border: `2px solid ${picked ? "var(--brand)" : "var(--line)"}`,
                    background: picked ? "var(--brand)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {picked && <span style={{ width: 6, height: 6, borderRadius: 999, background: "#fff" }} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.45 }}>
                    {o.label}
                  </span>
                  {o.discountPct > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--green)", flexShrink: 0 }}>
                      −{o.discountPct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {discounted != null && (
            <p style={{
              margin: 0, fontSize: 13, color: "var(--ink-soft)",
              display: "flex", alignItems: "baseline", gap: 8,
            }}>
              <span style={{ textDecoration: "line-through", color: "var(--muted)" }}>
                R$ {money(total)}
              </span>
              <strong style={{ fontSize: 16, color: "var(--brand-deep)" }}>
                {t.paymentWith(money(discounted))}
              </strong>
            </p>
          )}
        </Section>
      )}

      {/* Observações */}
      <Section title={t.notes}>
        <textarea style={{ ...inputStyle, minHeight: 88, resize: "vertical" }}
          placeholder={t.notesPlaceholder} value={notes} maxLength={1000}
          onChange={(e) => setNotes(e.target.value)} />
      </Section>

      {/* Consentimento — mesma forma do aceite das regras da pousada. */}
      <section style={{
        background: "var(--surface)", border: "1px solid var(--line)",
        borderRadius: 16, padding: "14px 16px", marginBottom: 18,
      }}>
        {quote.privacyPolicyText && (
          <>
            <button type="button" onClick={() => setPrivacyOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                background: "none", border: "none", padding: 0, cursor: "pointer",
                fontFamily: "inherit", textAlign: "left",
              }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                {t.privacyTitle}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--brand)", fontWeight: 700 }}>
                {privacyOpen ? t.privacyHide : t.privacyRead}
              </span>
            </button>
            {privacyOpen && (
              <div style={{
                fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6,
                whiteSpace: "pre-wrap", marginTop: 10, maxHeight: 240, overflowY: "auto",
                borderTop: "1px solid var(--line-soft)", paddingTop: 10,
              }}>
                {quote.privacyPolicyText}
              </div>
            )}
          </>
        )}
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          marginTop: quote.privacyPolicyText ? 12 : 0,
          fontSize: 13, color: "var(--ink)", cursor: "pointer", lineHeight: 1.5,
        }}>
          <input type="checkbox" checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }} />
          {t.consent}
        </label>
      </section>

      {/* Honeypot — invisível para gente. */}
      <input type="text" name="company" value={honeypot} tabIndex={-1} autoComplete="off"
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        aria-hidden="true" />

      <div style={{
        position: "sticky", bottom: 0, background: "var(--bg)",
        paddingTop: 12, paddingBottom: 8,
        borderTop: "1px solid var(--line-soft)",
      }}>
        {error && (
          <p style={{
            fontSize: 13, color: "var(--clay)", background: "var(--clay-soft)",
            borderRadius: 12, padding: "10px 14px", margin: "0 0 10px",
          }}>
            {error}
          </p>
        )}
        <button onClick={submit} disabled={!canSubmit || sending}
          style={{
            width: "100%", padding: "16px 20px", borderRadius: 999, border: "none",
            background: canSubmit ? "var(--brand)" : "var(--line)",
            color: canSubmit ? "#fff" : "var(--muted)",
            fontSize: 15, fontWeight: 700, fontFamily: "inherit",
            cursor: canSubmit && !sending ? "pointer" : "default",
            opacity: sending ? 0.7 : 1,
          }}>
          {sending ? t.sending : t.submit}
        </button>
      </div>
    </div>
  );
}

export { DICT as INTAKE_DICT };
