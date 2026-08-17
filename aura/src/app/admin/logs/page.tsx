// src/app/admin/logs/page.tsx
// Auditoria com agrupamento inteligente: rajadas do mesmo autor/ação (lotes de
// estoque, check-outs em série, conferências de governança…) viram UMA linha
// com "ver detalhes" — nada se perde, o banco continua granular.
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { AuditLog } from "@/types/aura";
import { T } from "@/lib/admin-tokens";
import {
  Search, Filter, Clock, RefreshCw, ChevronDown, ChevronRight,
  FileText, Bot, ExternalLink, Layers,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Deep-link map: entity → admin route ────────────────────────────────────
const ENTITY_LINKS: Partial<Record<string, string>> = {
  FB_ORDER: '/admin/food-and-beverage/orders',
  CONCIERGE: '/admin/concierge',
};

// ─── Action label map ─────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Criado",
  UPDATE: "Atualizado",
  DELETE: "Excluído",
  MESSAGE_SENT: "Mensagem enviada",
  MESSAGE_FAILED: "Mensagem falhou",
  MESSAGE_RESENT: "Mensagem reenviada",
  MESSAGE_MANUAL_SEND: "Envio manual",
  CHECKIN: "Check-in",
  CHECKOUT: "Check-out",
  PRE_CHECKIN: "Pré check-in",
  USER_CREATE: "Usuário criado",
  USER_UPDATE: "Usuário atualizado",
  CREATE_STAY: "Estadia criada",
  COMPLETE_STAY: "Estadia concluída",
  STAY_GROUP_CREATE: "Grupo de estadias criado",
  CABIN_CREATED: "Cabana criada",
  CABIN_UPDATED: "Cabana atualizada",
  CABIN_DELETED: "Cabana excluída",
  CONTACT_UPDATED: "Contato atualizado",
  CONTACT_DELETED: "Contato excluído",
  CONTACT_PHONE_MIGRATED: "Telefone migrado",
  STRUCTURE_CREATED: "Estrutura criada",
  STRUCTURE_UPDATED: "Estrutura atualizada",
  STRUCTURE_DELETED: "Estrutura excluída",
  STRUCTURE_RELEASED: "Estrutura liberada",
  STRUCTURE_BLOCKED: "Estrutura bloqueada",
  STRUCTURE_BOOKING_CREATED: "Agendamento criado",
  STRUCTURE_BOOKING_STATUS_CHANGED: "Agendamento atualizado",
  STRUCTURE_REVIEW_LOW: "Avaliação baixa",
  EVENT_CREATED: "Evento criado",
  EVENT_UPDATED: "Evento atualizado",
  EVENT_DELETED: "Evento excluído",
  EVENT_PUBLISHED: "Evento publicado",
  CONCIERGE_REQUESTED: "Pedido de concierge",
  CONCIERGE_DELIVERED: "Concierge entregue",
  CONCIERGE_RETURNED: "Concierge devolvido",
  CONCIERGE_LOST: "Concierge extraviado",
  FB_ORDER_CREATED: "Pedido F&B criado",
  FB_ORDER_STATUS_CHANGED: "Pedido F&B atualizado",
  TEMPLATE_SAVED: "Template salvo",
  TEMPLATE_DELETED: "Template excluído",
  AUTOMATION_SAVED: "Automação salva",
  AUTOMATION_TOGGLED: "Automação alternada",
  BREAKFAST_OPENED: "Café da manhã aberto",
  BREAKFAST_CHECKIN: "Check-in no café",
  BREAKFAST_GUEST_LEFT: "Saída do café",
  REASSIGN_GUEST: "Hóspede reatribuído",
  STOCK_ENTRY: "Entrada de estoque",
  STOCK_EXIT: "Saída de estoque",
  STOCK_TRANSFER: "Transferência de estoque",
  STOCK_ADJUSTMENT: "Ajuste de estoque",
  STOCK_LOSS: "Perda de estoque",
  PURCHASE_CREATED: "Compra criada",
  PURCHASE_RECEIVED: "Compra recebida",
  PURCHASE_CANCELLED: "Compra cancelada",
  SUPPLIER_CREATED: "Fornecedor criado",
  SUPPLIER_UPDATED: "Fornecedor atualizado",
  SUPPLIER_DELETED: "Fornecedor excluído",
  ASSET_CREATED: "Bem criado",
  ASSET_UPDATED: "Bem atualizado",
  ASSET_DISPOSED: "Bem baixado",
  ASSET_DELETED: "Bem excluído",
  ASSET_REINSTATED: "Bem reativado",
  ASSET_MOVED: "Bem movido",
  ASSET_CUSTODY_CHANGED: "Custódia alterada",
  ASSET_PUBLIC_REPORT: "Chamado público",
  ASSET_INVENTORY_OPENED: "Inventário patrimonial aberto",
  ASSET_INVENTORY_CLOSED: "Inventário patrimonial fechado",
  INVENTORY_OPENED: "Inventário aberto",
  INVENTORY_CLOSED: "Inventário fechado",
  RATE_TABLE_DELETED: "Tabela de tarifas excluída",
  RATE_TABLE_ARCHIVED: "Tabela de tarifas arquivada",
  RATE_TABLE_RESTORED: "Tabela de tarifas restaurada",
  RATE_SIT_IMPORTED: "SIT importado",
  RATE_FLUCTUATION_SAVED: "Flutuação salva",
  RATE_FLUCTUATION_DELETED: "Flutuação excluída",
  RATE_QUOTE_LINKED: "Cotação vinculada",
  LODGING_PAUSED: "Diárias pausadas",
  LODGING_RESUMED: "Diárias retomadas",
  LODGING_NIGHT_OVERRIDDEN: "Diária ajustada",
  WEDDING_AUTO_COMPLETED: "Casamento realizado (auto)",
  WEDDING_LOST: "Casamento perdido",
  WEDDING_FOLLOW_UP: "Follow-up de casamento",
  CRON_DAILY_AUTOMATIONS: "Rotina: automações",
  CRON_DAILY_HOUSEKEEPING: "Rotina: governança",
  CRON_BREAKFAST_ATTENDANCE: "Rotina: café da manhã",
  CRON_HOUSEKEEPING_ROUTINES: "Rotina: faxinas",
  CRON_MAINTENANCE: "Rotina: manutenção",
  CRON_PROCESS_MESSAGES: "Rotina: mensagens",
  CRON_EVENING_REVALIDATION: "Rotina: revalidação",
  CRON_STOCK_LOW: "Rotina: estoque baixo",
  CRON_STOCK_EXPIRY: "Rotina: validades",
  CRON_ASSET_DEPRECIATION: "Rotina: depreciação",
  CRON_DAILY_LODGING: "Rotina: diárias",
  CRON_CRM_STATUS: "Rotina: CRM",
};

const ENTITY_LABELS: Record<string, string> = {
  STAY: "Estadias",
  GUEST: "Hóspedes",
  CABIN: "Cabanas",
  USER: "Usuários",
  PROPERTY: "Configurações",
  MESSAGE: "Mensagens",
  STOCK: "Estoque",
  STRUCTURE: "Estruturas",
  STRUCTURE_BOOKING: "Agendamentos",
  STRUCTURE_REVIEW: "Avaliações",
  MAINTENANCE: "Manutenção",
  EVENT: "Eventos",
  CONCIERGE: "Concierge",
  FB_ORDER: "F&B",
  CONTACT: "Agenda",
  AUTOMATION: "Automações",
  BREAKFAST: "Café da manhã",
  CRON: "Rotinas",
  SUPPLIER: "Fornecedores",
  ASSET: "Patrimônio",
  ASSET_INVENTORY: "Inventário patrimonial",
  PURCHASE: "Compras",
  INVENTORY: "Inventário",
  RATE_TABLE: "Tarifário",
  RATE_QUOTE: "Cotações",
  RATE_FLUCTUATION: "Flutuações de tarifa",
  RATE_SETTINGS: "Tarifário (config)",
  WEDDING: "Casamentos",
};

// ─── Badge visual por tipo de ação (trios cor/bg/borda da identidade T) ───────

function badgeStyle(action: string): React.CSSProperties {
  const pill = (color: string, bg: string, border: string): React.CSSProperties => ({
    color, background: bg, border: `1px solid ${border}`,
  });
  if (action.startsWith('CRON_')) return pill(T.muted, T.glass, T.border);
  if (/DELETE|LOST|FAILED|LOSS|CANCELLED|DISPOSED/.test(action)) return pill(T.red, T.redBg, T.redBorder);
  if (/CONCIERGE/.test(action)) return pill(T.orange, T.orangeBg, T.orangeBorder);
  if (/MESSAGE|TEMPLATE/.test(action)) return pill(T.amber, T.amberBg, T.amberBorder);
  if (/BOOKING|CHECKIN|CHECKOUT|STAY|WEDDING/.test(action)) return pill(T.violet, T.violetBg, T.violetBorder);
  if (/STOCK|PURCHASE|INVENTORY|ASSET|SUPPLIER/.test(action)) return pill(T.g2, "rgba(78,201,212,0.08)", "rgba(78,201,212,0.22)");
  if (/UPDATE|STATUS_CHANGED|RETURNED|TOGGLED|MOVED|ARCHIVED|RESUMED|PAUSED/.test(action)) return pill(T.blue, T.blueBg, T.blueBorder);
  return pill(T.green, T.greenBg, T.greenBorder);
}

function authorInitials(name: string): string {
  const parts = (name || '?').split(' ');
  if (parts.length >= 2 && parts[0] && parts[1]) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name || '?').substring(0, 2).toUpperCase();
}

// ─── Agrupamento read-time ────────────────────────────────────────────────────
// Assinatura = autor + ação + entidade + "molde" do details (texto até o primeiro
// dígito/dois-pontos). Logs consecutivos com a mesma assinatura e até 45 min de
// intervalo entre vizinhos colapsam numa linha só.

const GROUP_GAP_MS = 45 * 60_000;

function detailsPrefix(details: string): string {
  const d = (details || '').toLowerCase();
  const idx = d.search(/[0-9:]/);
  return (idx === -1 ? d : d.slice(0, idx)).trim();
}

function groupSignature(l: AuditLog): string {
  // Lote de estoque: o resumo ("… em lote …") e as linhas têm moldes diferentes,
  // mas pertencem à mesma rajada — agrupa só por ação.
  const prefix = l.action.startsWith('STOCK_') ? '' : detailsPrefix(l.details);
  return `${l.userId}|${l.action}|${l.entity}|${prefix}`;
}

interface LogGroup {
  key: string;
  sig: string;
  logs: AuditLog[]; // ordem desc por timestamp (como vem da API)
}

function buildGroups(logs: AuditLog[]): LogGroup[] {
  // Absorção NÃO precisa ser consecutiva: um log de outro tipo no meio da rajada
  // (ex.: uma tarefa criada entre duas conferências) não quebra o grupo — basta a
  // assinatura bater e o intervalo até o último membro ficar dentro da janela.
  const groups: LogGroup[] = [];
  for (const log of logs) {
    const sig = groupSignature(log);
    const ts = new Date(log.timestamp as unknown as string).getTime();
    let target: LogGroup | undefined;
    for (let i = groups.length - 1; i >= 0 && i >= groups.length - 25; i--) {
      const g = groups[i];
      const oldest = new Date(g.logs[g.logs.length - 1].timestamp as unknown as string).getTime();
      if (g.sig === sig && oldest - ts <= GROUP_GAP_MS) { target = g; break; }
    }
    if (target) {
      target.logs.push(log);
    } else {
      groups.push({ key: log.id, sig, logs: [log] });
    }
  }
  return groups;
}

function extractAll(logs: AuditLog[], re: RegExp): string[] {
  const out: string[] = [];
  for (const l of logs) {
    const m = (l.details || '').match(re);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

function sortNumeric(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Linha-resumo de um grupo: o que aconteceu, com as variáveis reunidas. */
function summarizeGroup(g: LogGroup): { title: string; sub?: string } {
  const n = g.logs.length;
  const first = g.logs[0];
  const a = first.action;

  if (a === 'CHECKOUT' || a === 'CHECKIN') {
    const cabins = sortNumeric(extractAll(g.logs, /cabana\s+([^\s]+)/i));
    const label = a === 'CHECKOUT' ? 'Check-outs realizados' : 'Check-ins realizados';
    if (cabins.length > 1) return { title: `${label}: ${cabins.join(', ')}` };
    return { title: `${n}× ${ACTION_LABELS[a] ?? a}` };
  }

  if (a.startsWith('STOCK_')) {
    const batches = g.logs.filter(l => /em lote/i.test(l.details || ''));
    const lineCount = n - batches.length;
    const itens = `${lineCount} ite${lineCount === 1 ? 'm' : 'ns'}`;
    if (batches.length === 1) {
      return {
        title: (batches[0].details || '').replace(/\.\s*$/, ''),
        sub: lineCount > 0 ? `${itens} lançado${lineCount === 1 ? '' : 's'}` : undefined,
      };
    }
    if (batches.length > 1) {
      // Vários lotes na mesma janela: soma os itens; a rota só aparece se TODOS
      // os lotes a declararem e ela for uma só (senão sugeriria rota que não sabemos)
      const routesAll = batches.map(b => (b.details || '').match(/—\s*(.+?)\.?\s*$/)?.[1]);
      const routes = Array.from(new Set(routesAll.filter(Boolean))) as string[];
      const showRoute = routes.length === 1 && routesAll.every(Boolean);
      return {
        title: `${ACTION_LABELS[a] ?? a}: ${itens} em ${batches.length} lotes${showRoute ? ` — ${routes[0]}` : ''}`,
      };
    }
    return { title: `${ACTION_LABELS[a] ?? a}: ${n} movimentaç${n === 1 ? 'ão' : 'ões'}` };
  }

  // Padrão "Prefixo fixo: variável." → junta as variáveis (ex.: conferências, tarefas)
  const prefix = detailsPrefix(first.details);
  const shortItems = sortNumeric(
    g.logs.map(l => {
      const d = l.details || '';
      const ci = d.indexOf(':');
      let v = ci >= 0 ? d.slice(ci + 1) : d.slice(prefix.length);
      v = v.replace(/\.\s*$/, '').trim();
      const short = v.split(' - ')[0].trim();
      return short.length > 0 && short.length <= 24 ? short : v.slice(0, 24).trim();
    }).filter(Boolean)
  );

  if (prefix.startsWith('conferência de saída')) {
    return {
      title: `Conferências de saída concluídas: ${shortItems.join(', ')}`,
      sub: 'frigobar, chave, achados e empréstimos',
    };
  }
  if (prefix.startsWith('criou tarefa')) {
    const kind = (first.details || '').match(/\(([^)]+)\)/)?.[1];
    return { title: `Tarefas criadas${kind ? ` (${kind})` : ''}: ${shortItems.join(', ')}` };
  }
  if (a === 'MESSAGE_SENT' || a === 'MESSAGE_RESENT') {
    return { title: `${n} mensagens enviadas`, sub: prefix ? prefix[0].toUpperCase() + prefix.slice(1) : undefined };
  }

  const label = ACTION_LABELS[a] ?? a.replace(/_/g, ' ');
  const sub = prefix ? prefix[0].toUpperCase() + prefix.slice(1) + '…' : undefined;
  return { title: `${n}× ${label}`, sub };
}

/** "16/08 12:59 – 13:15" (ou só "16/08 12:59" quando não há intervalo). */
function groupTimeRange(g: LogGroup): string {
  const newest = new Date(g.logs[0].timestamp as unknown as string);
  const oldest = new Date(g.logs[g.logs.length - 1].timestamp as unknown as string);
  const base = format(oldest, "dd/MM HH:mm", { locale: ptBR });
  const end = format(newest, "HH:mm", { locale: ptBR });
  return end === format(oldest, "HH:mm", { locale: ptBR }) ? base : `${base} – ${end}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const inputStyle: React.CSSProperties = {
  background: T.glass,
  border: `1px solid ${T.border}`,
  color: T.text,
  outline: 'none',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [grouping, setGrouping] = useState(true);

  // Filters
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const [startDate, setStartDate] = useState(sevenDaysAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");
  const [hideCron, setHideCron] = useState(true);

  const buildUrl = useCallback((off: number) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(off),
    });
    if (entity) params.set('entity', entity);
    if (search) params.set('search', search);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (hideCron) params.set('excludePrefix', 'CRON_');
    return `/api/admin/audit-logs?${params.toString()}`;
  }, [entity, search, startDate, endDate, hideCron]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setOffset(0);
    setExpanded(new Set());
    try {
      const res = await fetch(buildUrl(0));
      const json = await res.json();
      setLogs(json.logs || []);
      setTotal(json.total || 0);
    } catch (e) {
      console.error("Erro ao buscar logs:", e);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = async () => {
    const newOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(newOffset));
      const json = await res.json();
      setLogs(prev => [...prev, ...(json.logs || [])]);
      setOffset(newOffset);
    } catch (e) {
      console.error("Erro ao carregar mais logs:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const groups = useMemo(
    () => (grouping ? buildGroups(logs) : logs.map(l => ({ key: l.id, sig: '', logs: [l] }))),
    [logs, grouping]
  );

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const hasMore = logs.length < total;

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager"]}>
      <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-500" style={{ color: T.text }}>

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: T.gradSoft, border: `1px solid ${T.g1Border}` }}
            >
              <FileText size={20} style={{ color: T.g1 }} />
            </div>
            <div className="space-y-0.5">
              <div style={{ color: T.g2, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10 }}>
                Auditoria
              </div>
              <h1 style={{ fontWeight: 900, letterSpacing: '-0.03em' }} className="text-3xl">Logs de Auditoria</h1>
              <p style={{ color: T.muted }} className="text-sm">Histórico de ações realizadas na propriedade.</p>
            </div>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all self-start"
            style={{ background: T.glass2, border: `1px solid ${T.border2}`, color: T.text }}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </header>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={15} style={{ color: T.muted }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchLogs()}
              placeholder="Buscar autor ou detalhe..."
              className="pl-9 pr-3 py-2 rounded-xl text-sm w-56"
              style={inputStyle}
            />
          </div>

          {/* Entity filter */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={inputStyle}>
            <Filter size={14} style={{ color: T.muted }} className="shrink-0" />
            <select
              value={entity}
              onChange={e => setEntity(e.target.value)}
              className="bg-transparent text-sm font-medium outline-none"
              style={{ color: T.text }}
            >
              <option value="" style={{ background: T.card }}>Todas entidades</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                <option key={k} value={k} style={{ background: T.card }}>{v}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={inputStyle}>
            <Clock size={14} style={{ color: T.muted }} className="shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-sm outline-none"
              style={{ color: T.text, colorScheme: 'dark' }}
            />
            <span style={{ color: T.muted }} className="text-xs">até</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent text-sm outline-none"
              style={{ color: T.text, colorScheme: 'dark' }}
            />
          </div>

          {/* Grouping toggle */}
          <button
            onClick={() => setGrouping(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all"
            style={grouping
              ? { background: T.gradSoft, border: `1px solid ${T.g1Border}`, color: T.text }
              : { background: T.glass, border: `1px solid ${T.border}`, color: T.muted }}
            title="Colapsar rajadas do mesmo autor e ação numa linha só"
          >
            <Layers size={14} />
            {grouping ? "Agrupado" : "Agrupar"}
          </button>

          {/* Hide cron toggle */}
          <button
            onClick={() => setHideCron(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all"
            style={hideCron
              ? { background: T.glass, border: `1px solid ${T.border}`, color: T.muted }
              : { background: T.amberBg, border: `1px solid ${T.amberBorder}`, color: T.amber }}
          >
            <Bot size={14} />
            {hideCron ? "Ocultar cron" : "Mostrar cron"}
          </button>
        </div>

        {/* Results count */}
        {!loading && (
          <p className="text-xs" style={{ color: T.muted }}>
            Exibindo {logs.length} de {total} registros{grouping && logs.length !== groups.length ? ` em ${groups.length} linhas` : ''}
          </p>
        )}

        {/* Table */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead style={{ background: T.glass, borderBottom: `1px solid ${T.border}` }}>
                <tr>
                  {['Data/Hora', 'Autor', 'Ação', 'Detalhes'].map(h => (
                    <th key={h} className="p-4 whitespace-nowrap" style={{ color: T.muted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center" style={{ color: T.muted }}>
                      <RefreshCw className="animate-spin mx-auto mb-2" size={20} />
                      <span className="text-sm">Carregando logs...</span>
                    </td>
                  </tr>
                ) : groups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-sm" style={{ color: T.muted }}>
                      Nenhum registro encontrado com estes filtros.
                    </td>
                  </tr>
                ) : (
                  groups.map(group => {
                    const isGroup = group.logs.length > 1;
                    const log = group.logs[0];
                    const isOpen = expanded.has(group.key);
                    const summary = isGroup ? summarizeGroup(group) : null;

                    return (
                      <React.Fragment key={group.key}>
                        <tr
                          className="transition-colors"
                          style={{ borderTop: `1px solid ${T.border}`, cursor: isGroup ? 'pointer' : 'default', background: isOpen ? T.glass : undefined }}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = T.glass; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isOpen ? T.glass : ''; }}
                          onClick={isGroup ? () => toggleExpand(group.key) : undefined}
                        >
                          <td className="p-4 whitespace-nowrap align-top">
                            <div className="font-mono text-xs" style={{ color: T.muted }}>
                              {isGroup
                                ? groupTimeRange(group)
                                : log.timestamp
                                  ? format(new Date(log.timestamp as unknown as string), "dd/MM HH:mm", { locale: ptBR })
                                  : "—"}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black uppercase shrink-0"
                                style={{ background: T.gradSoft, border: `1px solid ${T.g1Border}`, color: T.g1 }}
                              >
                                {authorInitials(log.userName)}
                              </div>
                              <span className="text-sm font-semibold">{log.userName}</span>
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tight whitespace-nowrap"
                                style={badgeStyle(log.action)}
                              >
                                {ACTION_LABELS[log.action] || log.action.replace(/_/g, ' ')}
                              </span>
                              {isGroup && (
                                <span
                                  className="px-1.5 py-1 rounded-md text-[10px] font-black whitespace-nowrap"
                                  style={{ background: T.gradSoft, border: `1px solid ${T.g1Border}`, color: T.text }}
                                >
                                  ×{group.logs.length}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 max-w-md">
                            {isGroup ? (
                              <div>
                                <p className="text-sm" style={{ color: T.text }}>{summary!.title}</p>
                                {summary!.sub && (
                                  <p className="text-xs mt-0.5" style={{ color: T.muted }}>{summary!.sub}</p>
                                )}
                                <button
                                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide transition-colors"
                                  style={{ color: isOpen ? T.g2 : T.muted }}
                                  onClick={e => { e.stopPropagation(); toggleExpand(group.key); }}
                                >
                                  {isOpen
                                    ? <><ChevronDown size={12} /> Ocultar detalhes</>
                                    : <><ChevronRight size={12} /> Ver detalhes ({group.logs.length})</>}
                                </button>
                              </div>
                            ) : ENTITY_LINKS[log.entity] ? (
                              <Link
                                href={ENTITY_LINKS[log.entity]!}
                                className="group inline-flex items-start gap-1.5 text-sm transition-colors"
                                style={{ color: 'rgba(238,240,248,0.8)' }}
                              >
                                <span>{log.details}</span>
                                <ExternalLink size={12} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                              </Link>
                            ) : (
                              <p className="text-sm" style={{ color: 'rgba(238,240,248,0.8)' }}>{log.details}</p>
                            )}
                          </td>
                        </tr>

                        {/* Detalhe expandido: cada log original da rajada */}
                        {isGroup && isOpen && (
                          <tr style={{ background: T.glass }}>
                            <td colSpan={4} className="px-4 pb-4 pt-0">
                              <div
                                className="ml-2 rounded-xl overflow-hidden"
                                style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}` }}
                              >
                                {[...group.logs].reverse().map((item, idx) => (
                                  <div
                                    key={item.id}
                                    className="flex items-start gap-3 px-4 py-2 text-sm"
                                    style={idx > 0 ? { borderTop: `1px solid ${T.border}` } : undefined}
                                  >
                                    <span className="font-mono text-xs whitespace-nowrap mt-0.5" style={{ color: T.muted }}>
                                      {item.timestamp ? format(new Date(item.timestamp as unknown as string), "HH:mm", { locale: ptBR }) : "—"}
                                    </span>
                                    <span style={{ color: 'rgba(238,240,248,0.75)' }}>{item.details}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {hasMore && !loading && (
            <div className="p-4 text-center" style={{ borderTop: `1px solid ${T.border}` }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: T.glass2, border: `1px solid ${T.border2}`, color: T.text }}
              >
                {loadingMore ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                Carregar mais
              </button>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
