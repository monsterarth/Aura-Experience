import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Finalização da conferência de cabana (frigobar/checkout) executada server-side.
// Antes a MinibarSheet escrevia direto no Supabase pelo browser (stays: objetos esquecidos /
// emprestados; housekeeping_tasks: cabinChecked). No app de campo esses writes penduravam no
// lock/token frio do Supabase — spinner travado e botões sem resposta. Aqui é 1 round-trip a
// partir do dispositivo, com service-role (sem RLS), e conclui de forma confiável.
export async function POST(req: Request) {
  const auth = await requireAuth(['maid', 'governance', 'super_admin', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;

  let body: {
    stayId?: string;
    taskId?: string;
    lostItems?: { description: string; photo?: string | null };
    loanedReturned?: boolean;
    cabinChecked?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const now = new Date().toISOString();

  try {
    // Stays: objetos esquecidos e/ou emprestados. Escopado à propriedade do staff (exceto admin).
    if (body.stayId && (body.lostItems || body.loanedReturned)) {
      const stayUpdate: Record<string, any> = {};
      if (body.lostItems) {
        stayUpdate.lostItemsDescription = body.lostItems.description;
        stayUpdate.lostItemsPhoto = body.lostItems.photo ?? null;
        stayUpdate.lostItemsReportedAt = now;
        stayUpdate.lostItemsReportedBy = auth.staff.id; // ator vem da sessão, não do cliente
      }
      if (body.loanedReturned) {
        stayUpdate.loanedItemsChecked = true;
        stayUpdate.loanedItemsCheckedAt = now;
      }
      let q = supabaseAdmin.from('stays').update(stayUpdate).eq('id', body.stayId);
      if (!isAdminTier) q = q.eq('propertyId', auth.staff.propertyId);
      const { error } = await q;
      if (error) throw error;
    }

    // Marca a tarefa de faxina como conferida (sai do quadro de checkout).
    if (body.taskId && body.cabinChecked) {
      let q = supabaseAdmin
        .from('housekeeping_tasks')
        .update({ cabinChecked: true, updatedAt: now })
        .eq('id', body.taskId);
      if (!isAdminTier) q = q.eq('propertyId', auth.staff.propertyId);
      const { error } = await q;
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[field/cabin-conference]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao salvar a conferência.' }, { status: 500 });
  }
}
