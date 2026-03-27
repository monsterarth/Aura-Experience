import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AutomationService } from "@/services/automation-service";

export const dynamic = 'force-dynamic';

function getStatusFilter(audience: string): string[] {
  if (audience === 'active') return ['active'];
  if (audience === 'future') return ['pending', 'pre_checkin_done'];
  if (audience === 'past') return ['finished'];
  return [];
}

export async function POST(request: Request) {
  try {
    const { propertyId, audience, pastDays = 3, body, messengerName, scheduledFor } = await request.json();

    if (!propertyId || !audience || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const statusFilter = getStatusFilter(audience);
    if (!statusFilter.length) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });
    }

    // 1. Fetch stays
    let stayQuery = supabaseAdmin
      .from('stays')
      .select('*')
      .eq('propertyId', propertyId)
      .in('status', statusFilter);

    if (audience === 'past') {
      const since = new Date();
      since.setDate(since.getDate() - pastDays);
      stayQuery = stayQuery.gte('checkOut', since.toISOString().split('T')[0]);
    }

    const { data: stays, error: stayError } = await stayQuery;
    if (stayError) throw stayError;
    if (!stays || stays.length === 0) {
      return NextResponse.json({ queued: 0, skipped: 0 });
    }

    // 2. Fetch all unique guests and cabins in parallel
    const guestIds = [...new Set(stays.map((s: any) => s.guestId))];
    const cabinIds = [...new Set(stays.map((s: any) => s.cabinId).filter(Boolean))];

    const [{ data: guests }, { data: cabins }] = await Promise.all([
      supabaseAdmin.from('guests').select('*').in('id', guestIds),
      supabaseAdmin.from('cabins').select('*').in('id', cabinIds),
    ]);

    const guestMap = new Map((guests || []).map((g: any) => [g.id, g]));
    const cabinMap = new Map((cabins || []).map((c: any) => [c.id, c]));

    // 3. Build messages with jitter-distributed scheduledFor
    let cursor = scheduledFor ? new Date(scheduledFor) : new Date();
    const messages: any[] = [];
    let skipped = 0;

    for (const stay of stays) {
      const guest = guestMap.get(stay.guestId);
      if (!guest?.phone) { skipped++; continue; }

      const cabin = stay.cabinId ? cabinMap.get(stay.cabinId) : undefined;

      // Resolve variables per guest
      let resolvedBody = AutomationService.parseVariables(body, guest, cabin, stay);

      // Apply messenger mask prefix if provided
      if (messengerName?.trim()) {
        resolvedBody = `*${messengerName.trim()}:* ${resolvedBody}`;
      }

      // Jitter: add 3–7s to cursor for organic spacing
      const jitter = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
      cursor = new Date(cursor.getTime() + jitter);

      const cleanPhone = guest.phone.replace(/\D/g, '');

      messages.push({
        id: crypto.randomUUID(),
        propertyId,
        contactId: cleanPhone,
        stayId: stay.id,
        to: cleanPhone,
        body: resolvedBody,
        direction: 'outbound',
        isAutomated: false,
        scheduledFor: cursor.toISOString(),
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
      });
    }

    if (messages.length === 0) {
      return NextResponse.json({ queued: 0, skipped });
    }

    // 4. Batch insert (Supabase handles up to 1000 rows per insert)
    const BATCH = 500;
    for (let i = 0; i < messages.length; i += BATCH) {
      const { error: insertError } = await supabaseAdmin
        .from('messages')
        .insert(messages.slice(i, i + BATCH));
      if (insertError) throw insertError;
    }

    return NextResponse.json({ queued: messages.length, skipped });
  } catch (error: any) {
    console.error('Broadcast error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
