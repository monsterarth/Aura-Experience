import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { serverError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  if (!propertyId) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from('cabins')
    .select('id, name, number, category, status, propertyId')
    .eq('propertyId', propertyId)
    .order('number', { ascending: true });

  if (error) return serverError('field/cabins', error);

  return NextResponse.json(data ?? []);
}
