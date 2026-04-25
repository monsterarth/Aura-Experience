import { Staff, StaffSchedule, StaffScheduleOverride, ScheduleConfig, ScheduleCheckpoint } from '@/types/aura';

export interface DayScheduleResult {
  isWork: boolean;
  startTime?: string;
  endTime?: string;
  source: 'calculated' | 'base-schedule' | 'not-configured';
}

function localMidnight(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

function diffDays(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / msPerDay);
}

function positiveModulo(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function toLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Resolve qual referenceDate usar para um staff em uma data específica.
 * Usa o checkpoint mais recente cuja effectiveDate <= date.
 * Fallback: cycleReferenceDate do scheduleConfig.
 */
function resolveReferenceDate(
  scheduleConfig: ScheduleConfig,
  staffId: string,
  date: Date,
  checkpoints: ScheduleCheckpoint[]
): string | undefined {
  const dateStr = toLocalYMD(date);
  const applicable = checkpoints
    .filter(c => c.staffId === staffId && c.effectiveDate <= dateStr)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return applicable[0]?.referenceDate ?? scheduleConfig.cycleReferenceDate;
}

export function calculateScheduleForDate(
  staff: Staff,
  date: Date,
  checkpoints: ScheduleCheckpoint[] = []
): DayScheduleResult {
  const { scheduleType, scheduleConfig } = staff;

  if (!scheduleType || !scheduleConfig) {
    return { isWork: false, source: 'not-configured' };
  }

  // Normaliza para meia-noite local para evitar arredondamento errado no diffDays
  const normalizedDate = localMidnight(toLocalYMD(date));

  const { startTime, endTime } = scheduleConfig;

  if (scheduleType === '5x2') {
    const dow = normalizedDate.getDay(); // 0=Dom, 6=Sáb
    const isWork = dow >= 1 && dow <= 5;
    return isWork
      ? { isWork: true, startTime, endTime, source: 'calculated' }
      : { isWork: false, source: 'calculated' };
  }

  if (scheduleType === '12x36') {
    const refDate = resolveReferenceDate(scheduleConfig, staff.id, normalizedDate, checkpoints);
    if (!refDate) return { isWork: false, source: 'not-configured' };
    const ref = localMidnight(refDate);
    const diff = diffDays(normalizedDate, ref);
    const isWork = positiveModulo(diff, 2) === 0;
    return isWork
      ? { isWork: true, startTime, endTime, source: 'calculated' }
      : { isWork: false, source: 'calculated' };
  }

  if (scheduleType === '6x1') {
    const refDate = resolveReferenceDate(scheduleConfig, staff.id, normalizedDate, checkpoints);
    if (!refDate) return { isWork: false, source: 'not-configured' };
    const ref = localMidnight(refDate);
    const diff = diffDays(normalizedDate, ref);
    const pos = positiveModulo(diff, 7);
    const isWork = pos < 6;
    return isWork
      ? { isWork: true, startTime, endTime, source: 'calculated' }
      : { isWork: false, source: 'calculated' };
  }

  // custom: a UI usa StaffSchedule diretamente
  return { isWork: false, source: 'base-schedule' };
}

export function resolveEffectiveDaySchedule(
  staff: Staff,
  staffSchedules: StaffSchedule[],
  overridesForDate: StaffScheduleOverride[],
  date: Date,
  checkpoints: ScheduleCheckpoint[] = []
): DayScheduleResult & { hasOverride: boolean } {
  // Override tem prioridade absoluta
  const override = overridesForDate.find(o => o.staffId === staff.id);
  if (override) {
    if (!override.startTime) {
      return { isWork: false, source: 'calculated', hasOverride: true };
    }
    return {
      isWork: true,
      startTime: override.startTime.slice(0, 5),
      endTime: override.endTime?.slice(0, 5),
      source: 'calculated',
      hasOverride: true,
    };
  }

  // Para custom, usa StaffSchedule por dayOfWeek
  if (!staff.scheduleType || staff.scheduleType === 'custom') {
    const dow = date.getDay();
    const base = staffSchedules.find(s => s.staffId === staff.id && s.dayOfWeek === dow && s.active);
    if (base) {
      return {
        isWork: true,
        startTime: base.startTime.slice(0, 5),
        endTime: base.endTime.slice(0, 5),
        source: 'base-schedule',
        hasOverride: false,
      };
    }
    return { isWork: false, source: 'not-configured', hasOverride: false };
  }

  const calculated = calculateScheduleForDate(staff, date, checkpoints);
  return { ...calculated, hasOverride: false };
}
