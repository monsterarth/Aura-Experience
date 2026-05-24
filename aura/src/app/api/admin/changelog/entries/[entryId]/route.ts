// src/app/api/admin/changelog/entries/[entryId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { deleteChangelogEntry } from '@/services/changelog-service';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { entryId: string } },
) {
  const auth = await requireAuth(['super_admin']);
  if (isAuthError(auth)) return auth;

  try {
    await deleteChangelogEntry(params.entryId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
