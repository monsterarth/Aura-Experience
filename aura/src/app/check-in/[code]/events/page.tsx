"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { PropertyService } from "@/services/property-service";
import { EventService } from "@/services/event-service";
import { Stay, Property, Event } from "@/types/aura";
import {
  Loader2, ArrowLeft, MapPin, Clock, ExternalLink, X,
  Ticket, CalendarDays, Tag, Globe, Building2, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==========================================
// TRANSLATIONS
// ==========================================

const t = {
  pt: {
    title: "Eventos",
    subtitle: "Na região e na pousada",
    back: "Voltar",
    all: "Todos",
    today: "Hoje",
    week: "Esta Semana",
    local: "Na Pousada",
    external: "Externo",
    free: "Gratuito",
    learnMore: "Saber mais",
    close: "Fechar",
    openMaps: "Ver no Maps",
    openLink: "Ver ingresso / site",
    empty: "Nenhum evento por enquanto",
    emptyDesc: "Fique de olho! Novidades chegam em breve.",
    location: "Local",
    price: "Entrada",
    date: "Data",
    time: "Horário",
    search: "Buscar evento...",
    multiDay: "Evento de múltiplos dias",
  },
  en: {
    title: "Events",
    subtitle: "In the area & at the resort",
    back: "Back",
    all: "All",
    today: "Today",
    week: "This Week",
    local: "At the Resort",
    external: "Nearby",
    free: "Free",
    learnMore: "Learn more",
    close: "Close",
    openMaps: "View on Maps",
    openLink: "Get tickets / visit site",
    empty: "No events right now",
    emptyDesc: "Stay tuned! New events coming soon.",
    location: "Location",
    price: "Entry",
    date: "Date",
    time: "Time",
    search: "Search events...",
    multiDay: "Multi-day event",
  },
  es: {
    title: "Eventos",
    subtitle: "En la zona y el hotel",
    back: "Volver",
    all: "Todos",
    today: "Hoy",
    week: "Esta Semana",
    local: "En el Hotel",
    external: "Externos",
    free: "Gratis",
    learnMore: "Saber más",
    close: "Cerrar",
    openMaps: "Ver en Maps",
    openLink: "Entradas / sitio web",
    empty: "Sin eventos por ahora",
    emptyDesc: "¡Atento! Novedades próximamente.",
    location: "Lugar",
    price: "Entrada",
    date: "Fecha",
    time: "Horario",
    search: "Buscar evento...",
    multiDay: "Evento de varios días",
  },
};

// ==========================================
// HELPERS
// ==========================================

function formatEventDate(startDate: string, endDate?: string, lang: "pt" | "en" | "es" = "pt"): string {
  if (!startDate) return "";
  const [y, m, d] = startDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  const locales = { pt: "pt-BR", en: "en-US", es: "es-ES" };
  const locale = locales[lang];

  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  const formatted = date.toLocaleDateString(locale, options);

  if (endDate && endDate !== startDate) {
    const [y2, m2, d2] = endDate.split("-").map(Number);
    const date2 = new Date(y2, m2 - 1, d2);
    return `${formatted} – ${date2.toLocaleDateString(locale, options)}`;
  }

  return formatted;
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === d;
}

function isThisWeek(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const eventDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  return eventDate >= today && eventDate <= nextWeek;
}

function getEventTitle(event: Event, lang: "pt" | "en" | "es"): string {
  if (lang === "en" && event.titleEn) return event.titleEn;
  if (lang === "es" && event.titleEs) return event.titleEs;
  return event.title;
}

function getEventDescription(event: Event, lang: "pt" | "en" | "es"): string | undefined {
  if (lang === "en" && event.descriptionEn) return event.descriptionEn;
  if (lang === "es" && event.descriptionEs) return event.descriptionEs;
  return event.description;
}

function getPriceText(event: Event, tr: typeof t["pt"]): string {
  if (event.priceDescription) return event.priceDescription;
  if (!event.price || event.price === 0) return tr.free;
  return `R$ ${event.price.toFixed(2).replace(".", ",")}`;
}

// ==========================================
// MAIN PAGE
// ==========================================

function EventsContent() {
  const { code } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [stay, setStay] = useState<Stay | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [lang, setLang] = useState<"pt" | "en" | "es">("pt");
  const [filter, setFilter] = useState<"all" | "today" | "week" | "local" | "external">("all");
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const tr = t[lang];

  useEffect(() => {
    async function init() {
      if (!code) return;
      try {
        const stays = await StayService.getStaysByAccessCode(code as string);
        if (!stays || stays.length === 0) { router.replace(`/check-in/login`); return; }

        const firstStay = stays[0] as Stay;
        setStay(firstStay);

        const [prop, eventsData] = await Promise.all([
          PropertyService.getPropertyById(firstStay.propertyId),
          EventService.getPublishedEvents(firstStay.propertyId, new Date().toISOString().split("T")[0]),
        ]);

        setProperty(prop as Property);
        setEvents(eventsData);

        // Detect language
        try {
          const stayData = await StayService.getStayWithGuestAndCabin(firstStay.propertyId, firstStay.id);
          const savedLang = stayData?.guest?.preferredLanguage;
          if (savedLang && ["pt", "en", "es"].includes(savedLang)) {
            setLang(savedLang as "pt" | "en" | "es");
          } else {
            const bl = navigator.language.slice(0, 2);
            if (bl === "es") setLang("es");
            else if (bl === "en") setLang("en");
          }
        } catch { /* silently ignore */ }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [code, router]);

  const filteredEvents = useMemo(() => {
    let list = events;

    if (filter === "today") list = list.filter((e) => isToday(e.startDate));
    else if (filter === "week") list = list.filter((e) => isThisWeek(e.startDate));
    else if (filter === "local") list = list.filter((e) => e.type === "local");
    else if (filter === "external") list = list.filter((e) => e.type === "external");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        getEventTitle(e, lang).toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        getEventDescription(e, lang)?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [events, filter, search, lang]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  const FILTERS = [
    { key: "all" as const, label: tr.all },
    { key: "today" as const, label: tr.today },
    { key: "week" as const, label: tr.week },
    { key: "local" as const, label: tr.local },
    { key: "external" as const, label: tr.external },
  ];

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 font-sans pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black uppercase tracking-tight">{tr.title}</h1>
          <p className="text-xs text-slate-400 leading-none mt-0.5">{tr.subtitle}</p>
        </div>
        {property?.logoUrl && (
          <img src={property.logoUrl} alt={property.name} className="h-7 w-auto object-contain opacity-70" />
        )}
      </div>

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr.search}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-blue-300 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-2 overflow-x-auto">
        <div className="flex gap-2 w-max">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wide whitespace-nowrap transition-all",
                filter === f.key
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events list */}
      <div className="px-4 pt-2 space-y-4">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
              <Ticket size={36} className="text-slate-300" />
            </div>
            <p className="font-black text-lg text-slate-700">{tr.empty}</p>
            <p className="text-sm text-slate-400 max-w-xs">{tr.emptyDesc}</p>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              lang={lang}
              tr={tr}
              onClick={() => setSelectedEvent(event)}
            />
          ))
        )}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-h-[90dvh] bg-white rounded-t-3xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">

            {/* Event image */}
            {selectedEvent.imageUrl ? (
              <div className="relative h-52 w-full flex-shrink-0">
                <img src={selectedEvent.imageUrl} alt={getEventTitle(selectedEvent, lang)} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="absolute top-4 right-4 p-2 bg-black/30 backdrop-blur-sm rounded-full text-white hover:bg-black/50 transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="absolute bottom-4 left-4 right-4">
                  <EventTypeBadge event={selectedEvent} tr={tr} />
                  <h2 className="text-2xl font-black text-white mt-1 leading-tight">
                    {getEventTitle(selectedEvent, lang)}
                  </h2>
                </div>
              </div>
            ) : (
              <div className="p-5 border-b border-slate-100 flex items-start justify-between">
                <div>
                  <EventTypeBadge event={selectedEvent} tr={tr} />
                  <h2 className="text-2xl font-black text-slate-900 mt-1 leading-tight">
                    {getEventTitle(selectedEvent, lang)}
                  </h2>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 flex-shrink-0">
                  <X size={20} />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Description */}
              {getEventDescription(selectedEvent, lang) && (
                <p className="text-slate-600 text-sm leading-relaxed">
                  {getEventDescription(selectedEvent, lang)}
                </p>
              )}

              {/* Details grid */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <CalendarDays size={16} className="text-slate-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tr.date}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">
                      {formatEventDate(selectedEvent.startDate, selectedEvent.endDate, lang)}
                    </p>
                    {selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.startDate && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{tr.multiDay}</p>
                    )}
                  </div>
                </div>

                {selectedEvent.startTime && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Clock size={16} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tr.time}</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">
                        {selectedEvent.startTime}{selectedEvent.endTime ? ` – ${selectedEvent.endTime}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                {selectedEvent.location && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <MapPin size={16} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tr.location}</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{selectedEvent.location}</p>
                      {selectedEvent.locationUrl && (
                        <a
                          href={selectedEvent.locationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5"
                        >
                          <MapPin size={10} /> {tr.openMaps}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Tag size={16} className="text-slate-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tr.price}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{getPriceText(selectedEvent, tr)}</p>
                  </div>
                </div>
              </div>

              {/* External link */}
              {selectedEvent.externalUrl && (
                <a
                  href={selectedEvent.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 bg-slate-900 text-white font-black uppercase text-xs tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg"
                >
                  <ExternalLink size={16} /> {tr.openLink}
                </a>
              )}

              {/* Close button */}
              <button
                onClick={() => setSelectedEvent(null)}
                className="w-full py-3 border border-slate-200 text-slate-500 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-colors"
              >
                {tr.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

function EventTypeBadge({ event, tr }: { event: Event; tr: typeof t["pt"] }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
      event.type === "local"
        ? "bg-blue-500/20 text-blue-600"
        : "bg-purple-500/20 text-purple-600"
    )}>
      {event.type === "local" ? <Building2 size={9} /> : <Globe size={9} />}
      {event.type === "local" ? tr.local : tr.external}
    </span>
  );
}

function EventCard({
  event,
  lang,
  tr,
  onClick,
}: {
  event: Event;
  lang: "pt" | "en" | "es";
  tr: typeof t["pt"];
  onClick: () => void;
}) {
  const todayBadge = isToday(event.startDate);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-slate-100 active:scale-[0.99]"
    >
      {/* Image */}
      {event.imageUrl ? (
        <div className="relative w-full aspect-video overflow-hidden">
          <img src={event.imageUrl} alt={getEventTitle(event, lang)} className="w-full h-full object-cover" />
          <div className="absolute top-3 left-3 flex gap-1.5">
            <EventTypeBadge event={event} tr={tr} />
            {todayBadge && (
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                Hoje
              </span>
            )}
            {event.featured && (
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-yellow-400 text-slate-900">
                ★ Destaque
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full h-20 bg-slate-100 flex items-center justify-center relative">
          <Ticket size={32} className="text-slate-300" />
          <div className="absolute top-3 left-3 flex gap-1.5">
            <EventTypeBadge event={event} tr={tr} />
            {todayBadge && (
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500 text-white">Hoje</span>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-2">
        <h3 className="font-black text-base text-slate-900 leading-tight">
          {getEventTitle(event, lang)}
        </h3>

        {getEventDescription(event, lang) && (
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {getEventDescription(event, lang)}
          </p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <CalendarDays size={11} />
            {formatEventDate(event.startDate, event.endDate, lang)}
          </span>
          {event.startTime && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={11} />
              {event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}
            </span>
          )}
          {event.location && (
            <span className="text-xs text-slate-400 flex items-center gap-1 truncate max-w-40">
              <MapPin size={11} />
              {event.location}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm font-black text-slate-700">
            {getPriceText(event, tr)}
          </span>
          <span className="text-xs font-black text-slate-900 flex items-center gap-1">
            {tr.learnMore} →
          </span>
        </div>
      </div>
    </button>
  );
}

// ==========================================
// EXPORT WITH SUSPENSE
// ==========================================

export default function EventsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    }>
      <EventsContent />
    </Suspense>
  );
}
