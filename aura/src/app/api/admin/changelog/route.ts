// src/app/api/admin/changelog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { getAllChangelogs, createChangelog } from '@/services/changelog-service';

export async function GET() {
  const auth = await requireAuth(['super_admin']);
  if (isAuthError(auth)) return auth;

  try {
    const changelogs = await getAllChangelogs();
    return NextResponse.json(changelogs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['super_admin']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { version, label, date, status = 'draft', highlight } = body;

    if (!version?.trim() || !label?.trim() || !date) {
      return NextResponse.json({ error: 'version, label e date são obrigatórios.' }, { status: 400 });
    }

    const created = await createChangelog({ version: version.trim(), label: label.trim(), date, status, highlight: highlight ?? null });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
