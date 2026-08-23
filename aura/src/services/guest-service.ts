import { db } from "@/lib/supabase";
import { Guest } from "@/types/aura";
import { postFieldAction } from "@/lib/field-api";
import { AuditService } from "./audit-service";
import { hasValidDocument, normalizeDocument } from "@/lib/guest-doc";

export const GuestService = {
  normalizeDocument(docStr: string): string {
    return normalizeDocument(docStr);
  },

  /**
   * Toda tabela que guarda um `guestId`. Não existe FK para `guests` no banco
   * (113 FKs no schema, nenhuma aponta para cá): quem troca o id da ficha precisa
   * repontuar esta lista na mão, ou sobram linhas apontando para ficha inexistente.
   */
  GUEST_REF_TABLES: ['stays', 'contacts', 'structure_bookings', 'structure_reviews', 'survey_responses', 'rate_quotes'] as const,

  /** Move todas as referências de uma ficha para outra. Server-side. */
  async _repointGuestRefs(fromId: string, toId: string): Promise<Record<string, number>> {
    const moved: Record<string, number> = {};
    // Sequencial de propósito: se uma tabela falhar, as anteriores já migraram e o
    // erro sobe antes do delete da ficha — sobra duplicata, nunca órfã.
    for (const table of this.GUEST_REF_TABLES) {
      const { data, error } = await db().from(table).update({ guestId: toId }).eq('guestId', fromId).select('id');
      if (error) throw new Error(`Falha ao migrar ${table}: ${error.message}`);
      if (data?.length) moved[table] = data.length;
    }
    return moved;
  },

  async findByDocument(propertyId: string, docNumber: string): Promise<Guest | null> {
    const id = this.normalizeDocument(docNumber);
    if (!id) return null;

    const { data, error } = await db()
      .from('guests')
      .select('*')
      .eq('id', id)
      .eq('propertyId', propertyId)
      .single();

    if (error || !data) return null;
    return data as Guest;
  },

  /**
   * Hóspedes com este telefone — sugestão de vínculo no CRM. Casa pelo SUFIXO
   * (últimos 8 dígitos): o banco guarda só dígitos, mas com/sem DDI conforme a
   * época do cadastro (5531 9xxxx vs 31 9xxxx).
   */
  async findByPhone(propertyId: string, phone: string): Promise<Guest[]> {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length < 8) return [];

    const { data } = await db()
      .from('guests')
      .select('*')
      .eq('propertyId', propertyId)
      .like('phone', `%${digits.slice(-8)}`)
      .limit(5);
    return (data || []) as Guest[];
  },

  /**
   * Grava/atualiza a ficha do hóspede.
   *
   * No BROWSER delega para /api/admin/guests/upsert. Escrever direto pelo client do browser
   * passa pelo lock de auth e, no lock frio, a promise nunca resolve — é o mesmo travamento do
   * spinner de CPF, só que no "Confirmar Reserva", com a reserva já meio criada. No SERVIDOR
   * (a própria rota) roda `upsertGuestDirect` com service-role.
   */
  async upsertGuest(propertyId: string, guestData: Omit<Guest, "updatedAt">, actorId?: string, actorName?: string): Promise<string> {
    if (typeof window === 'undefined') {
      return this.upsertGuestDirect(propertyId, guestData, actorId, actorName);
    }

    const res = await postFieldAction('/api/admin/guests/upsert', { propertyId, guestData });
    if (!res.ok || !res.data?.id) {
      throw new Error(res.error || "Falha ao salvar a ficha do hóspede. Tente novamente.");
    }
    return res.data.id as string;
  },

  /** Implementação real — só server-side (chamada pela rota). */
  async upsertGuestDirect(propertyId: string, guestData: Omit<Guest, "updatedAt">, actorId?: string, actorName?: string): Promise<string> {
    const id = this.normalizeDocument(guestData.id);

    const payload = {
      ...guestData,
      id,
      propertyId,
      fullName: guestData.fullName?.trim().toUpperCase() ?? guestData.fullName,
      // Armazena telefone sempre como só dígitos (sem +, espaços ou traços)
      phone: guestData.phone ? guestData.phone.replace(/\D/g, '') : guestData.phone,
      updatedAt: new Date().toISOString()
    };

    const { data: existing } = await db()
      .from('guests')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await db()
      .from('guests')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Error upserting guest:", error);
      throw error;
    }

    await AuditService.log({
      propertyId,
      userId: actorId || id,
      userName: actorName || payload.fullName || id,
      action: existing ? "UPDATE" : "CREATE",
      entity: "GUEST",
      entityId: id,
      details: existing
        ? `Ficha do hóspede ${payload.fullName ?? id} atualizada.`
        : `Hóspede ${payload.fullName ?? id} criado.`
    });

    // A ficha pode ter acabado de ganhar documento estando num id provisório
    // (FNRH, edição da ficha, modal da estadia). O id acompanha o documento.
    return this.promoteGuestId(propertyId, id, actorId, actorName);
  },

  async listGuests(propertyId: string, search?: string): Promise<Guest[]> {
    const params = new URLSearchParams({ propertyId });
    if (search?.trim()) params.set('search', search.trim());
    try {
      const res = await fetch(`/api/admin/guests?${params}`);
      // Lista vazia e "sem permissão" davam a MESMA tela ("nenhum hóspede cadastrado"):
      // um 403 por cargo faltando na rota ficou invisível. Ao menos deixa rastro.
      if (!res.ok) {
        console.error(`[listGuests] ${res.status} ao buscar hóspedes`, await res.text().catch(() => ''));
        return [];
      }
      return res.json();
    } catch (e) {
      console.error('[listGuests] falha de rede', e);
      return [];
    }
  },

  /**
   * Histórico de estadias da ficha. No BROWSER vai pela rota (service-role): pelo client
   * a leitura depende da RLS de `stays`/`cabins` e voltava vazia — o histórico parecia
   * inexistente em vez de bloqueado.
   */
  async getGuestStays(propertyId: string, guestId: string): Promise<any[]> {
    if (typeof window === 'undefined') {
      return this.getGuestStaysDirect(propertyId, guestId);
    }

    const qs = new URLSearchParams({ propertyId, guestId });
    try {
      const res = await fetch(`/api/admin/guests/stays?${qs}`);
      if (!res.ok) {
        console.error(`[getGuestStays] ${res.status}`, await res.text().catch(() => ''));
        return [];
      }
      const json = await res.json();
      return json?.stays ?? [];
    } catch (e) {
      console.error('[getGuestStays] falha de rede', e);
      return [];
    }
  },

  /** Implementação real — só server-side (chamada pela rota). */
  async getGuestStaysDirect(propertyId: string, guestId: string): Promise<any[]> {
    const { data, error } = await db()
      .from('stays')
      .select('id, checkIn, checkOut, status, cabinId')
      .eq('propertyId', propertyId)
      .eq('guestId', guestId)
      .order('checkIn', { ascending: false });

    if (error) throw error;
    if (!data?.length) return [];

    // Uma query para todas as cabanas (antes era um SELECT por estadia).
    const cabinIds = Array.from(new Set(data.map((s: any) => s.cabinId).filter(Boolean)));
    const names = new Map<string, string>();
    if (cabinIds.length) {
      const { data: cabins } = await db().from('cabins').select('id, name').in('id', cabinIds);
      for (const c of cabins ?? []) names.set(c.id as string, c.name as string);
    }

    return data.map((stay: any) => ({ ...stay, cabinName: names.get(stay.cabinId) ?? 'N/A' }));
  },

  /**
   * Unifica dois cadastros. Operação destrutiva (apaga a ficha secundária) e escrita
   * cruzando duas tabelas — no browser vai pela rota, que roda com service-role e
   * carimba a autoria pela sessão.
   */
  async mergeGuests(
    propertyId: string,
    primaryId: string,
    secondaryId: string,
    actorId: string,
    actorName: string
  ): Promise<number> {
    if (typeof window === 'undefined') {
      return this.mergeGuestsDirect(propertyId, primaryId, secondaryId, actorId, actorName);
    }

    const res = await postFieldAction('/api/admin/guests/merge', { propertyId, primaryId, secondaryId });
    if (!res.ok) throw new Error(res.error || 'Falha ao unificar os cadastros.');
    return (res.data?.stayCount as number) ?? 0;
  },

  /** Implementação real — só server-side (chamada pela rota). */
  async mergeGuestsDirect(
    propertyId: string,
    primaryId: string,
    secondaryId: string,
    actorId: string,
    actorName: string
  ): Promise<number> {
    if (!primaryId || !secondaryId || primaryId === secondaryId) {
      throw new Error('Cadastros inválidos para unificação.');
    }

    // A ficha que fica precisa existir NESTA propriedade: sem isso, um id errado
    // transferiria as estadias para o vazio e ainda assim apagaria a secundária.
    const { data: primary } = await db()
      .from('guests').select('id, fullName').eq('id', primaryId).eq('propertyId', propertyId).maybeSingle();
    if (!primary) throw new Error('Cadastro principal não encontrado nesta propriedade.');

    // Nome da secundária antes do delete — depois não existe mais para consultar.
    const { data: secondary } = await db()
      .from('guests').select('fullName').eq('id', secondaryId).eq('propertyId', propertyId).maybeSingle();

    const { data: stays, error: staysErr } = await db()
      .from('stays')
      .select('id')
      .eq('propertyId', propertyId)
      .eq('guestId', secondaryId);
    if (staysErr) throw staysErr;

    const stayCount = stays?.length ?? 0;

    // Antes daqui só as estadias eram movidas — contatos, reservas de estrutura,
    // pesquisas e orçamentos ficavam apontando para a ficha recém-apagada.
    // Falha aqui NÃO pode seguir para o delete: apagaria a ficha deixando órfãos.
    const moved = await this._repointGuestRefs(secondaryId, primaryId);

    const { error: delErr } = await db()
      .from('guests')
      .delete()
      .eq('id', secondaryId)
      .eq('propertyId', propertyId);
    if (delErr) throw delErr;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: "UPDATE", entity: "GUEST", entityId: primaryId,
      details: `Cadastros unificados: ${secondary?.fullName ?? secondaryId} → ${(primary as { fullName?: string }).fullName ?? primaryId}. ${stayCount} estadia(s) transferida(s).${
        Object.keys(moved).filter(t => t !== 'stays').length
          ? ` Também migrado: ${Object.entries(moved).filter(([t]) => t !== 'stays').map(([t, n]) => `${n} ${t}`).join(', ')}.`
          : ''
      }`
    });

    return stayCount;
  },

  /**
   * Campos preenchidos na ficha secundária que estão vazios na principal.
   * Nunca sobrescreve dado existente e nunca mexe em id/documento/propriedade.
   */
  _mergeBlankFields(primary: Record<string, any>, secondary: Record<string, any>): Record<string, any> {
    const isBlank = (v: any): boolean => {
      if (v === null || v === undefined) return true;
      if (typeof v === 'string') return !v.trim();
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === 'object') return Object.values(v).every(isBlank);
      return false;
    };
    const KEEP = new Set(['id', 'propertyId', 'document', 'createdAt', 'updatedAt']);
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(secondary)) {
      if (KEEP.has(k)) continue;
      if (!isBlank(v) && isBlank(primary[k])) patch[k] = v;
    }
    return patch;
  },

  /**
   * Promove uma ficha de id provisório para o documento que ela agora tem.
   *
   * `guests.id` É o documento normalizado. Quando a recepção abre a reserva sem CPF,
   * a ficha nasce com `GUEST-<timestamp>`; se o documento chegava depois (pré-check-in,
   * FNRH, edição da ficha), só a coluna `document` era gravada e o id continuava
   * provisório para sempre. Foi assim que 54 fichas ficaram penduradas, três delas
   * duplicando um cadastro que já existia com o CPF.
   *
   * Cria a ficha definitiva (ou reaproveita a que já existe com esse documento),
   * move as referências e só então apaga a provisória — nessa ordem, para nunca
   * existir linha apontando para ficha inexistente.
   *
   * Devolve o id final; devolve o de entrada quando não há nada a promover. Nunca
   * levanta exceção: é um acerto de bastidor, não pode derrubar o salvamento que a
   * disparou.
   */
  async promoteGuestId(propertyId: string, currentId: string, actorId?: string, actorName?: string): Promise<string> {
    if (!currentId || !currentId.toUpperCase().startsWith('GUEST')) return currentId;

    try {
      const { data: temp } = await db().from('guests').select('*').eq('id', currentId).maybeSingle();
      if (!temp || temp.propertyId !== propertyId) return currentId;
      if (!hasValidDocument(temp.document)) return currentId;

      const newId = normalizeDocument(temp.document?.number);
      if (!newId || newId === currentId) return currentId;

      // Sem filtro de propriedade: `guests.id` é chave primária global, então um
      // documento já usado em OUTRA propriedade faria o insert estourar. Melhor sair.
      const { data: target } = await db().from('guests').select('*').eq('id', newId).maybeSingle();
      if (target && target.propertyId !== propertyId) {
        console.error(`[promoteGuestId] ${newId} já existe em outra propriedade — ficha ${currentId} mantida.`);
        return currentId;
      }

      if (target) {
        const patch = this._mergeBlankFields(target, temp);
        if (Object.keys(patch).length > 0) {
          await db().from('guests').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', newId);
        }
      } else {
        const { error } = await db()
          .from('guests')
          .insert({ ...temp, id: newId, updatedAt: new Date().toISOString() });
        if (error) throw error;
      }

      const moved = await this._repointGuestRefs(currentId, newId);
      const { error: delErr } = await db().from('guests').delete().eq('id', currentId);
      if (delErr) throw delErr;

      const refs = Object.entries(moved).map(([t, n]) => `${n} ${t}`).join(', ') || 'nenhuma referência';
      await AuditService.log({
        propertyId,
        userId: actorId || newId,
        userName: actorName || temp.fullName || newId,
        action: 'UPDATE',
        entity: 'GUEST',
        entityId: newId,
        details: target
          ? `Ficha provisória ${currentId} unificada na ficha ${newId} (documento informado depois da reserva). Migrado: ${refs}.`
          : `Ficha ${temp.fullName ?? currentId} passou do id provisório ${currentId} para o documento ${newId}. Migrado: ${refs}.`,
      });

      return newId;
    } catch (e) {
      console.error(`[promoteGuestId] falha ao promover ${currentId}:`, e);
      return currentId;
    }
  },
};