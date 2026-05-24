// src/app/api/admin/changelog/[id]/entries/batch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { ChangelogEntryType } from '@/types/aura';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(['super_admin']);
  if (isAuthError(auth)) return auth;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const entries: Array<{ type: ChangelogEntryType; text: string }> = body.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'entries[] é obrigatório e não pode ser vazio.' }, { status: 400 });
    }

    const rows = entries.map((e, i) => ({
      changelogId: params.id,
      type: e.type,
      text: e.text.trim(),
      sortOrder: i,
    }));

    const { data, error } = await supabaseAdmin
      .from('changelog_entries')
      .insert(rows)
      .select();

    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
