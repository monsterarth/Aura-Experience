// src/app/api/admin/scraps/route.ts
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

const LIMIT = 50;

/**
 * GET /api/admin/scraps?toStaffId=xxx&offset=0
 * Returns scraps wall for a staff member with reactions and sender info.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const toStaffId = searchParams.get('toStaffId');
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  if (!toStaffId) {
    return NextResponse.json({ error: 'toStaffId é obrigatório.' }, { status: 400 });
  }

  // Verify target staff exists and is in the same property
  const { data: target } = await supabaseAdmin!
    .from('staff')
    .select('id, propertyId')
    .eq('id', toStaffId)
    .single();

  if (!target || target.propertyId !== auth.staff.propertyId) {
    return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });
  }

  const { data: scraps, error } = await supabaseAdmin!
    .from('staff_scraps')
    .select(`
      id, fromStaffId, toStaffId, propertyId, message, createdAt,
      fromStaff:staff!staff_scraps_fromStaffId_fkey(id, fullName, role, profilePictureUrl, messengerColor),
      reactions:staff_scrap_reactions(id, scrapId, staffId, emoji, createdAt)
    `)
    .eq('toStaffId', toStaffId)
    .order('createdAt', { ascending: false })
    .range(offset, offset + LIMIT - 1);

  if (error) {
    console.error('[Scraps GET]', error);
    return NextResponse.json({ error: 'Erro ao buscar recados.' }, { status: 500 });
  }

  return NextResponse.json({ scraps: scraps ?? [], hasMore: (scraps?.length ?? 0) === LIMIT });
}

/**
 * POST /api/admin/scraps
 * Body: { toStaffId: string; message: string }
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const { toStaffId, message } = body as { toStaffId: string; message: string };

  if (!toStaffId || !message?.trim()) {
    return NextResponse.json({ error: 'toStaffId e message são obrigatórios.' }, { status: 400 });
  }

  if (message.length > 1000) {
    return NextResponse.json({ error: 'Mensagem não pode ter mais de 1000 caracteres.' }, { status: 400 });
  }

  // Verify target is in the same property
  const { data: target } = await supabaseAdmin!
    .from('staff')
    .select('id, propertyId')
    .eq('id', toStaffId)
    .single();

  if (!target || target.propertyId !== auth.staff.propertyId) {
    return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });
  }

  const { data: scrap, error } = await supabaseAdmin!
    .from('staff_scraps')
    .insert({
      fromStaffId: auth.staff.id,
      toStaffId,
      propertyId: auth.staff.propertyId,
      message: message.trim(),
    })
    .select(`
      id, fromStaffId, toStaffId, propertyId, message, createdAt,
      fromStaff:staff!staff_scraps_fromStaffId_fkey(id, fullName, role, profilePictureUrl, messengerColor)
    `)
    .single();

  if (error) {
    console.error('[Scraps POST]', error);
    return NextResponse.json({ error: 'Erro ao criar recado.' }, { status: 500 });
  }

  return NextResponse.json({ scrap });
}

/**
 * DELETE /api/admin/scraps?scrapId=xxx
 * Only the author or an admin/super_admin can delete.
 */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const scrapId = searchParams.get('scrapId');

  if (!scrapId) {
    return NextResponse.json({ error: 'scrapId é obrigatório.' }, { status: 400 });
  }

  const { data: scrap } = await supabaseAdmin!
    .from('staff_scraps')
    .select('id, fromStaffId, propertyId')
    .eq('id', scrapId)
    .single();

  if (!scrap || scrap.propertyId !== auth.staff.propertyId) {
    return NextResponse.json({ error: 'Recado não encontrado.' }, { status: 404 });
  }

  const isAuthor = scrap.fromStaffId === auth.staff.id;
  const isModerator = auth.staff.role === 'admin' || auth.staff.role === 'super_admin';

  if (!isAuthor && !isModerator) {
    return NextResponse.json({ error: 'Sem permissão para apagar este recado.' }, { status: 403 });
  }

  const { error } = await supabaseAdmin!
    .from('staff_scraps')
    .delete()
    .eq('id', scrapId);

  if (error) {
    console.error('[Scraps DELETE]', error);
    return NextResponse.json({ error: 'Erro ao apagar recado.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
