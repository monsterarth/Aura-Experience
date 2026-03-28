import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

function getStatusFilter(audience: string): string[] {
  if (audience === 'active') return ['active'];
  if (audience === 'future') return ['pending', 'pre_checkin_done'];
  if (audience === 'past') return ['finished'];
  return [];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get('propertyId');
  const audience = searchParams.get('audience');
  const pastDays = parseInt(searchParams.get('pastDays') || '3', 10);

  if (!propertyId || !audience) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const statusFilter = getStatusFilter(audience);
  if (!statusFilter.length) {
    return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('stays')
    .select('id, guestId')
    .eq('propertyId', propertyId)
    .in('status', statusFilter);

  if (audience === 'past') {
    const since = new Date();
    since.setDate(since.getDate() - pastDays);
    query = query.gte('checkOut', since.toISOString().split('T')[0]);
  }

  const { data: stays, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!stays || stays.length === 0) {
    return NextResponse.json({ count: 0, names: [] });
  }

  // Fetch guest names + phones to count valid recipients
  const guestIds = Array.from(new Set(stays.map((s: any) => s.guestId)));
  const { data: guests } = await supabaseAdmin
    .from('guests')
    .select('id, fullName, phone')
    .in('id', guestIds);

  const guestMap = new Map((guests || []).map((g: any) => [g.id, g]));

  const validStays = stays.filter((s: any) => {
    const g = guestMap.get(s.guestId);
    return g?.phone;
  });

  const names = validStays
    .slice(0, 5)
    .map((s: any) => guestMap.get(s.guestId)?.fullName?.split(' ')[0] || 'Hóspede');

  return NextResponse.json({ count: validStays.length, names });
}
