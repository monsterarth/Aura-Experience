// src/app/api/admin/scraps/reactions/route.ts
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/admin/scraps/reactions
 * Body: { scrapId: string; emoji: string }
 * Toggles a reaction — adds if not present, removes if already present.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const { scrapId, emoji } = body as { scrapId: string; emoji: string };

  if (!scrapId || !emoji) {
    return NextResponse.json({ error: 'scrapId e emoji são obrigatórios.' }, { status: 400 });
  }

  // Verify scrap exists and is in the same property
  const { data: scrap } = await supabaseAdmin!
    .from('staff_scraps')
    .select('id, propertyId')
    .eq('id', scrapId)
    .single();

  if (!scrap || scrap.propertyId !== auth.staff.propertyId) {
    return NextResponse.json({ error: 'Recado não encontrado.' }, { status: 404 });
  }

  // Check if reaction already exists
  const { data: existing } = await supabaseAdmin!
    .from('staff_scrap_reactions')
    .select('id')
    .eq('scrapId', scrapId)
    .eq('staffId', auth.staff.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    // Remove it (toggle off)
    const { error } = await supabaseAdmin!
      .from('staff_scrap_reactions')
      .delete()
      .eq('id', existing.id);

    if (error) {
      console.error('[Reactions DELETE]', error);
      return NextResponse.json({ error: 'Erro ao remover reação.' }, { status: 500 });
    }

    return NextResponse.json({ added: false });
  } else {
    // Add it (toggle on)
    const { error } = await supabaseAdmin!
      .from('staff_scrap_reactions')
      .insert({ scrapId, staffId: auth.staff.id, emoji });

    if (error) {
      console.error('[Reactions INSERT]', error);
      return NextResponse.json({ error: 'Erro ao adicionar reação.' }, { status: 500 });
    }

    return NextResponse.json({ added: true });
  }
}
