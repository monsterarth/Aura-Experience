// src/app/api/admin/changelog/[id]/entries/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { addChangelogEntry } from '@/services/changelog-service';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(['super_admin']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { type, text, sortOrder } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text é obrigatório.' }, { status: 400 });
    }
    if (!['feature', 'improvement', 'fix'].includes(type)) {
      return NextResponse.json({ error: 'type inválido.' }, { status: 400 });
    }

    const entry = await addChangelogEntry({
      changelogId: params.id,
      type,
      text: text.trim(),
      sortOrder: sortOrder ?? 0,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
