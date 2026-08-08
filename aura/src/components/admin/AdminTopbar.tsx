"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { ChevronRight, Search, X, Menu, Settings2 } from "lucide-react";
import { NotificationCenter } from "@/components/admin/NotificationCenter";
import { filterDomains } from "@/app/admin/configuracoes/_lib/catalog";
import { UserRole } from "@/types/aura";

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
  "core":             "Core",
  "dashboard":        "Dashboard",
  "properties":       "Propriedades",
  "structures":       "Estruturas",
  "bookings":         "Agendamentos",
  "manager":          "Gestão",
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
        style={{ color: "var(--foreground)" }}
      >
        {propertyName}
      </span>

      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.href}>
            <ChevronRight size={13} style={{ color: "var(--muted-foreground)", opacity: 0.4, flexShrink: 0 }} />
            {isLast ? (
              <span
                className="truncate font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="shrink-0 font-medium"
                style={{ color: "var(--muted-foreground)", opacity: 0.7 }}
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
//
// A busca casava o texto digitado só contra o RÓTULO de 27 rotas fixas. Quem
// procurava "prazo", "frete" ou "chave do WhatsApp" não achava nada — o rótulo
// da página nunca contém a palavra que a pessoa tem na cabeça.
//
// Agora ela busca em duas fontes: as PÁGINAS (com sinônimos) e o CATÁLOGO DE
// CONFIGURAÇÕES, que já carrega palavras-chave e o caminho até o controle. Assim
// "prazo" cai em "Prazos de casamento · Casamentos › Prazos", e não em nada.
interface SearchItem {
  label: string;
  href: string;
  /** Sinônimos e o nome que a pessoa usaria falando, não o nome da tela. */
  keywords?: string[];
  /** Linha de baixo do resultado: onde aquilo mora. */
  context?: string;
}

const SEARCH_ROUTES: SearchItem[] = [
  { label: "Estadias",          href: "/admin/stays", keywords: ["reserva", "hospedagem", "estadia", "booking"] },
  { label: "Mapa de Reservas",  href: "/admin/reservation-map", keywords: ["mapa", "reserva", "ocupação", "disponibilidade", "calendário"] },
  { label: "Hóspedes",          href: "/admin/guests", keywords: ["hóspede", "cliente", "cpf", "ficha"] },
  { label: "Comunicação",       href: "/admin/comunicacao", keywords: ["whatsapp", "conversa", "mensagem", "chat", "chatwoot"] },
  { label: "Calendário",        href: "/admin/calendario", keywords: ["agenda", "calendário"] },
  { label: "Agendamentos",      href: "/admin/estruturas/bookings", keywords: ["agendamento", "reserva de área", "estrutura", "sauna", "piscina"] },
  { label: "Eventos",           href: "/admin/eventos", keywords: ["evento", "programação"] },
  { label: "Casamentos",        href: "/admin/casamentos", keywords: ["casamento", "noivos", "lead"] },
  { label: "Tarifário",         href: "/admin/tarifario", keywords: ["tarifa", "preço", "orçamento", "diária"] },
  { label: "Manutenção",        href: "/admin/maintenance", keywords: ["manutenção", "conserto", "defeito", "os"] },
  { label: "Kanban Manutenção", href: "/admin/maintenance/kanban", keywords: ["manutenção", "kanban", "ordem"] },
  { label: "Governança",        href: "/admin/governance", keywords: ["governança", "faxina", "camareira", "limpeza"] },
  { label: "Kanban Governança", href: "/admin/governance/kanban", keywords: ["governança", "faxina", "kanban"] },
  { label: "Concierge",         href: "/admin/concierge", keywords: ["concierge", "pedido", "frigobar", "amenidade"] },
  { label: "Estoque",           href: "/admin/estoque", keywords: ["estoque", "compras", "produto", "movimentação"] },
  { label: "Compras",           href: "/admin/estoque/compras", keywords: ["compra", "nota fiscal", "nf", "fornecedor", "frete", "taxa de entrega", "desconto"] },
  { label: "Movimentações",     href: "/admin/estoque/movimentacoes", keywords: ["movimentação", "transferência", "entrada", "saída", "perda", "ajuste", "baixa"] },
  { label: "Inventário",        href: "/admin/estoque/inventario", keywords: ["inventário", "contagem", "acuracidade", "balanço"] },
  { label: "Patrimônio",        href: "/admin/patrimonio", keywords: ["patrimônio", "ativo", "equipamento", "plaqueta"] },
  { label: "Apps Mobile",       href: "/admin/mobile-apps", keywords: ["app", "celular", "camareira", "garçom"] },
  { label: "Gastronomia",       href: "/admin/food-and-beverage/menu", keywords: ["cardápio", "menu", "café", "restaurante"] },
  { label: "Garçom / KDS",      href: "/admin/cafe-salao", keywords: ["kds", "cozinha", "salão", "garçom", "café"] },
  { label: "Avaliações",        href: "/admin/surveys/responses", keywords: ["avaliação", "nps", "nota", "feedback"] },
  { label: "Equipe",            href: "/admin/staff", keywords: ["equipe", "funcionário", "cargo", "permissão"] },
  { label: "Escalas",           href: "/admin/escalas", keywords: ["escala", "turno", "folga", "jornada"] },
  { label: "Cabanas",           href: "/admin/cabins", keywords: ["cabana", "quarto", "acomodação", "wifi"] },
  { label: "Estruturas",        href: "/admin/estruturas", keywords: ["estrutura", "área", "espaço"] },
  { label: "Catálogo Concierge",href: "/admin/concierge", keywords: ["concierge", "catálogo", "item"] },
  { label: "Pesquisas (NPS)",   href: "/admin/surveys", keywords: ["pesquisa", "nps", "questionário"] },
  { label: "Logs de Auditoria", href: "/admin/logs", keywords: ["log", "auditoria", "histórico", "quem fez"] },
  { label: "Configurações",     href: "/admin/configuracoes", keywords: ["configuração", "ajuste", "setup", "parâmetro"] },
  { label: "Propriedades",      href: "/admin/core/properties", keywords: ["propriedade", "pousada", "workspace"] },
  { label: "RH / Dashboard",    href: "/admin/hr", keywords: ["rh", "gerência", "pessoas"] },
];

/** Todo termo digitado precisa aparecer em algum campo: "prazo casamento" acha, "prazo pizza" não. */
function matchesQuery(item: SearchItem, query: string): boolean {
  const haystack = [item.label, item.context ?? "", ...(item.keywords ?? [])].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(t => haystack.includes(t));
}

function SearchBox() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { userData } = useAuth();
  const { currentProperty } = useProperty();

  // Configurações entram na busca com as mesmas palavras-chave do hub, já
  // filtradas por cargo e por módulo ligado.
  const settingsItems: SearchItem[] = useMemo(() => {
    if (!userData) return [];
    return filterDomains({
      role: userData.role as UserRole,
      secondaryRoles: (userData.secondaryRoles ?? []) as UserRole[],
      property: currentProperty,
    }).flatMap(d => d.entries.map(e => ({
      label: e.title,
      href: e.href(currentProperty?.id ?? ""),
      keywords: [...e.keywords, d.label, e.description],
      context: e.where ?? "Configurações",
    })));
  }, [userData, currentProperty]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const pages = SEARCH_ROUTES.filter(r => matchesQuery(r, query));
    const settings = settingsItems.filter(r => matchesQuery(r, query));
    return [...pages, ...settings].slice(0, 8);
  }, [query, settingsItems]);

  useEffect(() => { setCursor(0); }, [query]);

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

  // Cmd/Ctrl+K abre; setas e Enter percorrem — sem isso o ⌘K obriga a pegar o mouse.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }
      if (e.key === "Escape") { setOpen(false); return; }
      if (!open || results.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => (c + 1) % results.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => (c - 1 + results.length) % results.length); }
      if (e.key === "Enter") { e.preventDefault(); navigate(results[cursor].href); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, cursor]);

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
          background: "var(--muted)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "6px 12px",
          width: open ? 220 : 160,
          transition: "width .2s ease",
        }}
      >
        <Search size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
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
            color: "var(--foreground)",
            fontSize: 12,
            fontFamily: "inherit",
            flex: 1,
            minWidth: 0,
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "var(--muted-foreground)" }}
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
            width: 320,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            zIndex: 100,
          }}
        >
          {results.map((r, i) => (
            <button
              key={r.href + i}
              onClick={() => navigate(r.href)}
              onMouseEnter={() => setCursor(i)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                padding: "9px 14px",
                background: i === cursor ? "var(--muted)" : "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--foreground)",
                fontSize: 12,
                fontFamily: "inherit",
                fontWeight: 500,
                transition: "background .12s",
              }}
            >
              {r.context
                ? <Settings2 size={12} style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: 2 }} />
                : <ChevronRight size={12} style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: 2 }} />}
              <span style={{ minWidth: 0 }}>
                {r.label}
                {/* Sem esta linha o resultado de configuração vira só um nome solto:
                    o valor está em dizer ONDE aquilo mora. */}
                {r.context && (
                  <span style={{ display: "block", fontSize: 10, fontWeight: 400, color: "var(--muted-foreground)", marginTop: 1 }}>
                    {r.context}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AdminTopbar ──────────────────────────────────────────────────────────────
export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header
      className="px-3 sm:px-5"
      style={{
        height: 48,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "color-mix(in srgb, var(--card) 85%, transparent)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Mobile menu trigger — opens the sidebar drawer */}
      <button
        onClick={onMenuClick}
        aria-label="Abrir menu"
        className="lg:hidden flex items-center justify-center -ml-1 mr-1 p-1.5 rounded-lg shrink-0"
        style={{ color: "var(--foreground)" }}
      >
        <Menu size={20} />
      </button>

      <Breadcrumb />

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* Quick-nav search — hidden on phones to leave room for the bell */}
        <div className="hidden sm:block">
          <SearchBox />
        </div>
        <NotificationCenter />
      </div>
    </header>
  );
}
