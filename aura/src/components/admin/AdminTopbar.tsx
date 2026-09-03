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
import { T } from "@/lib/admin-tokens";
import { IconButton } from "@/components/aura/Button";
import { Dialog } from "@/components/aura/Dialog";
import { EnvBadge } from "@/components/admin/EnvBadge";
import { TimeClockButton } from "@/components/admin/TimeClockButton";

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
  "rh":               "Gente",
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
  "hr":               "Painel",
  "estoque":          "Estoque",
  "produtos":         "Produtos",
  "movimentacoes":    "Movimentações",
  "historico":        "Histórico",
  "compras":          "Compras",
  "fornecedores":     "Fornecedores",
  "inventario":       "Inventário",
  "perdas":           "Perdas",
  "relatorios":       "Relatórios",
  "patrimonio":       "Patrimônio",
  "casamentos":       "Casamentos",
  "comercial":        "Comercial",
  "reservas":         "Pipeline",
  "tarifario":        "Tarifário",
  "configuracoes":    "Configurações",
  "perfil":           "Perfil",
  "estruturas":       "Estruturas",
  "changelog":        "Changelog",
  "marketing":        "Marketing",
};

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function segmentLabel(seg: string): string {
  if (isUuid(seg)) return seg.slice(0, 8) + "…";
  return ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
// No celular só o último nível aparece (os anteriores e o nome da propriedade
// somem via CSS) — antes 4 níveis estouravam 375px e empurravam o sino.
function Breadcrumb() {
  const pathname = usePathname();
  const { currentProperty: property } = useProperty();

  const stripped = pathname.replace(/^\/admin\/?/, "");
  const segments = stripped ? stripped.split("/") : [];

  const crumbs: { label: string; href: string }[] = [];
  let acc = "/admin";
  for (const seg of segments) {
    acc = `${acc}/${seg}`;
    crumbs.push({ label: segmentLabel(seg), href: acc });
  }

  const propertyName = property?.name ?? "Aura";

  return (
    <div className="flex items-center gap-1 text-sm min-w-0 flex-1">
      <span className="font-semibold shrink-0 hidden sm:inline" style={{ color: T.text }}>
        {propertyName}
      </span>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.href}>
            <ChevronRight size={13} className={isLast ? "hidden sm:block" : "hidden sm:block"} style={{ color: T.muted2, flexShrink: 0 }} />
            {isLast ? (
              <span className="truncate font-semibold" style={{ color: isLast && crumbs.length === 1 ? T.text : T.muted }}>
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="shrink-0 font-medium hidden sm:inline" style={{ color: T.muted2 }}>
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
// Busca em duas fontes: as PÁGINAS (com sinônimos) e o CATÁLOGO DE CONFIGURAÇÕES
// (palavras-chave + caminho até o controle). "prazo" cai em "Prazos de casamento ·
// Casamentos › Prazos". `inline` = versão do sheet do celular (lista embaixo,
// largura total) em vez do dropdown absoluto do desktop.
interface SearchItem {
  label: string;
  href: string;
  keywords?: string[];
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
  { label: "Tarifário",         href: "/admin/tarifario", keywords: ["tarifa", "preço", "diária", "tabela", "flutuação"] },
  { label: "Hsystem",           href: "/admin/hsystem", keywords: ["hsystem", "hunit", "hbook", "hprice", "channel", "canal", "ota", "integração", "disponibilidade"] },
  { label: "Pipeline Estadias", href: "/admin/comercial/reservas", keywords: ["orçamento", "cotação", "funil", "lead", "pipeline"] },
  { label: "Manutenção",        href: "/admin/maintenance", keywords: ["manutenção", "conserto", "defeito", "os"] },
  { label: "Kanban Manutenção", href: "/admin/maintenance/kanban", keywords: ["manutenção", "kanban", "ordem"] },
  { label: "Governança",        href: "/admin/governance", keywords: ["governança", "faxina", "camareira", "limpeza"] },
  { label: "Kanban Governança", href: "/admin/governance/kanban", keywords: ["governança", "faxina", "kanban"] },
  { label: "Concierge",         href: "/admin/concierge", keywords: ["concierge", "pedido", "frigobar", "amenidade"] },
  { label: "Guarita",           href: "/admin/guarita", keywords: ["guarita", "estacionamento", "porteiro", "placa", "veículo", "carro", "tarifa"] },
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
  { label: "Gente",             href: "/admin/rh", keywords: ["gente", "rh", "escala", "turno", "folga", "jornada", "ferias", "férias", "atestado", "ausencia", "ausência"] },
  { label: "Cabanas",           href: "/admin/cabins", keywords: ["cabana", "quarto", "acomodação", "wifi"] },
  { label: "Estruturas",        href: "/admin/estruturas", keywords: ["estrutura", "área", "espaço"] },
  { label: "Catálogo Concierge",href: "/admin/concierge", keywords: ["concierge", "catálogo", "item"] },
  { label: "Pesquisas (NPS)",   href: "/admin/surveys", keywords: ["pesquisa", "nps", "questionário"] },
  { label: "Logs de Auditoria", href: "/admin/logs", keywords: ["log", "auditoria", "histórico", "quem fez"] },
  { label: "Configurações",     href: "/admin/configuracoes", keywords: ["configuração", "ajuste", "setup", "parâmetro"] },
  { label: "Propriedades",      href: "/admin/core/properties", keywords: ["propriedade", "pousada", "workspace"] },
  { label: "RH / Dashboard",    href: "/admin/hr", keywords: ["rh", "gerência", "pessoas", "painel"] },
];

/** Todo termo digitado precisa aparecer em algum campo: "prazo casamento" acha, "prazo pizza" não. */
function matchesQuery(item: SearchItem, query: string): boolean {
  const haystack = [item.label, item.context ?? "", ...(item.keywords ?? [])].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(t => haystack.includes(t));
}

function SearchBox({ inline = false, onNavigate }: { inline?: boolean; onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { userData } = useAuth();
  const { currentProperty } = useProperty();

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

  // Fecha ao clicar fora (só no dropdown do desktop)
  useEffect(() => {
    if (inline) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [inline]);

  // Cmd/Ctrl+K abre; setas e Enter percorrem.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }
      if (e.key === "Escape" && !inline) { setOpen(false); return; }
      if ((!open && !inline) || results.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => (c + 1) % results.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => (c - 1 + results.length) % results.length); }
      if (e.key === "Enter" && document.activeElement === inputRef.current) { e.preventDefault(); navigate(results[cursor].href); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, cursor, inline]);

  useEffect(() => { if (inline) inputRef.current?.focus(); }, [inline]);

  const navigate = (href: string) => {
    router.push(href);
    setQuery("");
    setOpen(false);
    onNavigate?.();
  };

  const list = (
    <>
      {results.map((r, i) => (
        <button
          key={r.href + i}
          onClick={() => navigate(r.href)}
          onMouseEnter={() => setCursor(i)}
          className="ak-press"
          style={{
            display: "flex", alignItems: "flex-start", gap: 10, width: "100%",
            padding: inline ? "12px 14px" : "9px 14px",
            background: i === cursor ? T.glass2 : "none",
            border: "none", cursor: "pointer", textAlign: "left",
            color: T.text, fontSize: inline ? 14 : 12, fontFamily: "inherit", fontWeight: 500,
            borderRadius: inline ? 10 : 0,
          }}
        >
          {r.context
            ? <Settings2 size={13} style={{ color: T.muted, flexShrink: 0, marginTop: 2 }} />
            : <ChevronRight size={13} style={{ color: T.muted, flexShrink: 0, marginTop: 2 }} />}
          <span style={{ minWidth: 0 }}>
            {r.label}
            {r.context && (
              <span style={{ display: "block", fontSize: inline ? 12 : 10, fontWeight: 400, color: T.muted, marginTop: 1 }}>
                {r.context}
              </span>
            )}
          </span>
        </button>
      ))}
    </>
  );

  return (
    <div ref={wrapRef} style={{ position: "relative", width: inline ? "100%" : undefined }}>
      <div
        className="ak-search"
        data-full={inline || undefined}
        style={!inline ? { width: open ? 240 : 170, transition: "width .2s var(--ease-std)", height: 34, flex: "none" } : undefined}
      >
        <Search size={13} style={{ color: T.muted, flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={inline ? "Buscar páginas e configurações…" : "Buscar… ⌘K"}
          className="ak-search__input"
          style={!inline ? { fontSize: 12 } : undefined}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            aria-label="Limpar"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", color: T.muted }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {inline && query.trim() && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {results.length > 0 ? list : <div style={{ padding: "20px 8px", fontSize: 13, color: T.muted, textAlign: "center" }}>Nada encontrado para “{query}”.</div>}
        </div>
      )}

      {!inline && open && results.length > 0 && (
        <div
          className="ak-menu"
          style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 320, padding: 4, animation: "none" }}
        >
          {list}
        </div>
      )}
    </div>
  );
}

// ─── AdminTopbar ──────────────────────────────────────────────────────────────
export function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header
      className="px-2 sm:px-4"
      style={{
        minHeight: 48,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingTop: "env(safe-area-inset-top, 0px)",
        background: `color-mix(in srgb, ${T.card} 85%, transparent)`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid ${T.border}`,
        position: "relative",
        zIndex: "var(--z-topbar)" as unknown as number,
      }}
    >
      {/* Hambúrguer (44px) — abre o drawer da sidebar abaixo de lg */}
      <span className="inline-flex lg:hidden">
        <IconButton icon={Menu} label="Abrir menu" size="lg" onClick={onMenuClick} />
      </span>

      <Breadcrumb />

      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {/* No celular a sidebar é gaveta: sem isto, o aviso de ambiente ficaria escondido
            atrás do hambúrguer justamente em quem mais alterna entre os dois. */}
        <span className="inline-flex lg:hidden" style={{ marginRight: 4 }}>
          <EnvBadge variant="compact" />
        </span>
        <div className="hidden sm:block">
          <SearchBox />
        </div>
        <span className="inline-flex sm:hidden">
          <IconButton icon={Search} label="Buscar" size="lg" onClick={() => setSearchOpen(true)} />
        </span>
        {/* Só aparece para quem bate ponto pelo Aura — o componente decide sozinho. */}
        <TimeClockButton />
        <NotificationCenter />
      </div>

      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} presentation="sheet" size="md" title="Buscar" bodyPad={12}>
        <SearchBox inline onNavigate={() => setSearchOpen(false)} />
      </Dialog>
    </header>
  );
}
