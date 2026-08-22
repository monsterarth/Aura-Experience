// Constantes e helpers puros do módulo de Eventos.
import type { LucideIcon } from "lucide-react";
import { Zap, Utensils, Dumbbell, Palette, Moon, Briefcase, Heart, Cake, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import type { Event, EventCategory, EventStatus, EventType } from "@/types/aura";
import type { Tone } from "@/lib/admin-tokens";

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

/** Categorias oferecidas no formulário (casamento/corporativo têm módulos próprios). */
export const FORM_CATEGORIES = (Object.keys(CATEGORY_LABELS) as EventCategory[]).filter(c => c !== "wedding" && c !== "corporate");

export const emptyForm = (): Partial<Event> => ({
  title: "", titleEn: "", titleEs: "", description: "", descriptionEn: "", descriptionEs: "",
  type: "external", category: "entertainment", status: "draft", visibility: "all_guests", featured: false,
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

/** Eventos (não cancelados) por data no mês: no início e, se cair noutro dia do mês, no fim. */
export function groupEventsByDate(events: Event[], month: Date): Record<string, Event[]> {
  const map: Record<string, Event[]> = {};
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  events.filter(e => e.status !== "cancelled").forEach(e => {
    const start = e.startDate;
    const end = e.endDate || e.startDate;
    if (start.startsWith(prefix)) (map[start] ||= []).push(e);
    if (end !== start && end.startsWith(prefix)) (map[end] ||= []).push(e);
  });
  return map;
}
