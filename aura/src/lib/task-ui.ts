// Helpers de UI centralizados para os tipos de tarefa de governança.
// Importar daqui ao invés de repetir ternaries nos componentes.

import type { HousekeepingTask } from "@/types/aura";

export type TaskType = HousekeepingTask['type'];

export function getTaskLabel(type: TaskType): string {
  switch (type) {
    case 'turnover':            return 'Faxina de Troca';
    case 'inspection_checkin':  return 'Conferência de Entrada';
    case 'inspection_checkout': return 'Conferência de Saída';
    case 'daily':               return 'Arrumação';
    case 'linen_change':        return 'Arr. com Troca';
    case 'custom':              return 'Personalizada';
  }
}

export function getTaskColorClass(type: TaskType): string {
  switch (type) {
    case 'turnover':            return 'text-orange-500';
    case 'inspection_checkin':  return 'text-violet-500';
    case 'inspection_checkout': return 'text-violet-500';
    case 'daily':               return 'text-blue-500';
    case 'linen_change':        return 'text-teal-500';
    case 'custom':              return 'text-zinc-400';
  }
}

export function getTaskBgClass(type: TaskType): string {
  switch (type) {
    case 'turnover':            return 'bg-orange-500/10 text-orange-600';
    case 'inspection_checkin':  return 'bg-violet-500/10 text-violet-600';
    case 'inspection_checkout': return 'bg-violet-500/10 text-violet-600';
    case 'daily':               return 'bg-blue-500/10 text-blue-600';
    case 'linen_change':        return 'bg-teal-500/10 text-teal-600';
    case 'custom':              return 'bg-zinc-500/10 text-zinc-400';
  }
}

// Tipos que requerem conferência da governanta antes de liberar
export function needsConference(type: TaskType): boolean {
  return type === 'turnover' || type === 'inspection_checkin' || type === 'inspection_checkout';
}

// Mostra botão de frigobar (conferência de consumo)
export function showsMinibar(type: TaskType): boolean {
  return type === 'turnover' || type === 'inspection_checkout';
}

// Mostra badge de localização da chave
export function showsKeyLocation(type: TaskType): boolean {
  return type === 'turnover' || type === 'inspection_checkout';
}

// Tarefa visível para camareiras (/maid) — inspeções são exclusivas da governanta (/governanta)
export function visibleToMaid(type: TaskType): boolean {
  return type !== 'inspection_checkin' && type !== 'inspection_checkout';
}

// Pode ser convertida em linen_change (upgrade manual)
export function canUpgradeToLinenChange(task: HousekeepingTask): boolean {
  return task.type === 'daily' && (task.status === 'pending' || task.status === 'in_progress');
}
