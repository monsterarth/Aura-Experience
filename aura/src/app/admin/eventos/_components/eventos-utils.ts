// Constantes e helpers puros do módulo de Eventos.
import type { LucideIcon } from "lucide-react";
import { Zap, Utensils, Dumbbell, Palette, Moon, Briefcase, Heart, Cake, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import type { Event, EventCategory, EventStatus, EventType } from "@/types/aura";
import type { Tone } from "@/lib/admin-tokens";
import { eventDaysInMonth } from "@/lib/event-dates";

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  entertainment: "Entretenimento", gastronomy: "Gastronomia", sports: "Esportes", culture: "Cultura",
  nightlife: "Vida Noturna", corporate: "Corporativo", wedding: "Casamento", birthday: "Aniversário", other: "Outro",
};
export const CATEGORY_ICONS: Record<EventCategory, LucideIcon> = {
  entertainment: Zap, gastronomy: Utensils, sports: Dumbbell, culture: Palette, nightlife: Moon,
  corporate: Briefcase, wedding: Heart, birthday: Cake, other: HelpCircle,
};
export const TYPE_LABELS: Record<EventType, string> = { local: "Na Pousada", external: "Externo", private: "Privado" };
export const STATUS_LABELS: Record<EventStatus, string> = { draft: "Rascunho", published: "Publicado", cancelled: "Cancelado", finished: "Encerrado" };
export const STATUS_TONE: Record<EventStatus, Tone> = { draft: "amber", published: "green", cancelled: "red", finished: "blue" };
export const TYPE_TONE: Record<EventType, Tone> = { local: "brand", external: "violet", private: "amber" };
export const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Acesso com pouso seguro. Os mapas acima são `Record<union, …>`, mas o banco
// não tem CHECK: a coluna é `text` livre e 8 linhas em produção carregam
// `type='internal'`, que não existe no union. Indexar cru devolvia `undefined`
// e derrubava a tela inteira (o ícone de categoria só é renderizado quando o
// evento não tem imagem — por isso o bug ficou escondido). Nunca indexe os
// mapas direto; use estes.
export const catIcon = (c: string): LucideIcon => CATEGORY_ICONS[c as EventCategory] ?? HelpCircle;
export const catLabel = (c: string): string => CATEGORY_LABELS[c as EventCategory] ?? c;
export const typeLabel = (t: string): string => TYPE_LABELS[t as EventType] ?? t;
export const typeTone = (t: string): Tone => TYPE_TONE[t as EventType] ?? "neutral";
export const statusLabel = (s: string): string => STATUS_LABELS[s as EventStatus] ?? s;
export const statusTone = (s: string): Tone => STATUS_TONE[s as EventStatus] ?? "neutral";

/** Categorias oferecidas no formulário (casamento/corporativo têm módulos próprios). */
export const FORM_CATEGORIES = (Object.keys(CATEGORY_LABELS) as EventCategory[]).filter(c => c !== "wedding" && c !== "corporate");

export const emptyForm = (): Partial<Event> => ({
  title: "", titleEn: "", titleEs: "", description: "", descriptionEn: "", descriptionEs: "",
  type: "local", category: "entertainment", status: "draft", visibility: "all_guests", featured: false,
  startDate: format(new Date(), "yyyy-MM-dd"), endDate: "", startTime: "", endTime: "",
  location: "", locationUrl: "", price: undefined, priceDescription: "", maxCapacity: undefined, imageUrl: "", externalUrl: "",
});

export function formatDatePT(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${day} ${months[parseInt(month) - 1]} ${year}`;
}

/** Células do mês (segunda-feira primeiro), null = vazio antes do dia 1. */
export function buildCalendarGrid(month: Date): (number | null)[] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDayOfWeek = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  return cells;
}

/**
 * Eventos (não cancelados) por data no mês — em TODOS os dias que o evento
 * cobre. Antes marcava só o primeiro e o último: um evento de quinta a domingo
 * aparecia na quinta e no domingo, e o calendário mostrava sexta e sábado
 * vazios.
 */
export function groupEventsByDate(events: Event[], month: Date): Record<string, Event[]> {
  const map: Record<string, Event[]> = {};
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  events.filter(e => e.status !== "cancelled").forEach(e => {
    for (const day of eventDaysInMonth(e, prefix)) (map[day] ||= []).push(e);
  });
  return map;
}
