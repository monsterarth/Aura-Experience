// src/app/api/field/maintenance-tasks/route.ts
// Leitura server-side das tarefas de manutenção da propriedade do staff autenticado.
// Mesmo motivo da rota de housekeeping: evita o quadro vazio causado por token do
// browser brevemente expirado no refresh mobile (a query RLS direta retornava []).
import { NextResponse } from 'next/server';
import { requireAuth, isAuthError, hasRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { MaintenanceService } from '@/services/maintenance-service';
import { notifyMaintenanceAssigned } from '@/lib/push-notify';
import type { MaintenanceTask, UserRole } from '@/types/aura';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('propertyId');
  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;

  if (!propertyId) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from('maintenance_tasks')
    .select('*')
    .eq('propertyId', propertyId);

  if (error) {
    console.error('[field/maintenance-tasks]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// Mutações server-side — antes os apps escreviam direto no Supabase pelo browser, o que
// pendurava no lock frio quando o celular bloqueava logo após o toque. Aqui é 1 round-trip;
// o MaintenanceService roda com service-role (db() detecta o servidor).
type TaskAction = 'create' | 'assign' | 'start' | 'finish' | 'confirm' | 'reject' | 'update' | 'delete';

// Autorização POR AÇÃO (service-role ignora RLS — a hierarquia precisa viver aqui):
// técnico executa (criar/iniciar/finalizar/checklist); coordenação (maintenance) e a
// governanta (que acumula a gerência de manutenção) também atribuem, conferem e apagam.
// Admin-tier (super_admin/admin/manager) sempre passa. requireAuth/hasRole já aceitam
// cargo primário OU secundário.
const FIELD_ROLES: UserRole[] = ['maintenance', 'technician', 'governance'];
const COORD_ROLES: UserRole[] = ['maintenance', 'governance'];
const ACTION_ROLES: Record<TaskAction, UserRole[]> = {
  create:  FIELD_ROLES,
  start:   FIELD_ROLES,
  finish:  FIELD_ROLES,
  update:  FIELD_ROLES, // hoje = só checklist (ver allowlist abaixo)
  assign:  COORD_ROLES,
  confirm: COORD_ROLES,
  reject:  COORD_ROLES,
  delete:  COORD_ROLES,
};

export async function POST(req: Request) {
  const auth = await requireAuth(['maintenance', 'technician', 'governance', 'super_admin', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;

  let body: {
    action?: TaskAction;
    taskId?: string;
    task?: Partial<MaintenanceTask>;
    techIds?: string[];
    completion?: NonNullable<MaintenanceTask['completion']>;
    updates?: Partial<MaintenanceTask>;
    notes?: string;
    propertyId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const { action, taskId } = body;
  if (!action || !(action in ACTION_ROLES)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  }

  const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
  if (!isAdminTier && !hasRole(auth.staff.role, auth.staff.secondaryRoles, ACTION_ROLES[action])) {
    return NextResponse.json({ error: 'Seu cargo não pode executar esta ação.' }, { status: 403 });
  }
  const { id: actorId, fullName: actorName } = auth.staff;

  // 'create' não tem taskId — abre uma demanda nova (report de colaborador / chamado).
  if (action === 'create') {
    const createPropertyId = isAdminTier && body.propertyId ? body.propertyId : auth.staff.propertyId;
    if (!createPropertyId) {
      return NextResponse.json({ error: 'Sem propriedade.' }, { status: 400 });
    }
    const taskData = body.task ?? {};
    try {
      const newId = await MaintenanceService.createTask(createPropertyId, taskData, actorId, actorName);
      // Sempre notifica (triggerTaskPush é no-op no servidor): com técnico atribuído o push
      // vai a ele; SEM técnico, o fallback do push-notify avisa o time inteiro de manutenção
      // — é assim que a equipe fica sabendo de um chamado novo da governanta.
      try { await notifyMaintenanceAssigned(newId); }
      catch (e) { console.error('[field/maintenance-tasks POST create] push:', e); }
      return NextResponse.json({ ok: true, id: newId });
    } catch (e: any) {
      if (typeof e?.message === 'string' && e.message.startsWith('MAINTENANCE_STAY_CONFLICT')) {
        return NextResponse.json({ error: e.message }, { status: 409 });
      }
      console.error('[field/maintenance-tasks POST create]', e?.message ?? e);
      return NextResponse.json({ error: 'Erro ao criar a tarefa.' }, { status: 500 });
    }
  }

  // As demais ações operam sobre uma tarefa existente.
  if (!taskId) {
    return NextResponse.json({ error: 'taskId é obrigatório.' }, { status: 400 });
  }

  // service-role ignora RLS → validamos a posse da tarefa manualmente.
  const { data: task } = await supabaseAdmin
    .from('maintenance_tasks')
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
      case 'assign':
        await MaintenanceService.assignTask(propertyId, taskId, body.techIds ?? [], actorId, actorName);
        // triggerTaskPush é no-op no servidor → dispara o push de atribuição aqui.
        try { await notifyMaintenanceAssigned(taskId); } catch (e) { console.error('[field/maintenance-tasks POST] push de atribuição:', e); }
        break;
      case 'start':
        await MaintenanceService.startTask(propertyId, taskId, actorId, actorName);
        break;
      case 'finish':
        if (!body.completion) {
          return NextResponse.json({ error: 'completion é obrigatório.' }, { status: 400 });
        }
        await MaintenanceService.finishTask(propertyId, taskId, body.completion, actorId, actorName);
        break;
      case 'confirm':
        await MaintenanceService.confirmTaskQuality(propertyId, taskId, body.notes || 'Aprovado', actorId, actorName);
        break;
      case 'reject':
        await MaintenanceService.rollbackTaskStatus(propertyId, taskId, body.notes || 'Reprovado na conferência', actorId, actorName);
        break;
      case 'update': {
        // Allowlist de colunas: `updates` vem do cliente e roda com service-role — sem o
        // filtro, um request manual poderia sobrescrever status/conferredBy/propertyId e
        // furar o fluxo de conferência. Hoje o único uso legítimo é o toggle de checklist.
        if (!body.updates || !Array.isArray(body.updates.checklist)) {
          return NextResponse.json({ error: 'Somente a atualização de checklist é permitida.' }, { status: 400 });
        }
        await MaintenanceService.updateChecklist(taskId, body.updates.checklist);
        break;
      }
      case 'delete':
        await MaintenanceService.deleteTask(propertyId, taskId, actorId, actorName);
        break;
      default:
        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }
  } catch (e: any) {
    console.error('[field/maintenance-tasks POST]', e?.message ?? e);
    return NextResponse.json({ error: 'Erro ao processar a ação.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
