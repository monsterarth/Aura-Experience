// Parcelas reais do contrato de casamento — CRUD da aba financeiro.
// Toda mutação devolve a lista atualizada (a tela não precisa refazer o GET
// pesado de casamentos para se atualizar).
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AuditService } from '@/services/audit-service';
import { WeddingService } from '@/services/wedding-service';

const WEDDING_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;

// service-role ignora RLS → validamos posse (propertyId) manualmente antes de
// mutar. Rota NOVA de dado financeiro segue a convenção estrita da fase B.5
// (cross-tenant só super_admin), não o ADMIN_TIER frouxo da rota-mãe legada.
async function assertOwnership(
  id: string,
  staff: { role: string; propertyId: string | null }
): Promise<{ propertyId: string; couple: string } | NextResponse> {
  const { data: existing } = await supabaseAdmin!
    .from('weddings').select('propertyId, bride, groom').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Casamento não encontrado.' }, { status: 404 });
  if (staff.role !== 'super_admin' && existing.propertyId !== staff.propertyId) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  return { propertyId: existing.propertyId, couple: `${existing.bride} & ${existing.groom}` };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;
  const own = await assertOwnership(params.id, auth.staff);
  if (own instanceof NextResponse) return own;

  try {
    const installments = await WeddingService.listInstallments(params.id);
    return NextResponse.json({ installments });
  } catch (e) {
    console.error('Erro ao listar parcelas:', e);
    return NextResponse.json({ error: 'Falha ao listar parcelas.' }, { status: 500 });
  }
}

/** Cria (sem body.installmentId) ou edita (com) uma parcela. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;
  const own = await assertOwnership(params.id, auth.staff);
  if (own instanceof NextResponse) return own;

  const body = await request.json().catch(() => null);
  try {
    const isEdit = Boolean(body?.installmentId);
    await WeddingService.saveInstallment(params.id, {
      id: body?.installmentId ? String(body.installmentId) : undefined,
      label: String(body?.label ?? ''),
      value: Number(body?.value),
      dueDate: body?.dueDate ?? null,
      sortOrder: body?.sortOrder != null ? Number(body.sortOrder) : undefined,
    });

    await AuditService.log({
      propertyId: own.propertyId, userId: auth.staff.id, userName: auth.staff.fullName,
      action: 'UPDATE', entity: 'WEDDING', entityId: params.id,
      details: `Parcela "${String(body?.label ?? '').trim()}" de ${own.couple} ${isEdit ? 'editada' : 'criada'} (R$ ${Number(body?.value).toFixed(2)}${body?.dueDate ? `, vence ${body.dueDate}` : ''}).`,
    });

    const installments = await WeddingService.listInstallments(params.id);
    return NextResponse.json({ installments });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao salvar a parcela.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** Alterna pago/pendente (carimba paidAt; audit no service). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;
  const own = await assertOwnership(params.id, auth.staff);
  if (own instanceof NextResponse) return own;

  const body = await request.json().catch(() => null);
  if (!body?.installmentId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  try {
    await WeddingService.setInstallmentPaid(
      own.propertyId, String(body.installmentId), body.paid !== false,
      { id: auth.staff.id, name: auth.staff.fullName }
    );
    const installments = await WeddingService.listInstallments(params.id);
    return NextResponse.json({ installments });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao atualizar a parcela.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;
  const own = await assertOwnership(params.id, auth.staff);
  if (own instanceof NextResponse) return own;

  const installmentId = new URL(request.url).searchParams.get('installmentId');
  if (!installmentId) return NextResponse.json({ error: 'installmentId ausente' }, { status: 400 });

  try {
    await WeddingService.deleteInstallment(params.id, installmentId);
    await AuditService.log({
      propertyId: own.propertyId, userId: auth.staff.id, userName: auth.staff.fullName,
      action: 'UPDATE', entity: 'WEDDING', entityId: params.id,
      details: `Parcela excluída do contrato de ${own.couple}.`,
    });
    const installments = await WeddingService.listInstallments(params.id);
    return NextResponse.json({ installments });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao excluir a parcela.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
