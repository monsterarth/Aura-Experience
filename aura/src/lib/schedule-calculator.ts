import { Staff, StaffSchedule, StaffScheduleOverride, ScheduleConfig, ScheduleCheckpoint } from '@/types/aura';

export interface DayScheduleResult {
  isWork: boolean;
  startTime?: string;
  endTime?: string;
  source: 'calculated' | 'base-schedule' | 'not-configured';
  reason?: string;
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

export function getEffectiveConfig(staff: Staff, date: Date): { scheduleType: NonNullable<Staff['scheduleType']>; scheduleConfig: ScheduleConfig } | null {
  if (!staff.scheduleType || !staff.scheduleConfig) return null;

  const dateStr = toLocalYMD(date);
  const history = staff.scheduleConfig.history || [];

  // Filter history items valid for the date (date <= endDate)
  // Sort by endDate ascending to get the earliest valid history item
  const validHistory = [...history]
    .filter(h => dateStr <= h.endDate)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  if (validHistory.length > 0) {
    const hist = validHistory[0];
    return {
      scheduleType: hist.scheduleType,
      scheduleConfig: hist as any // Cast history item to ScheduleConfig since it matches the shape
    };
  }

  // If no history item covers this date, use the current config
  return {
    scheduleType: staff.scheduleType,
    scheduleConfig: staff.scheduleConfig
  };
}

export function calculateScheduleForDate(
  staff: Staff,
  date: Date,
  checkpoints: ScheduleCheckpoint[] = []
): DayScheduleResult {
  const effective = getEffectiveConfig(staff, date);
  if (!effective) {
    return { isWork: false, source: 'not-configured' };
  }

  const { scheduleType, scheduleConfig } = effective;

  // Normaliza para meia-noite local
  const normalizedDate = localMidnight(toLocalYMD(date));

  const { startTime, endTime } = scheduleConfig;
  const dow = normalizedDate.getDay();
  const hasFixedDayOff = scheduleConfig.fixedDayOff != null && dow === scheduleConfig.fixedDayOff;

  // Horário efetivo: override por dia da semana tem prioridade sobre o padrão
  const dowOverride = scheduleConfig.weekdayTimeOverrides?.[dow];
  const effectiveStart = dowOverride?.startTime ?? startTime;
  const effectiveEnd = dowOverride?.endTime ?? endTime;

  if (scheduleType === '5x2') {
    const isWork = dow >= 1 && dow <= 5 && !hasFixedDayOff;
    return isWork
      ? { isWork: true, startTime: effectiveStart, endTime: effectiveEnd, source: 'calculated' }
      : { isWork: false, source: 'calculated' };
  }

  if (scheduleType === '12x36') {
    const refDate = resolveReferenceDate(scheduleConfig, staff.id, normalizedDate, checkpoints);
    if (!refDate) return { isWork: false, source: 'not-configured' };
    const ref = localMidnight(refDate);
    const diff = diffDays(normalizedDate, ref);
    const isWork = positiveModulo(diff, 2) === 0 && !hasFixedDayOff;
    return isWork
      ? { isWork: true, startTime: effectiveStart, endTime: effectiveEnd, source: 'calculated' }
      : { isWork: false, source: 'calculated' };
  }

  if (scheduleType === '6x1') {
    const refDate = resolveReferenceDate(scheduleConfig, staff.id, normalizedDate, checkpoints);
    
    // O dia de folga normal do 6x1 passa a ser controlado estritamente pelo fixedDayOff
    // A data de referência agora serve primariamente para o ciclo de domingos
    let isWork = !hasFixedDayOff;

    // Regra de domingo 6x1: trabalha 3, folga o 4º — ciclo baseado na data de referência
    if (dow === 0 && scheduleConfig.sundayOffCycle && refDate) {
      const ref = localMidnight(refDate);
      // Encontra o primeiro domingo >= data de referência do ciclo
      const refDow = ref.getDay(); // 0=Dom
      const daysToFirstSunday = refDow === 0 ? 0 : 7 - refDow;
      const firstRefSunday = new Date(ref.getTime() + daysToFirstSunday * 86_400_000);

      if (normalizedDate >= firstRefSunday) {
        // sundayIndex: 0, 1, 2 = trabalho; 3 = folga; 4, 5, 6 = trabalho; 7 = folga...
        const sundayIndex = diffDays(normalizedDate, firstRefSunday) / 7;
        if (positiveModulo(sundayIndex, 4) === 3) {
          isWork = false;
        }
      }
    }

    return isWork
      ? { isWork: true, startTime: effectiveStart, endTime: effectiveEnd, source: 'calculated' }
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
      return { isWork: false, source: 'calculated', hasOverride: true, reason: override.reason };
    }
    return {
      isWork: true,
      startTime: override.startTime.slice(0, 5),
      endTime: override.endTime?.slice(0, 5),
      source: 'calculated',
      hasOverride: true,
      reason: override.reason,
    };
  }

  const effective = getEffectiveConfig(staff, date);
  const effectiveStaffType = effective?.scheduleType;

  // Para custom, usa StaffSchedule por dayOfWeek
  if (!effectiveStaffType || effectiveStaffType === 'custom') {
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
