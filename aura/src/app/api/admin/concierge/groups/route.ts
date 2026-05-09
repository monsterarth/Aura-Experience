import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json([], { status: 500 });

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get('propertyId');
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('concierge_groups')
    .select('*')
    .eq('propertyId', propertyId)
    .order('order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['super_admin', 'admin']);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server error' }, { status: 500 });

  const body = await request.json();
  const { propertyId, name, name_en, name_es, icon, color, order } = body;
  if (!propertyId || !name) {
    return NextResponse.json({ error: 'propertyId and name required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('concierge_groups')
    .insert({
      id: crypto.randomUUID(),
      propertyId,
      name,
      name_en: name_en || null,
      name_es: name_es || null,
      icon: icon || null,
      color: color || null,
      order: order ?? 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
