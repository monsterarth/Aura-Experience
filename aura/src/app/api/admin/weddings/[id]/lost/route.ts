// Arquiva uma negociação de casamento que não frutificou.
// Rota própria (em vez de um PATCH de status) porque perda tem semântica extra:
// exige motivo, carimba a data e registra em auditoria como evento comercial.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { WeddingService } from '@/services/wedding-service';
import { AuditService } from '@/services/audit-service';

const WEDDING_ROLES = ['super_admin', 'admin', 'reception', 'manager'] as const;
const ADMIN_TIER = ['super_admin', 'admin', 'manager'];

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth([...WEDDING_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const { data: before } = await supabaseAdmin
    .from('weddings')
    .select('bride, groom, status, weddingDate, propertyId, contractTotal')
    .eq('id', params.id)
    .single();
  if (!before) return NextResponse.json({ error: 'Casamento não encontrado.' }, { status: 404 });
  if (!ADMIN_TIER.includes(auth.staff.role) && before.propertyId !== auth.staff.propertyId) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  if (before.status === 'completed') {
    return NextResponse.json(
      { error: 'Casamento já realizado não pode virar negociação perdida.' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const reason = String(body?.reason ?? '').trim();
  if (!reason) return NextResponse.json({ error: 'Informe o motivo da perda.' }, { status: 400 });

  try {
    await WeddingService.markAsLost(params.id, reason);

    await AuditService.log({
      propertyId: before.propertyId,
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: 'WEDDING_LOST',
      entity: 'WEDDING',
      entityId: params.id,
      details:
        `Negociação perdida: ${before.bride} & ${before.groom} (${before.weddingDate}) — ${reason}.` +
        (Number(before.contractTotal) > 0 ? ` Valor negociado: R$ ${Number(before.contractTotal).toFixed(2)}.` : ''),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Erro ao arquivar negociação:', e);
    return NextResponse.json({ error: 'Falha ao arquivar a negociação.' }, { status: 500 });
  }
}
