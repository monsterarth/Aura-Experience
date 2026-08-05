// Registra contato com o casal: empurra o próximo follow-up e renova a
// validade da negociação. É o que mantém vivo um lead ativo cujo prazo
// original venceria — sem isso, negociação em andamento seria arquivada.
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
    .from('weddings').select('bride, groom, status, propertyId').eq('id', params.id).single();
  if (!before) return NextResponse.json({ error: 'Casamento não encontrado.' }, { status: 404 });
  if (!ADMIN_TIER.includes(auth.staff.role) && before.propertyId !== auth.staff.propertyId) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === 'string' ? body.note : undefined;

  try {
    const dates = await WeddingService.registerFollowUp(before.propertyId, params.id, note);

    await AuditService.log({
      propertyId: before.propertyId,
      userId: auth.staff.id,
      userName: auth.staff.fullName,
      action: 'WEDDING_FOLLOW_UP',
      entity: 'WEDDING',
      entityId: params.id,
      details:
        `Follow-up com ${before.bride} & ${before.groom}` +
        (note?.trim() ? `: ${note.trim()}` : '') +
        `. Próximo contato ${dates.followUpAt}, validade até ${dates.expiresAt}.`,
    });

    return NextResponse.json({ ok: true, ...dates });
  } catch (e) {
    console.error('Erro ao registrar follow-up:', e);
    return NextResponse.json({ error: 'Falha ao registrar o follow-up.' }, { status: 500 });
  }
}
