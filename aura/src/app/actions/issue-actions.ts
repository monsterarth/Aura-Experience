'use server';

import { supabaseAdmin } from "@/lib/supabase";
import { toggleGuestDND } from "./dnd-actions";

/**
 * Report a problem inside the guest's cabin.
 * Creates a maintenance_tasks record and optionally disables DND.
 */
export async function reportCabinIssue(
  stayId: string,
  accessCode: string,
  description: string,
  canEnterNow: boolean,
  imageUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: stay, error: stayError } = await supabaseAdmin
    .from('stays')
    .select('id, propertyId, cabinId, accessCode, dnd_enabled')
    .eq('id', stayId)
    .eq('accessCode', accessCode)
    .eq('status', 'active')
    .single();

  if (stayError || !stay) {
    return { success: false, error: 'Stay not found or access denied.' };
  }

  const { error: insertError } = await supabaseAdmin
    .from('maintenance_tasks')
    .insert({
      propertyId: stay.propertyId,
      cabinId: stay.cabinId,
      stayId: stay.id,
      title: 'Problema relatado pelo hóspede',
      description,
      priority: 'medium',
      status: 'pending',
      checklist: [],
      assignedTo: [],
      isRecurring: false,
      completion: imageUrl ? { resolved: false, needsCleaning: false, photoUrl: imageUrl } : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // If guest allows entry and DND is active, disable DND
  if (canEnterNow && stay.dnd_enabled) {
    await toggleGuestDND(stayId, accessCode, null);
  }

  return { success: true };
}

/**
 * Report a problem in a common area / structure.
 * Creates a maintenance_tasks record linked to the structure.
 */
export async function reportStructureIssue(
  stayId: string,
  accessCode: string,
  structureId: string,
  description: string,
  imageUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: stay, error: stayError } = await supabaseAdmin
    .from('stays')
    .select('id, propertyId, accessCode')
    .eq('id', stayId)
    .eq('accessCode', accessCode)
    .eq('status', 'active')
    .single();

  if (stayError || !stay) {
    return { success: false, error: 'Stay not found or access denied.' };
  }

  const { error: insertError } = await supabaseAdmin
    .from('maintenance_tasks')
    .insert({
      propertyId: stay.propertyId,
      structureId,
      stayId: stay.id,
      title: 'Problema em área comum',
      description,
      priority: 'medium',
      status: 'pending',
      checklist: [],
      assignedTo: [],
      isRecurring: false,
      completion: imageUrl ? { resolved: false, needsCleaning: false, photoUrl: imageUrl } : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true };
}

/**
 * Report an app / IT bug from the guest portal.
 * Inserts into system_bugs table.
 */
export async function reportAppBug(
  stayId: string,
  accessCode: string,
  description: string,
  browserInfo?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: stay, error: stayError } = await supabaseAdmin
    .from('stays')
    .select('id, propertyId, accessCode')
    .eq('id', stayId)
    .eq('accessCode', accessCode)
    .eq('status', 'active')
    .single();

  if (stayError || !stay) {
    return { success: false, error: 'Stay not found or access denied.' };
  }

  const { error: insertError } = await supabaseAdmin
    .from('system_bugs')
    .insert({
      stayId: stay.id,
      propertyId: stay.propertyId,
      description,
      browser_info: browserInfo,
      status: 'open',
      createdAt: new Date().toISOString(),
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true };
}
