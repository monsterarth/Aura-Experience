import { supabase } from "@/lib/supabase";
import { Cabin, CabinCategory } from "@/types/aura";
import { AuditService } from "./audit-service";

// Funções para conversão entre o banco real e a interface
function deserializeCabin(row: any): Cabin {
  return {
    ...row,
    createdAt: row.createdAt ? { seconds: new Date(row.createdAt).getTime() / 1000 } : undefined,
    updatedAt: row.updatedAt ? { seconds: new Date(row.updatedAt).getTime() / 1000 } : undefined,
  } as Cabin;
}

export const CabinService = {

  // ── Categorias (entidade canônica) ─────────────────────────────────────────

  async getCategories(propertyId: string): Promise<CabinCategory[]> {
    const [{ data: cats }, { data: cabins }] = await Promise.all([
      supabase.from('cabin_categories').select('*').eq('propertyId', propertyId).order('order'),
      supabase.from('cabins').select('categoryId').eq('propertyId', propertyId),
    ]);

    const counts = new Map<string, number>();
    for (const c of (cabins || []) as { categoryId: string | null }[]) {
      if (c.categoryId) counts.set(c.categoryId, (counts.get(c.categoryId) || 0) + 1);
    }
    return ((cats || []) as CabinCategory[]).map(c => ({ ...c, cabinCount: counts.get(c.id) || 0 }));
  },

  async saveCategory(
    propertyId: string,
    category: Partial<CabinCategory> & { name: string },
  ): Promise<string> {
    const name = category.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new Error("O nome da categoria é obrigatório.");

    // Unicidade por propriedade, ignorando caixa — é o que impedia "Jardim 2
    // Dormitórios" de coexistir com "Jardim - 2 Dormitórios".
    const { data: clash } = await supabase
      .from('cabin_categories')
      .select('id, name')
      .eq('propertyId', propertyId)
      .ilike('name', name)
      .maybeSingle();
    if (clash && clash.id !== category.id) {
      throw new Error(`Já existe a categoria "${clash.name}" nesta propriedade.`);
    }

    const id = category.id || crypto.randomUUID();
    const { error } = await supabase.from('cabin_categories').upsert({
      id,
      propertyId,
      name,
      shortName: category.shortName?.trim() || null,
      siteUrl: category.siteUrl?.trim() || null,
      order: category.order ?? 0,
      updatedAt: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;

    // Categoria renomeada → cabanas carregam o nome desnormalizado e o `name`
    // derivado ("01 - Categoria"), então precisam ser reescritas.
    if (category.id) await this.syncCabinsOfCategory(propertyId, id, name);

    return id;
  },

  /** Reescreve `category` e `name` das cabanas de uma categoria (após rename). */
  async syncCabinsOfCategory(propertyId: string, categoryId: string, categoryName: string): Promise<void> {
    const { data } = await supabase
      .from('cabins')
      .select('id, number')
      .eq('propertyId', propertyId)
      .eq('categoryId', categoryId);

    for (const c of (data || []) as { id: string; number: string }[]) {
      await supabase
        .from('cabins')
        .update({ category: categoryName, name: `${c.number} - ${categoryName}`, updatedAt: new Date().toISOString() })
        .eq('id', c.id);
    }
  },

  async deleteCategory(propertyId: string, categoryId: string): Promise<void> {
    const { count } = await supabase
      .from('cabins')
      .select('id', { count: 'exact', head: true })
      .eq('propertyId', propertyId)
      .eq('categoryId', categoryId);
    if ((count ?? 0) > 0) {
      throw new Error(`Categoria em uso por ${count} cabana(s). Mova-as antes de excluir.`);
    }
    const { error } = await supabase
      .from('cabin_categories')
      .delete()
      .eq('id', categoryId)
      .eq('propertyId', propertyId);
    if (error) throw error;
  },

  // ── Cabanas ────────────────────────────────────────────────────────────────

  async getCabinsByProperty(propertyId: string): Promise<Cabin[]> {
    const { data, error } = await supabase
      .from('cabins')
      .select('*')
      .eq('propertyId', propertyId)
      .order('number', { ascending: true });

    if (error) {
      console.error("Error fetching cabins from Supabase:", error);
      throw error;
    }

    return (data || []).map(deserializeCabin);
  },

  async saveCabin(propertyId: string, cabin: Partial<Cabin>) {
    // Generate an ID if it's a new cabin (since we're dropping Firestore's auto-gen)
    const id = cabin.id || crypto.randomUUID();

    // A categoria vem por id; o nome é lido da entidade (nunca digitado aqui).
    const categoryName = await this.resolveCategoryName(propertyId, cabin);

    // Força a regra do nome: "Número - Categoria"
    const finalName = `${cabin.number} - ${categoryName}`;

    const payload = {
      ...cabin,
      id,
      category: categoryName,
      name: finalName,
      propertyId,
      updatedAt: new Date().toISOString()
    };

    // Removemos os timestamps do js pra n causar conflito 
    // com as timestamps the fato do banco
    if (!cabin.id) {
      (payload as any).createdAt = new Date().toISOString();
    } else {
      delete (payload as any).createdAt;
    }

    const { error } = await supabase
      .from('cabins')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Error saving cabin to Supabase:", error);
      throw error;
    }

    await AuditService.log({
      propertyId,
      userId: "SYSTEM",
      userName: "Admin",
      action: cabin.id ? "CABIN_UPDATED" : "CABIN_CREATED",
      entity: "CABIN",
      entityId: id,
      details: cabin.id
        ? `Cabana ${finalName} (${id}) atualizada.`
        : `Cabana ${finalName} (${id}) criada.`
    });

    return id;
  },

  // Atualiza apenas o mapPin da cabana — usado pelo CMS do Mapa do Resort.
  // Usa UPDATE direto para não acionar as validações de campos NOT NULL do upsert.
  async updateCabinMapPin(
    propertyId: string,
    cabinId: string,
    mapPin: Cabin['mapPin'],
  ): Promise<void> {
    const { error } = await supabase
      .from('cabins')
      .update({ mapPin, updatedAt: new Date().toISOString() })
      .eq('id', cabinId)
      .eq('propertyId', propertyId);

    if (error) throw error;
  },

  async deleteCabin(propertyId: string, cabinId: string) {
    const { data: cabin } = await supabase
      .from('cabins')
      .select('name')
      .eq('id', cabinId)
      .maybeSingle();

    const { error } = await supabase
      .from('cabins')
      .delete()
      .eq('id', cabinId)
      .eq('propertyId', propertyId);

    if (error) {
      console.error("Error deleting cabin from Supabase:", error);
      throw error;
    }

    await AuditService.log({
      propertyId,
      userId: "SYSTEM",
      userName: "Admin",
      action: "CABIN_DELETED",
      entity: "CABIN",
      entityId: cabinId,
      details: `Cabana ${cabin?.name ?? cabinId} excluída.`
    });
  },

  /**
   * Nome da categoria a gravar na cabana. Prioriza `categoryId` (fonte da
   * verdade); só cai no texto solto para linhas legadas ainda sem vínculo.
   */
  async resolveCategoryName(propertyId: string, cabin: Partial<Cabin>): Promise<string> {
    if (cabin.categoryId) {
      const { data } = await supabase
        .from('cabin_categories')
        .select('name')
        .eq('id', cabin.categoryId)
        .eq('propertyId', propertyId)
        .maybeSingle();
      if (data?.name) return data.name as string;
      throw new Error("Categoria não encontrada nesta propriedade.");
    }
    if (cabin.category?.trim()) return cabin.category.trim();
    throw new Error("Selecione a categoria da unidade.");
  },

  async saveCabinsBatch(propertyId: string, baseCabin: Partial<Cabin>, numbers: string[]) {
    const categoryName = await this.resolveCategoryName(propertyId, baseCabin);

    const payloads = numbers.map(num => {
      const id = crypto.randomUUID();
      const finalName = `${num} - ${categoryName}`;
      return {
        ...baseCabin,
        id,
        number: num,
        category: categoryName,
        name: finalName,
        propertyId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('cabins')
      .insert(payloads);

    if (error) {
      console.error("Error saving cabins batch to Supabase:", error);
      throw error;
    }

    await AuditService.log({
      propertyId,
      userId: "SYSTEM",
      userName: "Admin",
      action: "CABIN_CREATED",
      entity: "CABIN",
      entityId: propertyId,
      details: `${payloads.length} cabana(s) criada(s) em lote: ${numbers.join(', ')}.`
    });

    return payloads.map(p => p.id);
  }
};