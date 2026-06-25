// src/app/api/field/housekeeping-tasks/route.ts
// Leitura server-side das tarefas de governança da propriedade do staff autenticado.
// Substitui a query RLS do browser nas apps de campo (maid/governanta): aquela retornava
// [] quando o access token do browser estava brevemente expirado (refresh mobile),
// apagando o quadro de faxinas mesmo havendo tarefas. Aqui a sessão vem dos cookies já
// validados/renovados pelo middleware, então o resultado reflete a verdade do banco.
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { HousekeepingService } from '@/services/housekeeping-service';
import { notifyHousekeepingAssigned, notifyHousekeepingConference } from '@/lib/push-notify';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Staff de campo: usa SEMPRE a própria propriedade (segurança — ignora query do cliente).
  // Admin-tier (que pode visualizar qualquer propriedade): honra o propertyId pedido.
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  if (!propertyId) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from('housekeeping_tasks')
    .select('*')
    .eq('propertyId', propertyId)
    .neq('status', 'cancelled');

  if (error) {
    console.error('[field/housekeeping-tasks]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// Mutações de tarefa (start/resume/pause/skip/finish/upgrade) executadas server-side.
// Antes a app da camareira escrevia direto no Supabase pelo browser: 5–7 round-trips em
// sequência pela rede móvel + auditoria que podia se perder ao bloquear o celular. Aqui é
// 1 round-trip a partir do dispositivo; o HousekeepingService roda com service-role (db()
// detecta o servidor) e conclui update + cabana + auditoria/push de forma confiável.
type TaskAction = 'start' | 'resume' | 'pause' | 'skip' | 'finish' | 'upgrade' | 'confirm' | 'reject' | 'assign' | 'cancel' | 'create';

export async function POST(req: Request) {
  // 'governance' incluído para a conferência de qualidade (confirm/reject). 'maid' cobre a
  // camareira com cargo SECUNDÁRIO de governanta (requireAuth só vê o cargo primário).
  const auth = await requireAuth(['maid', 'governance', 'super_admin', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;

  let body: { action?: TaskAction; taskId?: string; checklist?: unknown[]; observations?: string; maidIds?: string[]; task?: Record<string, any>; propertyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const { action, taskId } = body;
  if (!action) {
    return NextResponse.json({ error: 'action é obrigatória.' }, { status: 400 });
  }

  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const { id: actorId, fullName: actorName } = auth.staff;

  // 'create' não tem taskId — cria tarefa nova (faxina manual de estrutura/cabana/custom).
  // createTask pelo browser pendurava no lock frio do app de campo; aqui roda server-side (db()).
  if (action === 'create') {
    const createPropertyId = isAdminTier && body.propertyId ? body.propertyId : auth.staff.propertyId;
    if (!createPropertyId) {
      return NextResponse.json({ error: 'Sem propriedade.' }, { status: 400 });
    }
    const taskData: Record<string, any> = body.task ?? {};
    try {
      const newId = await HousekeepingService.createTask(createPropertyId, taskData as any, actorId, actorName);
      if (Array.isArray(taskData.assignedTo) && taskData.assignedTo.length > 0) {
        try { await notifyHousekeepingAssigned(newId); }
        catch (e) { console.error('[field/housekeeping-tasks POST create] push:', e); }
      }
      return NextResponse.json({ ok: true, id: newId });
    } catch (e: any) {
      console.error('[field/housekeeping-tasks POST create]', e?.message ?? e);
      return NextResponse.json({ error: 'Erro ao criar a tarefa.' }, { status: 500 });
    }
  }

  // As demais ações operam sobre uma tarefa existente.
  if (!taskId) {
    return NextResponse.json({ error: 'taskId é obrigatório.' }, { status: 400 });
  }

  // service-role ignora RLS → validamos a posse da tarefa manualmente.
  const { data: task } = await supabaseAdmin
    .from('housekeeping_tasks')
    .select('propertyId')
    .eq('id', taskId)
    .single();
  if (!task?.propertyId) {
    return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 });
  }

  if (!isAdminTier && auth.staff.propertyId !== task.propertyId) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const propertyId = task.propertyId as string;

  try {
    switch (action) {
      case 'start':
        await HousekeepingService.startTask(propertyId, taskId, actorId, actorName);
        break;
      case 'resume':
        await HousekeepingService.resumeTask(propertyId, taskId, actorId, actorName);
        break;
      case 'pause':
        await HousekeepingService.pauseTask(propertyId, taskId, actorId, actorName);
        break;
      case 'skip':
        await HousekeepingService.skipTask(propertyId, taskId, actorId, actorName);
        break;
      case 'upgrade':
        await HousekeepingService.upgradeToLinenChange(propertyId, taskId, actorId, actorName);
        break;
      case 'confirm': {
        // Persiste o checklist ajustado pela governanta antes de aprovar (era write à parte no browser).
        if (Array.isArray(body.checklist) && body.checklist.length > 0) {
          await supabaseAdmin
            .from('housekeeping_tasks')
            .update({ checklist: body.checklist, updatedAt: new Date().toISOString() })
            .eq('id', taskId);
        }
        await HousekeepingService.confirmTaskQuality(propertyId, taskId, body.observations || 'Aprovado', actorId, actorName);
        break;
      }
      case 'reject':
        await HousekeepingService.rollbackTaskStatus(propertyId, taskId, body.observations || 'Reprovado na conferência', actorId, actorName);
        break;
      case 'assign':
        await HousekeepingService.assignTask(propertyId, taskId, body.maidIds ?? [], actorId, actorName);
        // triggerTaskPush é no-op no servidor → dispara o push de atribuição aqui.
        try { await notifyHousekeepingAssigned(taskId); } catch (e) { console.error('[field/housekeeping-tasks POST] push de atribuição:', e); }
        break;
      case 'cancel':
        await HousekeepingService.updateTask(propertyId, taskId, { status: 'cancelled' }, actorId, actorName);
        break;
      case 'finish': {
        const status = await HousekeepingService.finishTask(
          propertyId, taskId, (body.checklist as any[]) ?? [], body.observations ?? '', actorId, actorName
        );
        // triggerTaskPush é no-op no servidor → disparamos o push de conferência aqui.
        if (status === 'waiting_conference') {
          try {
            await notifyHousekeepingConference(taskId);
          } catch (e) {
            console.error('[field/housekeeping-tasks POST] push de conferência:', e);
          }
        }
        break;
      }
      default:
        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }
  } catch (e: any) {
    if (e?.message === 'CHECKLIST_INCOMPLETE') {
      return NextResponse.json({ error: 'CHECKLIST_INCOMPLETE' }, { status: 422 });
    }
    console.error('[field/housekeeping-tasks POST]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao processar a ação.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
