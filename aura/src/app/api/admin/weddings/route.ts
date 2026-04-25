import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const propertyId = new URL(request.url).searchParams.get('propertyId');
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from('weddings')
    .select('*, vendors:wedding_vendors(*), cabinAssignments:wedding_cabin_assignments(*)')
    .eq('propertyId', propertyId)
    .order('weddingDate', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const { propertyId, ...rest } = body;
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin!
    .from('weddings')
    .insert({ ...rest, propertyId, id: crypto.randomUUID(), createdAt: now, updatedAt: now })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
