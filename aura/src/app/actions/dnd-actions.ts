'use server';

import { supabaseAdmin } from "@/lib/supabase";

/**
 * Toggle Do Not Disturb for a guest stay.
 * @param stayId - The stay to update
 * @param accessCode - Used to validate ownership (must match stay.accessCode)
 * @param durationHours - null to disable DND; positive number to enable for N hours
 * @returns { success: boolean; dnd_until?: string | null }
 */
export async function toggleGuestDND(
  stayId: string,
  accessCode: string,
  durationHours: number | null
): Promise<{ success: boolean; dnd_until?: string | null; error?: string }> {
  // 1. Fetch stay and validate ownership via accessCode
  const { data: stay, error: stayError } = await supabaseAdmin
    .from('stays')
    .select('id, propertyId, cabinId, accessCode, checkOut, dnd_enabled, dnd_until, guestId')
    .eq('id', stayId)
    .eq('accessCode', accessCode)
    .eq('status', 'active')
    .single();

  if (stayError || !stay) {
    return { success: false, error: 'Stay not found or access denied.' };
  }

  // 2. DISABLE DND
  if (durationHours === null) {
    // Restore 'paused' housekeeping tasks to 'pending'
    await supabaseAdmin
      .from('housekeeping_tasks')
      .update({ status: 'pending', paused_until: null, updatedAt: new Date().toISOString() })
      .eq('propertyId', stay.propertyId)
      .eq('stayId', stayId)
      .eq('status', 'paused');

    // Restore 'paused' maintenance tasks to their previousStatus
    if (stay.cabinId) {
      const { data: pausedMT } = await supabaseAdmin
        .from('maintenance_tasks')
        .select('id, previousStatus')
        .eq('propertyId', stay.propertyId)
        .eq('cabinId', stay.cabinId)
        .eq('status', 'paused');

      if (pausedMT?.length) {
        for (const task of pausedMT) {
          await supabaseAdmin
            .from('maintenance_tasks')
            .update({
              status: task.previousStatus || 'pending',
              pausedUntil: null,
              previousStatus: null,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', task.id);
        }
      }
    }

    await supabaseAdmin
      .from('stays')
      .update({ dnd_enabled: false, dnd_until: null })
      .eq('id', stayId);

    return { success: true, dnd_until: null };
  }

  // 3. ENABLE DND
  // Fetch guest name for denormalization
  let guestFullName: string | undefined;
  if (stay.guestId) {
    const { data: guest } = await supabaseAdmin
      .from('guests')
      .select('fullName')
      .eq('id', stay.guestId)
      .single();
    guestFullName = guest?.fullName ?? undefined;
  }

  const now = new Date();
  const resumeAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  // Fetch property settings for govEndTime
  const { data: property } = await supabaseAdmin
    .from('properties')
    .select('settings')
    .eq('id', stay.propertyId)
    .single();

  const govEndTime: string = (property?.settings as any)?.govEndTime ?? '17:00';
  const [endH, endM] = govEndTime.split(':').map(Number);

  const todayGovEnd = new Date();
  todayGovEnd.setHours(endH, endM, 0, 0);

  const taskStatus = resumeAt >= todayGovEnd ? 'skipped' : 'paused';

  // Update stay DND fields
  await supabaseAdmin
    .from('stays')
    .update({ dnd_enabled: true, dnd_until: resumeAt.toISOString() })
    .eq('id', stayId);

  // Find today's pending/in_progress daily task for this stay
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todayTasks } = await supabaseAdmin
    .from('housekeeping_tasks')
    .select('id, status')
    .eq('propertyId', stay.propertyId)
    .eq('stayId', stayId)
    .eq('type', 'daily')
    .gte('createdAt', todayStart.toISOString())
    .in('status', ['pending', 'in_progress']);

  if (todayTasks && todayTasks.length > 0) {
    const updatePayload: Record<string, unknown> = {
      status: taskStatus,
      paused_until: taskStatus === 'paused' ? resumeAt.toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    if (taskStatus === 'skipped') {
      updatePayload.skippedAt = now.toISOString();
      if (guestFullName) updatePayload.guestName = guestFullName;
    }
    await supabaseAdmin
      .from('housekeeping_tasks')
      .update(updatePayload)
      .in('id', todayTasks.map(t => t.id));
  }

  // Pause active maintenance tasks for this cabin
  if (stay.cabinId) {
    const { data: mtTasks } = await supabaseAdmin
      .from('maintenance_tasks')
      .select('id, status')
      .eq('propertyId', stay.propertyId)
      .eq('cabinId', stay.cabinId)
      .in('status', ['pending', 'in_progress']);

    if (mtTasks?.length) {
      for (const task of mtTasks) {
        await supabaseAdmin
          .from('maintenance_tasks')
          .update({
            status: 'paused',
            pausedUntil: resumeAt.toISOString(),
            previousStatus: task.status,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', task.id);
      }
    }
  }

  return { success: true, dnd_until: resumeAt.toISOString() };
}
