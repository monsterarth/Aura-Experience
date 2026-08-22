"use client";

import React, { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Guest } from "@/types/aura";
import { FnrhService, type FnrhDomain } from "@/services/fnrh-service";
import { T } from "@/lib/admin-tokens";
import { Field, FieldRow, Input, Select, SectionLabel, IconButton, Pill } from "@/components/aura";
import { LANG_LABELS } from "./guest-utils";

export interface FnrhDomains {
  tiposDocumento: FnrhDomain[];
  generos: FnrhDomain[];
  nacionalidades: FnrhDomain[];
  racas: FnrhDomain[];
}

/** Domínios FNRH (tipo de documento, gênero, nacionalidade, raça) — carregados uma vez por montagem. */
export function useFnrhDomains(): FnrhDomains | null {
  const [domains, setDomains] = useState<FnrhDomains | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([FnrhService.getTiposDocumento(), FnrhService.getGeneros(), FnrhService.getNacionalidades(), FnrhService.getRacas()])
      .then(([tiposDocumento, generos, nacionalidades, racas]) => { if (alive) setDomains({ tiposDocumento, generos, nacionalidades, racas }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return domains;
}

type GuestData = Omit<Guest, "updatedAt"> | Guest;

export interface GuestFormFieldsProps {
  data: GuestData;
  disabled?: boolean;
  onField: (field: keyof Guest, value: any) => void;
  onDoc: (field: string, value: string) => void;
  onAddress: (field: string, value: string) => void;
  domains: FnrhDomains | null;
  /** Ficha completa: raça, profissão, bairro/CEP/IBGE e alergias. */
  extended?: boolean;
  /** Marca obrigatórios (cadastro novo). */
  requiredMarks?: boolean;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel style={{ paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>{title}</SectionLabel>
      {children}
    </section>
  );
}

/** Campos do cadastro do hóspede (visualização desabilitada ou edição). */
export function GuestFormFields({ data, disabled = false, onField, onDoc, onAddress, domains, extended = false, requiredMarks = false }: GuestFormFieldsProps) {
  const phoneDigits = (data.phone ?? "").replace(/^\+/, "").replace(/\D/g, "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title="Identificação">
        <Field label="Nome completo" required={requiredMarks}>
          <Input value={data.fullName ?? ""} onChange={e => onField("fullName", e.target.value.toUpperCase())} disabled={disabled} placeholder="NOME COMPLETO" autoComplete="off" />
        </Field>
        <FieldRow cols={2}>
          <Field label="Tipo de documento" required={requiredMarks}>
            <Select value={data.document?.type ?? ""} onChange={e => onDoc("type", e.target.value)} disabled={disabled}>
              <option value="" disabled>Selecione…</option>
              {domains?.tiposDocumento.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="Número do documento" required={requiredMarks}>
            <Input value={data.document?.number ?? ""} onChange={e => onDoc("number", e.target.value)} disabled={disabled} placeholder="000.000.000-00" inputMode="numeric" />
          </Field>
          <Field label="Nascimento">
            <Input type="date" value={data.birthDate ?? ""} onChange={e => onField("birthDate", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Gênero">
            <Select value={data.gender ?? ""} onChange={e => onField("gender", e.target.value)} disabled={disabled}>
              <option value="" disabled>Selecione…</option>
              {domains?.generos.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
            </Select>
          </Field>
          {extended && (
            <>
              <Field label="Raça / cor">
                <Select value={(data as Guest).raca ?? "NAO_DECLARADO"} onChange={e => onField("raca" as keyof Guest, e.target.value)} disabled={disabled}>
                  {domains?.racas.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
              </Field>
              <Field label="Profissão">
                <Input value={data.occupation ?? ""} onChange={e => onField("occupation", e.target.value)} disabled={disabled} />
              </Field>
            </>
          )}
          <Field label="Nacionalidade">
            <Select value={data.nationality ?? ""} onChange={e => onField("nationality", e.target.value)} disabled={disabled}>
              <option value="" disabled>Selecione…</option>
              {domains?.nacionalidades.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
            </Select>
          </Field>
          <Field label="Idioma preferido">
            <Select value={data.preferredLanguage ?? "pt"} onChange={e => onField("preferredLanguage", e.target.value)} disabled={disabled}>
              {Object.entries(LANG_LABELS).map(([k, v]) => <option key={k} value={k}>{k === "pt" ? "Português" : k === "en" ? "English" : "Español"} ({v})</option>)}
            </Select>
          </Field>
        </FieldRow>
      </Section>

      <Section title="Contato">
        <FieldRow cols={2}>
          <Field label="E-mail">
            <Input type="email" value={data.email ?? ""} onChange={e => onField("email", e.target.value)} disabled={disabled} inputMode="email" autoComplete="off" />
          </Field>
          <Field label="Telefone / WhatsApp" hint={disabled ? undefined : "Com DDI, só números (ex.: 5511999998888)"}>
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <span style={{ display: "flex", alignItems: "center", padding: "0 12px", borderRadius: "10px 0 0 10px", border: `1px solid ${T.border2}`, borderRight: "none", background: T.glass2, color: T.muted, fontWeight: 800, fontSize: 14 }}>+</span>
              <Input type="tel" value={phoneDigits} onChange={e => onField("phone", e.target.value.replace(/\D/g, ""))} disabled={disabled} placeholder="55 00 00000-0000" inputMode="tel" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, fontVariantNumeric: "tabular-nums" }} />
            </div>
          </Field>
        </FieldRow>
      </Section>

      <Section title="Endereço">
        <FieldRow cols={3}>
          <Field label="Rua" style={{ gridColumn: "span 2" }}>
            <Input value={data.address?.street ?? ""} onChange={e => onAddress("street", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Número">
            <Input value={data.address?.number ?? ""} onChange={e => onAddress("number", e.target.value)} disabled={disabled} />
          </Field>
          {extended && (
            <Field label="Bairro">
              <Input value={data.address?.neighborhood ?? ""} onChange={e => onAddress("neighborhood", e.target.value)} disabled={disabled} />
            </Field>
          )}
          <Field label="Cidade">
            <Input value={data.address?.city ?? ""} onChange={e => onAddress("city", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Estado">
            <Input value={data.address?.state ?? ""} onChange={e => onAddress("state", e.target.value)} disabled={disabled} />
          </Field>
          {extended && (
            <Field label="CEP">
              <Input value={data.address?.zipCode ?? ""} onChange={e => onAddress("zipCode", e.target.value)} disabled={disabled} inputMode="numeric" />
            </Field>
          )}
          <Field label="País" style={extended ? { gridColumn: "span 2" } : undefined}>
            <Input value={data.address?.country ?? ""} onChange={e => onAddress("country", e.target.value)} disabled={disabled} />
          </Field>
          {extended && (
            <Field label="Cód. IBGE (FNRH)">
              <Input value={data.address?.ibgeCityId ?? ""} onChange={e => onAddress("ibgeCityId", e.target.value)} disabled={disabled} inputMode="numeric" />
            </Field>
          )}
        </FieldRow>
      </Section>

      {extended && (
        <Section title="Alergias / restrições">
          {data.allergies && data.allergies.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.allergies.map((a, i) => (
                <span key={`${a}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                  <Pill tone="red" label={a} size="md" />
                  {!disabled && <IconButton icon={X} label={`Remover ${a}`} size="sm" onClick={() => onField("allergies", data.allergies.filter((_, j) => j !== i))} />}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: T.muted2 }}>Nenhuma alergia registrada.</p>
          )}
          {!disabled && <AllergyInput onAdd={v => onField("allergies", [...(data.allergies ?? []), v])} />}
        </Section>
      )}
    </div>
  );
}

function AllergyInput({ onAdd }: { onAdd: (v: string) => void }) {
  const [val, setVal] = useState("");
  const commit = () => { if (val.trim()) { onAdd(val.trim()); setVal(""); } };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} placeholder="Ex.: glúten, amendoim…" />
      <IconButton icon={Plus} label="Adicionar alergia" variant="soft" tone="red" onClick={commit} />
    </div>
  );
}
