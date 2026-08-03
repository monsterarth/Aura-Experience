import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { ConciergeService } from '@/services/concierge-service';
import { StayService } from '@/services/stay-service';
import { AuditService } from '@/services/audit-service';

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

    // Marca a tarefa de faxina como conferida (sai do quadro de checkout) e grava QUEM
    // conferiu: a conferência de saída sempre tem um responsável, e sem isto não sobrava
    // rastro nenhum quando o hóspede contesta um frigobar ou um objeto não devolvido.
    // O ator vem da sessão, nunca do corpo da requisição.
    if (body.taskId && body.cabinChecked) {
      const markChecked = (payload: Record<string, unknown>) => {
        let q = supabaseAdmin!.from('housekeeping_tasks').update(payload).eq('id', body.taskId!);
        if (!isAdminTier) q = q.eq('propertyId', auth.staff.propertyId);
        return q;
      };

      const { error } = await markChecked({
        cabinChecked: true, cabinCheckedBy: auth.staff.id, cabinCheckedAt: now, updatedAt: now,
      });
      if (error) {
        // Ponte até add_cabin_conference_author.sql ser aplicada: sem as colunas o PostgREST
        // rejeita o update inteiro, e a conferência da camareira ficaria por marcar. Regrava
        // sem o autor em vez de derrubar o fluxo de campo.
        console.error('[field/cabin-conference] update com autor falhou, tentando sem:', error.message);
        const retry = await markChecked({ cabinChecked: true, updatedAt: now });
        if (retry.error) throw retry.error;
      }

      // Trilha de auditoria: o nome fica legível em /admin/logs mesmo se a tarefa for apagada.
      const { data: task } = await supabaseAdmin
        .from('housekeeping_tasks').select('propertyId, cabinId').eq('id', body.taskId).maybeSingle();
      if (task?.propertyId) {
        const { data: cabin } = task.cabinId
          ? await supabaseAdmin.from('cabins').select('name').eq('id', task.cabinId).maybeSingle()
          : { data: null };
        await AuditService.log({
          propertyId: task.propertyId,
          userId: auth.staff.id,
          userName: auth.staff.fullName,
          action: 'UPDATE',
          entity: 'CABIN',
          entityId: body.taskId,
          details: `Conferência de saída concluída (frigobar, chave, achados e empréstimos): ${cabin?.name || 'cabana'}.`,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[field/cabin-conference]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao salvar a conferência.' }, { status: 500 });
  }
}
