import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AuditService } from '@/services/audit-service';

const STATUS_LABEL: Record<string, string> = {
  tentative: 'Em negociação', confirmed: 'Confirmado',
  completed: 'Realizado', cancelled: 'Cancelado',
};

const WEDDING_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;
const ADMIN_TIER = ['super_admin', 'admin', 'manager'];

// service-role ignora RLS → validamos posse (propertyId) manualmente antes de mutar.
async function assertOwnership(
  id: string,
  staff: { role: string; propertyId: string | null }
): Promise<NextResponse | null> {
  const { data: existing } = await supabaseAdmin!.from('weddings').select('propertyId').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Casamento não encontrado.' }, { status: 404 });
  if (!ADMIN_TIER.includes(staff.role) && existing.propertyId !== staff.propertyId) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  return null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const denied = await assertOwnership(params.id, auth.staff);
  if (denied) return denied;

  const body = await request.json();
  const safe = { ...body };
  delete safe.id; delete safe.propertyId; delete safe.createdAt;

  // Estado anterior: sem ele o log não diz o que mudou (o módulo não tinha
  // auditoria nenhuma — nenhuma alteração de casamento era registrada).
  const { data: before } = await supabaseAdmin!
    .from('weddings')
    .select('bride, groom, status, weddingDate, propertyId, contractTotal')
    .eq('id', params.id)
    .single();

  const { error } = await supabaseAdmin!
    .from('weddings')
    .update({ ...safe, updatedAt: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (before) {
    const couple = `${before.bride} & ${before.groom}`;
    const changed: string[] = [];
    if (safe.status && safe.status !== before.status) {
      changed.push(`status ${STATUS_LABEL[before.status] ?? before.status} → ${STATUS_LABEL[safe.status] ?? safe.status}`);
    }
    if (safe.weddingDate && safe.weddingDate !== before.weddingDate) {
      changed.push(`data ${before.weddingDate} → ${safe.weddingDate}`);
    }
    if (safe.contractTotal != null && Number(safe.contractTotal) !== Number(before.contractTotal)) {
      changed.push(`contrato R$ ${Number(before.contractTotal).toFixed(2)} → R$ ${Number(safe.contractTotal).toFixed(2)}`);
    }
    await AuditService.log({
      propertyId: before.propertyId,
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: 'UPDATE',
      entity: 'WEDDING',
      entityId: params.id,
      details: changed.length
        ? `Casamento ${couple}: ${changed.join(' · ')}.`
        : `Casamento ${couple} atualizado.`,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;

  const denied = await assertOwnership(params.id, auth.staff);
  if (denied) return denied;

  const { data: before } = await supabaseAdmin!
    .from('weddings').select('bride, groom, weddingDate, propertyId').eq('id', params.id).single();

  const { error } = await supabaseAdmin!.from('weddings').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (before) {
    await AuditService.log({
      propertyId: before.propertyId,
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: 'DELETE',
      entity: 'WEDDING',
      entityId: params.id,
      details: `Casamento ${before.bride} & ${before.groom} (${before.weddingDate}) excluído.`,
    });
  }

  return NextResponse.json({ ok: true });
}
