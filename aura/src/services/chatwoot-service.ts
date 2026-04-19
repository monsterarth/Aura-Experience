// src/services/chatwoot-service.ts
// Integração com a API do Chatwoot para sincronizar dados de contatos e conversas.
// Todos os métodos públicos são fire-and-forget: falhas nunca bloqueiam o fluxo principal.

import { supabaseAdmin } from "@/lib/supabase";
import { Stay, Guest, Cabin, Property } from "@/types/aura";

// ── Config ────────────────────────────────────────────────────────────────────

interface ResolvedConfig {
  base: string;
  headers: Record<string, string>;
  inboxId: number;
}

/**
 * Resolve a config do Chatwoot exclusivamente a partir de property.settings.whatsappConfig.
 * Retorna null se qualquer campo estiver ausente — sem fallback para env vars.
 */
function resolveConfig(property?: Property): ResolvedConfig | null {
  const wc = property?.settings?.whatsappConfig;
  if (wc?.chatwootUrl && wc?.chatwootAccountId && wc?.chatwootApiToken && wc?.chatwootInboxId) {
    return {
      base: `${wc.chatwootUrl}/api/v1/accounts/${wc.chatwootAccountId}`,
      headers: { "api_access_token": wc.chatwootApiToken, "Content-Type": "application/json" },
      inboxId: wc.chatwootInboxId,
    };
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza telefone para E.164 (+55...). Assume Brasil se não houver código de país. */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 11 || digits.length === 10) return `+55${digits}`;
  return `+${digits}`;
}

/** Formata ISO date → YYYY-MM-DD (formato esperado pelo Chatwoot para atributos do tipo Date) */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().split("T")[0]; // "2025-04-18"
  } catch {
    return iso;
  }
}

// ── Primitivas da API ─────────────────────────────────────────────────────────

/** Busca contato via filter API (match exato por phone_number). Mais confiável que search. */
async function filterContactByPhone(base: string, headers: Record<string, string>, phone: string): Promise<number | null> {
  const digitsOnly = phone.replace(/\D/g, "");
  // Chatwoot pode ter salvo em vários formatos — tenta os mais comuns
  const candidates = [phone, digitsOnly, `+${digitsOnly}`, digitsOnly.slice(-11)];

  for (const value of candidates) {
    const res = await fetch(`${base}/contacts/filter`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        payload: [{
          attribute_key: "phone_number",
          filter_operator: "equal_to",
          values: [value],
          query_operator: null,
        }],
      }),
    });
    if (!res.ok) continue;
    const json = await res.json();
    const contacts: any[] = json?.payload ?? [];
    console.log(`[Chatwoot] filter phone="${value}" → ${contacts.length} resultado(s):`, contacts.map(c => ({ id: c.id, phone: c.phone_number })));
    if (contacts.length > 0) return contacts[0].id;
  }
  return null;
}

/** Busca contato via search (fallback). */
async function findContactByPhone(base: string, headers: Record<string, string>, phone: string): Promise<number | null> {
  // 1. Tenta filter API (match exato — mais confiável)
  const byFilter = await filterContactByPhone(base, headers, phone);
  if (byFilter) return byFilter;

  // 2. Fallback: search por texto
  const digitsOnly = phone.replace(/\D/g, "");
  const queries = [phone, digitsOnly, digitsOnly.slice(-11)].filter(Boolean);
  for (const q of queries) {
    const res = await fetch(`${base}/contacts/search?q=${encodeURIComponent(q)}&include_contacts=true`, { headers });
    if (!res.ok) continue;
    const json = await res.json();
    const contacts: any[] = json?.payload?.contacts ?? [];
    const match = contacts.find((c) => {
      const p = (c.phone_number ?? "").replace(/\D/g, "");
      return p.slice(-11) === digitsOnly.slice(-11) && p.length > 0;
    });
    if (match) return match.id;
  }
  return null;
}

/** Cria contato no Chatwoot. Se número já existir (422), busca e retorna o ID existente. */
async function createContact(
  base: string,
  headers: Record<string, string>,
  payload: {
    name: string;
    phone_number: string;
    email?: string;
    custom_attributes?: Record<string, unknown>;
  }
): Promise<number | null> {
  const res = await fetch(`${base}/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 422) {
    console.log(`[Chatwoot] createContact 422 — tentando localizar contato existente`);
    return findContactByPhone(base, headers, payload.phone_number);
  }

  if (!res.ok) {
    console.error("[Chatwoot] createContact failed", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return json?.id ?? null;
}

/** Atualiza campos e custom_attributes do contato. */
async function patchContact(
  base: string,
  headers: Record<string, string>,
  contactId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${base}/contacts/${contactId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("[Chatwoot] patchContact failed", res.status, await res.text());
  }
}

/** Cria uma nova conversa proativa. Retorna conv_id ou null. */
async function createConversation(
  base: string,
  headers: Record<string, string>,
  payload: {
    inbox_id: number;
    contact_id: number;
    custom_attributes?: Record<string, unknown>;
  }
): Promise<number | null> {
  const res = await fetch(`${base}/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("[Chatwoot] createConversation failed", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  console.log(`[Chatwoot] createConversation response → id=${json?.id} custom_attributes=`, JSON.stringify(json?.custom_attributes ?? "n/a"));
  return json?.id ?? null;
}

/** Atualiza custom_attributes da conversa (merge parcial). */
async function patchConversation(
  base: string,
  headers: Record<string, string>,
  convId: number,
  payload: Record<string, unknown>
): Promise<void> {
  console.log(`[Chatwoot] patchConversation convId=${convId} payload=`, JSON.stringify(payload));
  const res = await fetch(`${base}/conversations/${convId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[Chatwoot] patchConversation failed", res.status, text);
  }
}

/** Envia mensagem de saída em uma conversa. */
async function sendMessage(
  base: string,
  headers: Record<string, string>,
  convId: number,
  content: string
): Promise<void> {
  const res = await fetch(`${base}/conversations/${convId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, message_type: "outgoing", private: false }),
  });
  if (!res.ok) {
    console.error("[Chatwoot] sendMessage failed", res.status, await res.text());
  }
}

async function sendPrivateNote(
  base: string,
  headers: Record<string, string>,
  convId: number,
  content: string
): Promise<void> {
  const res = await fetch(`${base}/conversations/${convId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, message_type: "outgoing", private: true }),
  });
  if (!res.ok) {
    console.error("[Chatwoot] sendPrivateNote failed", res.status, await res.text());
  }
}

/** Retorna as etiquetas atuais do contato. */
async function getContactLabels(
  base: string,
  headers: Record<string, string>,
  contactId: number
): Promise<string[]> {
  const res = await fetch(`${base}/contacts/${contactId}/labels`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  return json?.payload ?? [];
}

/**
 * Adiciona/remove etiquetas do contato (operação de merge, não replace total).
 * Labels devem existir previamente em Settings → Labels no Chatwoot.
 */
async function updateContactLabels(
  base: string,
  headers: Record<string, string>,
  contactId: number,
  add: string[],
  remove: string[]
): Promise<void> {
  const current = await getContactLabels(base, headers, contactId);
  const merged = [...current.filter(l => !remove.includes(l)), ...add];
  const updated = merged.filter((l, i) => merged.indexOf(l) === i);
  const res = await fetch(`${base}/contacts/${contactId}/labels`, {
    method: "POST",
    headers,
    body: JSON.stringify({ labels: updated }),
  });
  if (!res.ok) {
    console.error("[Chatwoot] updateContactLabels failed", res.status, await res.text());
  } else {
    console.log(`[Chatwoot] updateContactLabels contactId=${contactId} labels=`, JSON.stringify(updated));
  }
}

// ── Orquestradores públicos ───────────────────────────────────────────────────

export class ChatwootService {
  /**
   * Gatilho 1 — Nova estadia criada.
   * Faz upsert do contato no Chatwoot com nome, telefone, e-mail e documento.
   * Persiste o chatwootContactId no registro do hóspede para uso futuro.
   */
  static async syncOnStayCreated(stay: Stay, guest: Guest, property?: Property): Promise<void> {
    const cfg = resolveConfig(property);
    if (!cfg) { console.log("[Chatwoot] disabled — config missing"); return; }
    if (!guest.phone) { console.log("[Chatwoot] syncOnStayCreated: guest has no phone, skipping"); return; }

    const { base, headers } = cfg;
    const phone = formatPhone(guest.phone);
    console.log(`[Chatwoot] syncOnStayCreated → guest=${guest.id} phone=${phone}`);

    let contactId = guest.chatwootContactId ? parseInt(guest.chatwootContactId, 10) : null;

    const contactPayload = {
      name: guest.fullName,
      phone_number: phone,
      ...(guest.email ? { email: guest.email } : {}),
      custom_attributes: {
        documento: guest.document?.number ?? "",
        tipo_documento: guest.document?.type ?? "",
      },
    };

    if (!contactId || isNaN(contactId)) {
      contactId = await findContactByPhone(base, headers, phone);
      console.log(`[Chatwoot] findContactByPhone → ${contactId ?? "not found"}`);
    }

    if (contactId) {
      await patchContact(base, headers, contactId, contactPayload);
      console.log(`[Chatwoot] patchContact OK → contactId=${contactId}`);
    } else {
      contactId = await createContact(base, headers, contactPayload);
      console.log(`[Chatwoot] createContact → ${contactId ?? "failed"}`);
    }

    if (contactId) {
      await supabaseAdmin
        .from("guests")
        .update({ chatwootContactId: String(contactId) })
        .eq("id", guest.id)
        .eq("propertyId", stay.propertyId);
      console.log(`[Chatwoot] chatwootContactId salvo no hóspede`);

      // Etiquetas: tem_reserva (ciclo de reserva) + cliente (permanente)
      await updateContactLabels(base, headers, contactId, ["tem_reserva", "cliente"], []);
    }
  }

  /**
   * Gatilho 2 — 48h antes do check-in.
   * Cria uma conversa proativa com os dados da estadia como ACF.
   * Envia mensagem inicial de pré check-in.
   * Persiste o chatwootConvId na estadia.
   */
  static async syncOn48hTrigger(stay: Stay, guest: Guest, cabin: Cabin, property?: Property): Promise<void> {
    const cfg = resolveConfig(property);
    if (!cfg || !guest.phone) return;
    if (stay.chatwootConvId) { console.log(`[Chatwoot] 48h: conversa já existe (${stay.chatwootConvId}), pulando`); return; }

    const { base, headers, inboxId } = cfg;
    if (!inboxId) { console.error("[Chatwoot] inboxId não configurado"); return; }

    const phone = formatPhone(guest.phone);
    console.log(`[Chatwoot] 48h → guest=${guest.id} phone=${phone} cabin=${cabin.name}`);

    let contactId = guest.chatwootContactId ? parseInt(guest.chatwootContactId, 10) : null;
    if (!contactId || isNaN(contactId)) {
      contactId = await findContactByPhone(base, headers, phone);
    }
    if (!contactId) {
      contactId = await createContact(base, headers, {
        name: guest.fullName,
        phone_number: phone,
        ...(guest.email ? { email: guest.email } : {}),
      });
    }
    console.log(`[Chatwoot] 48h contactId=${contactId}`);
    if (!contactId) return;

    const convAttrs = {
      cabana: cabin.name,
      check_in: formatDate(String(stay.checkIn)),
      check_out: formatDate(String(stay.checkOut)),
      codigo_reserva: stay.accessCode,
      adultos: stay.counts?.adults ?? 0,
      criancas: stay.counts?.children ?? 0,
      bebes: stay.counts?.babies ?? 0,
    };

    // Tenta passar custom_attributes já na criação (mais confiável que PATCH posterior)
    const convId = await createConversation(base, headers, {
      inbox_id: inboxId,
      contact_id: contactId,
      custom_attributes: convAttrs,
    });
    console.log(`[Chatwoot] 48h convId=${convId}`);
    if (!convId) return;

    // Persiste convId na estadia
    await supabaseAdmin.from("stays").update({ chatwootConvId: convId }).eq("id", stay.id);
    console.log(`[Chatwoot] 48h chatwootConvId=${convId} salvo na estadia`);
  }

  /**
   * Gatilho 3 — Troca de cabana.
   * Atualiza o atributo "cabana" na conversa ativa do Chatwoot.
   */
  static async syncOnCabinTransfer(stay: Stay, newCabin: Cabin, property?: Property): Promise<void> {
    const cfg = resolveConfig(property);
    if (!cfg || !stay.chatwootConvId) return;
    const { base, headers } = cfg;
    // Chatwoot v4 não persiste custom_attributes via PATCH /conversations/{id}.
    // Usamos nota privada para registrar a troca de cabana na timeline.
    await sendPrivateNote(base, headers, stay.chatwootConvId,
      `🏡 Acomodação alterada para: *${newCabin.name}*`
    );
  }

  /**
   * Gatilho 4 — Pré check-in concluído.
   * Atualiza os Contact Custom Attributes com os dados do formulário.
   */
  static async syncOnPreCheckinComplete(guest: Guest, stay: Stay, property?: Property): Promise<void> {
    const cfg = resolveConfig(property);
    if (!cfg || !guest.phone) return;
    const { base, headers } = cfg;
    const phone = formatPhone(guest.phone);

    let contactId = guest.chatwootContactId ? parseInt(guest.chatwootContactId, 10) : null;

    if (!contactId || isNaN(contactId)) {
      contactId = await findContactByPhone(base, headers, phone);
    }

    if (!contactId) return;

    await patchContact(base, headers, contactId, {
      custom_attributes: {
        documento: guest.document?.number ?? "",
        tipo_documento: guest.document?.type ?? "",
        data_nascimento: guest.birthDate ?? "",
        nacionalidade: guest.nationality ?? "",
        idioma_preferido: guest.preferredLanguage ?? "pt",
        cidade_origem: guest.address?.city ?? "",
      },
    });

    // Chatwoot v4 não persiste custom_attributes via PATCH. Usa nota privada.
    if (stay.chatwootConvId) {
      await sendPrivateNote(base, headers, stay.chatwootConvId,
        "✅ Pré check-in concluído pelo hóspede."
      );
    }
  }

  /**
   * Gatilho 5 — Reserva cancelada.
   * Remove "tem_reserva" do contato apenas se não houver outras reservas pendentes.
   * A verificação é feita pelo caller (server action) que passa hasOtherPending.
   */
  static async syncOnCancelled(stay: Stay, guest: Guest, hasOtherPending: boolean, property?: Property): Promise<void> {
    const cfg = resolveConfig(property);
    if (!cfg || !guest.phone) return;
    if (hasOtherPending) return; // mantém a tag se há outras reservas ativas

    const { base, headers } = cfg;

    let contactId = guest.chatwootContactId ? parseInt(guest.chatwootContactId, 10) : null;
    if (!contactId || isNaN(contactId)) {
      const phone = formatPhone(guest.phone);
      contactId = await findContactByPhone(base, headers, phone);
    }
    if (!contactId) return;

    await updateContactLabels(base, headers, contactId, [], ["tem_reserva"]);
    console.log(`[Chatwoot] syncOnCancelled contactId=${contactId} → -tem_reserva`);
  }

  /**
   * Gatilho 6 — Check-in realizado.
   * Remove etiqueta "tem_reserva" e adiciona "hospede" no contato.
   */
  static async syncOnCheckIn(stay: Stay, guest: Guest, property?: Property): Promise<void> {
    const cfg = resolveConfig(property);
    if (!cfg || !guest.phone) return;
    const { base, headers } = cfg;

    let contactId = guest.chatwootContactId ? parseInt(guest.chatwootContactId, 10) : null;
    if (!contactId || isNaN(contactId)) {
      const phone = formatPhone(guest.phone);
      contactId = await findContactByPhone(base, headers, phone);
    }
    if (!contactId) return;

    await updateContactLabels(base, headers, contactId, ["hospede"], ["tem_reserva"]);
    console.log(`[Chatwoot] syncOnCheckIn contactId=${contactId} → +hospede -tem_reserva`);
  }

  /**
   * Gatilho 6 — Check-out realizado.
   * Remove etiqueta "hospede" do contato.
   */
  static async syncOnCheckOut(stay: Stay, guest: Guest, property?: Property): Promise<void> {
    const cfg = resolveConfig(property);
    if (!cfg || !guest.phone) return;
    const { base, headers } = cfg;

    let contactId = guest.chatwootContactId ? parseInt(guest.chatwootContactId, 10) : null;
    if (!contactId || isNaN(contactId)) {
      const phone = formatPhone(guest.phone);
      contactId = await findContactByPhone(base, headers, phone);
    }
    if (!contactId) return;

    await updateContactLabels(base, headers, contactId, [], ["hospede"]);
    console.log(`[Chatwoot] syncOnCheckOut contactId=${contactId} → -hospede`);
  }
}
