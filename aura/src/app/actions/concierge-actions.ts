'use server';

import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "@/services/audit-service";
import { ConciergeService } from "@/services/concierge-service";
import { ConciergeItem } from "@/types/aura";

/**
 * Submit a concierge request from the guest portal.
 * Validates stay ownership via accessCode before inserting.
 */
export async function submitConciergeRequest(
  stayId: string,
  accessCode: string,
  itemId: string,
  quantity: number,
  notes?: string
): Promise<{ success: boolean; dndActive?: boolean; error?: string }> {
  // 1. Validate stay
  const { data: stay, error: stayError } = await supabaseAdmin
    .from('stays')
    .select('id, propertyId, cabinId, accessCode, status, dnd_enabled')
    .eq('id', stayId)
    .eq('accessCode', accessCode)
    .eq('status', 'active')
    .single();

  if (stayError || !stay) {
    return { success: false, error: 'Estadia não encontrada ou acesso negado.' };
  }

  // 2. DND check
  if (stay.dnd_enabled) {
    return { success: false, dndActive: true };
  }

  // 2.5. Disponibilidade: item de consumo com ficha técnica não pode ser pedido sem estoque.
  const { data: itemRow } = await supabaseAdmin
    .from('concierge_items').select('*').eq('id', itemId).single();
  if (itemRow) {
    try {
      await ConciergeService._assertAvailable(stay.propertyId, itemRow as ConciergeItem, quantity);
    } catch {
      return { success: false, error: 'Item indisponível no momento (sem estoque).' };
    }
  }

  // 3. Check for existing pending request for the same item (idempotency guard)
  const { data: existingRequest } = await supabaseAdmin
    .from('concierge_requests')
    .select('id')
    .eq('stayId', stayId)
    .eq('itemId', itemId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingRequest) {
    return { success: true };
  }

  // 4. Insert request
  const now = new Date().toISOString();
  const { error: insertError } = await supabaseAdmin
    .from('concierge_requests')
    .insert({
      id: crypto.randomUUID(),
      propertyId: stay.propertyId,
      stayId,
      cabinId: stay.cabinId || null,
      itemId,
      quantity,
      status: 'pending',
      notes: notes || null,
      createdAt: now,
      updatedAt: now,
    });

  if (insertError) {
    return { success: false, error: 'Erro ao criar pedido.' };
  }

  await AuditService.log({
    propertyId: stay.propertyId,
    userId: stayId,
    userName: "Hóspede",
    action: "CONCIERGE_REQUESTED",
    entity: "CONCIERGE",
    entityId: crypto.randomUUID(),
    details: `Pedido de concierge enviado pelo hóspede via portal. Item: ${itemId}. Quantidade: ${quantity}.`
  });

  return { success: true };
}
