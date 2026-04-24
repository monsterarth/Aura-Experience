"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { ChevronRight, Search, X } from "lucide-react";
import { NotificationCenter } from "@/components/admin/NotificationCenter";

// ─── Route label map ──────────────────────────────────────────────────────────
const ROUTE_LABELS: Record<string, string> = {
  "stays":            "Estadias",
  "reception":        "Recepção",
  "reservation-map":  "Mapa de Reservas",
  "guests":           "Hóspedes",
  "comunicacao":      "Comunicação",
  "automations":      "Automações",
  "settings":         "Configurações",
  "calendario":       "Calendário",
  "governance":       "Governança",
  "kanban":           "Kanban",
  "maintenance":      "Manutenção",
  "concierge":        "Concierge",
  "eventos":          "Eventos",
  "mobile-apps":      "Apps Mobile",
  "cafe-salao":       "Café Salão",
  "kds":              "KDS",
  "food-and-beverage":"Gastronomia",
  "menu":             "Cardápio",
  "orders":           "Pedidos",
  "surveys":          "Pesquisas",
  "responses":        "Respostas",
  "edit":             "Editar",
  "new":              "Nova",
  "staff":            "Equipe",
  "escalas":          "Escalas",
  "cabins":           "Cabanas",
  "minibar":          "Frigobar",
  "core":             "Core",
  "dashboard":        "Dashboard",
  "properties":       "Propriedades",
  "structures":       "Estruturas",
  "bookings":         "Agendamentos",
  "hr":               "RH",
  "logs":             "Logs",
  "contacts":         "Contatos",
  "houseman":         "Mensageiro",
};

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function segmentLabel(seg: string): string {
  if (isUuid(seg)) return seg.slice(0, 8) + "…";
  return ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
function Breadcrumb() {
  const pathname = usePathname();
  const { currentProperty: property } = useProperty();

  // Strip /admin prefix, split into segments
  const stripped = pathname.replace(/^\/admin\/?/, "");
  const segments = stripped ? stripped.split("/") : [];

  // Build cumulative href list
  const crumbs: { label: string; href: string }[] = [];
  let acc = "/admin";
  for (const seg of segments) {
    acc = `${acc}/${seg}`;
    crumbs.push({ label: segmentLabel(seg), href: acc });
  }

  const propertyName = property?.name ?? "Aura";

  return (
    <div className="flex items-center gap-1 text-sm min-w-0 flex-1">
      {/* Property root */}
      <span
        className="font-semibold shrink-0"
        style={{ color: "rgba(255,255,255,0.85)" }}
      >
        {propertyName}
      </span>

      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.href}>
            <ChevronRight size={13} style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
            {isLast ? (
              <span
                className="truncate font-medium"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="shrink-0 font-medium transition-colors hover:text-white"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Search box ───────────────────────────────────────────────────────────────
// Quick navigation search — matches route labels and navigates
const SEARCH_ROUTES = [
  { label: "Estadias",          href: "/admin/stays" },
  { label: "Mapa de Reservas",  href: "/admin/reservation-map" },
  { label: "Hóspedes",          href: "/admin/guests" },
  { label: "Comunicação",       href: "/admin/comunicacao" },
  { label: "Calendário",        href: "/admin/calendario" },
  { label: "Agendamentos",      href: "/admin/core/structures/bookings" },
  { label: "Eventos",           href: "/admin/eventos" },
  { label: "Manutenção",        href: "/admin/maintenance" },
  { label: "Kanban Manutenção", href: "/admin/maintenance/kanban" },
  { label: "Governança",        href: "/admin/governance" },
  { label: "Kanban Governança", href: "/admin/governance/kanban" },
  { label: "Concierge",         href: "/admin/concierge" },
  { label: "Apps Mobile",       href: "/admin/mobile-apps" },
  { label: "Gastronomia",       href: "/admin/food-and-beverage/menu" },
  { label: "Garçom / KDS",      href: "/admin/cafe-salao" },
  { label: "Avaliações",        href: "/admin/surveys/responses" },
  { label: "Equipe",            href: "/admin/staff" },
  { label: "Escalas",           href: "/admin/escalas" },
  { label: "Cabanas",           href: "/admin/cabins" },
  { label: "Frigobar",          href: "/admin/cabins/minibar" },
  { label: "Estruturas",        href: "/admin/core/structures" },
  { label: "Catálogo Concierge",href: "/admin/core/concierge" },
  { label: "Pesquisas (NPS)",   href: "/admin/surveys" },
  { label: "Automações",        href: "/admin/comunicacao/automations/settings" },
  { label: "Logs de Auditoria", href: "/admin/logs" },
  { label: "Configurações",     href: "/admin/core/properties" },
  { label: "Propriedades",      href: "/admin/core/properties" },
  { label: "RH / Dashboard",    href: "/admin/hr" },
];

function SearchBox() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = query.length > 0
    ? SEARCH_ROUTES.filter(r => r.label.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const navigate = (href: string) => {
    router.push(href);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 10,
          padding: "6px 12px",
          width: open ? 220 : 160,
          transition: "width .2s ease",
        }}
      >
        <Search size={13} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar… ⌘K"
          style={{
            background: "none",
            border: "none",
            outline: "none",
            color: "rgba(255,255,255,0.8)",
            fontSize: 12,
            fontFamily: "inherit",
            flex: 1,
            minWidth: 0,
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "rgba(255,255,255,0.3)" }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 240,
            background: "#1c1c1c",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            zIndex: 100,
          }}
        >
          {results.map((r, i) => (
            <button
              key={r.href + i}
              onClick={() => navigate(r.href)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "9px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                color: "rgba(255,255,255,0.75)",
                fontSize: 12,
                fontFamily: "inherit",
                fontWeight: 500,
                transition: "background .12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AdminTopbar ──────────────────────────────────────────────────────────────
export function AdminTopbar() {
  return (
    <header
      style={{
        height: 48,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        background: "rgba(17,17,17,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      <Breadcrumb />

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <SearchBox />
        <NotificationCenter />
      </div>
    </header>
  );
}
