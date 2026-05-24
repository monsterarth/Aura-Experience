// src/app/api/admin/changelog/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { updateChangelog, deleteChangelog } from '@/services/changelog-service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(['super_admin']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const updated = await updateChangelog(params.id, body);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(['super_admin']);
  if (isAuthError(auth)) return auth;

  try {
    await deleteChangelog(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
