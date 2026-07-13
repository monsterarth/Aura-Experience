import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { ConciergeService } from '@/services/concierge-service';
import { StayService } from '@/services/stay-service';

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
    // Passo 1 da conferência: lança o consumo de frigobar (preços vêm do catálogo no servidor).
    frigobar?: { cabinId?: string; cart: Record<string, number> };
    // Passo 2: chave não encontrada → item de rastreio (preço zero) no fólio.
    keyNotFound?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const now = new Date().toISOString();

  try {
    // Frigobar / chave: operam sobre uma estadia — valida a posse antes (service-role ignora RLS).
    if (body.stayId && (body.frigobar || body.keyNotFound)) {
      const { data: stay } = await supabaseAdmin
        .from('stays').select('propertyId').eq('id', body.stayId).single();
      if (!stay?.propertyId) {
        return NextResponse.json({ error: 'Estadia não encontrada.' }, { status: 404 });
      }
      if (!isAdminTier && stay.propertyId !== auth.staff.propertyId) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
      }
      const propertyId = stay.propertyId as string;
      const { id: actorId, fullName: actorName } = auth.staff;

      if (body.frigobar) {
        try {
          await ConciergeService.launchFrigobar(
            propertyId,
            { stayId: body.stayId, cabinId: body.frigobar.cabinId, cart: body.frigobar.cart ?? {} },
            actorId, actorName,
          );
        } catch (e: any) {
          // Estoque insuficiente é erro de negócio — devolve a mensagem para o toast.
          if (typeof e?.message === 'string' && e.message.includes('indisponível')) {
            return NextResponse.json({ error: e.message }, { status: 409 });
          }
          throw e;
        }
      }

      if (body.keyNotFound) {
        await StayService.addFolioItemManual(
          propertyId, body.stayId,
          { description: 'Chave não encontrada', quantity: 1, unitPrice: 0, totalPrice: 0, category: 'services', addedBy: actorId },
          actorId, actorName,
        );
      }
    }

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
