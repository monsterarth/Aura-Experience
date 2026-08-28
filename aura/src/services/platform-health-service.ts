// src/services/platform-health-service.ts
//
// Leituras do painel de plataforma (/admin/core/dashboard) — a visão de quem é
// dono do Aura, não de quem opera uma pousada.
//
// Regra de custo que atravessa este arquivo: o painel existe para VIGIAR o
// consumo de infraestrutura, então ele não pode ser um consumidor relevante.
// Na prática:
//   · nenhuma linha crua sai do banco — tudo vem somado pelas funções
//     `platform_*` (ver migrations/platform_panel_rpcs.sql);
//   · o raspão de métricas do Supabase é grande em texto (≈582 KB) mas trafega
//     comprimido (≈22 KB) e fica em cache por 5 min, então nem o F5 nervoso
//     multiplica o custo;
//   · nada de realtime nesta página — o polling de WAL do realtime já é o maior
//     consumidor de tempo de banco que existe hoje.
import { supabaseAdmin } from '@/lib/supabase';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface WorkPoint {
  day: string;
  mensagens: number; governanca: number; manutencao: number; agendamentos: number;
  fb: number; folio: number; concierge: number; cafe: number; estoque: number; checkins: number;
  total: number;
}

export interface ModuleAdoption {
  module: string;
  lastUsed: string | null;
  n30: number;
  total: number;
}

export interface PropertyHealth {
  id: string; name: string; slug: string; createdAt: string | null;
  staffTotal: number; staffActive7d: number; actions7d: number;
  staysActive: number; staysTotal: number; guests: number;
  quality: {
    guestsProvisional: number; phonesNoDdi: number; guestsNoEmail: number;
    staysOpenFolio: number; staysNoBillClosed: number;
  };
  modules: ModuleAdoption[];
}

export interface Pulse {
  queue: Record<string, number>;
  stuckOldest: string | null;
  failed24h: number; failedTotal: number;
  loginFails24h: number; openBugs: number;
  cron: Array<{ action: string; lastRun: string; runs7d: number }>;
}

export interface DbLoad {
  dbSizeBytes: number;
  statsSince: string | null;
  cacheHitPct: number | null;
  topQueries: Array<{ label: string; calls: number; totalMs: number; meanMs: number }>;
  topTables: Array<{ table: string; rows: number; bytes: number }>;
}

export interface StorageUsage {
  buckets: Array<{ bucket: string; objects: number; bytes: number; avgBytes: number }>;
  heaviest: Array<{ name: string; bucket: string; bytes: number; createdAt: string }>;
  sizeBands: Array<{ band: string; n: number; bytes: number }>;
}

export interface Infra {
  dbSizeMb: number | null;
  memTotalBytes: number | null;
  memAvailableBytes: number | null;
  diskSizeBytes: number | null;
  diskAvailBytes: number | null;
  load1: number | null;
  netTransmitBytes: number | null;
  realtimeSubscriptions: number | null;
  connections: Array<{ user: string; n: number }>;
  scrapedAt: string;
}

export interface PlatformSnapshot {
  work: WorkPoint[];
  properties: PropertyHealth[];
  pulse: Pulse | null;
  dbLoad: DbLoad | null;
  storage: StorageUsage | null;
  infra: Infra | null;
  /** Fontes que falharam — a tela mostra vazio explicado, nunca zero mentiroso. */
  errors: string[];
  generatedAt: string;
}

// ─── Métricas do Supabase (Prometheus) ───────────────────────────────────────
//
// O endpoint `/customer/v1/privileged/metrics` autentica com Basic
// `service_role:<chave de serviço>` — a mesma chave que o app já usa no servidor,
// nada novo para configurar. Devolve ~281 métricas; queremos uma dúzia.

const METRIC_LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+0-9.eE]+|NaN)$/;

function parsePrometheus(text: string, wanted: Set<string>) {
  const out: Array<{ name: string; labels: Record<string, string>; value: number }> = [];
  for (const raw of text.split('\n')) {
    if (!raw || raw.charCodeAt(0) === 35 /* # */) continue;
    const m = METRIC_LINE.exec(raw);
    if (!m || !wanted.has(m[1])) continue;
    const labels: Record<string, string> = {};
    if (m[2]) {
      for (const pair of m[2].slice(1, -1).split(',')) {
        const eq = pair.indexOf('=');
        if (eq > 0) labels[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().replace(/^"|"$/g, '');
      }
    }
    const value = Number(m[3]);
    if (Number.isFinite(value)) out.push({ name: m[1], labels, value });
  }
  return out;
}

const WANTED = new Set([
  'pg_database_size_mb',
  'node_memory_MemTotal_bytes',
  'node_memory_MemAvailable_bytes',
  'node_filesystem_size_bytes',
  'node_filesystem_avail_bytes',
  'node_load1',
  'node_network_transmit_bytes_total',
  'realtime_postgres_changes_total_subscriptions',
  'connection_stats_connection_count',
]);

async function fetchInfra(): Promise<Infra | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const auth = Buffer.from(`service_role:${key}`).toString('base64');
  const res = await fetch(`${url}/customer/v1/privileged/metrics`, {
    headers: { Authorization: `Basic ${auth}` },
    // 5 minutos de cache: o próprio Supabase só recalcula o conjunto a cada
    // minuto, e segurar aqui impede que recarregar a página vire custo.
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`metrics HTTP ${res.status}`);

  const rows = parsePrometheus(await res.text(), WANTED);
  const one = (name: string, pred?: (l: Record<string, string>) => boolean) =>
    rows.find(r => r.name === name && (!pred || pred(r.labels)))?.value ?? null;

  // O filesystem tem várias montagens; a que interessa é a maior (o volume de dados).
  const fsSize = rows.filter(r => r.name === 'node_filesystem_size_bytes').sort((a, b) => b.value - a.value)[0];
  const fsAvail = fsSize
    ? rows.find(r => r.name === 'node_filesystem_avail_bytes' && r.labels.mountpoint === fsSize.labels.mountpoint)
    : undefined;

  return {
    dbSizeMb: one('pg_database_size_mb'),
    memTotalBytes: one('node_memory_MemTotal_bytes'),
    memAvailableBytes: one('node_memory_MemAvailable_bytes'),
    diskSizeBytes: fsSize?.value ?? null,
    diskAvailBytes: fsAvail?.value ?? null,
    load1: one('node_load1'),
    // Contador acumulado desde o boot da instância — sozinho não é "egress do
    // mês"; vira taxa quando houver snapshots para subtrair (fatia 2).
    netTransmitBytes: rows.filter(r => r.name === 'node_network_transmit_bytes_total')
      .reduce((s, r) => Math.max(s, r.value), 0) || null,
    realtimeSubscriptions: one('realtime_postgres_changes_total_subscriptions'),
    connections: rows.filter(r => r.name === 'connection_stats_connection_count' && r.value > 0)
      .map(r => ({ user: r.labels.username ?? '?', n: r.value }))
      .sort((a, b) => b.n - a.n),
    scrapedAt: new Date().toISOString(),
  };
}

// ─── Montagem do retrato ─────────────────────────────────────────────────────

const WORK_KINDS = ['mensagens', 'governanca', 'manutencao', 'agendamentos', 'fb', 'folio', 'concierge', 'cafe', 'estoque', 'checkins'] as const;

/** Pivota (dia, tipo, n) numa linha por dia, com os dias vazios preenchidos com zero. */
function pivotWork(rows: Array<{ day: string; kind: string; n: number }>, days: number): WorkPoint[] {
  const byDay = new Map<string, WorkPoint>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    byDay.set(d, { day: d, total: 0, ...Object.fromEntries(WORK_KINDS.map(k => [k, 0])) } as WorkPoint);
  }
  for (const r of rows) {
    const point = byDay.get(r.day);
    if (!point || !(WORK_KINDS as readonly string[]).includes(r.kind)) continue;
    (point as unknown as Record<string, number>)[r.kind] = Number(r.n);
    point.total += Number(r.n);
  }
  return Array.from(byDay.values());
}

export async function getPlatformSnapshot(days = 30): Promise<PlatformSnapshot> {
  const errors: string[] = [];
  const empty: PlatformSnapshot = {
    work: [], properties: [], pulse: null, dbLoad: null, storage: null, infra: null,
    errors, generatedAt: new Date().toISOString(),
  };
  if (!supabaseAdmin) {
    errors.push('supabaseAdmin indisponível (chave de serviço ausente)');
    return empty;
  }
  const db = supabaseAdmin;

  // `settled` para que uma fonte quebrada não apague as outras: o painel de
  // plantão precisa aparecer justamente quando algo está fora do ar.
  const [work, health, adoption, pulse, dbLoad, storage, infra] = await Promise.allSettled([
    db.rpc('platform_work_series', { p_days: days }),
    db.rpc('platform_property_health'),
    db.rpc('platform_module_adoption'),
    db.rpc('platform_pulse'),
    db.rpc('platform_db_load'),
    db.rpc('platform_storage'),
    fetchInfra(),
  ]);

  const unwrap = <T,>(r: PromiseSettledResult<{ data: unknown; error: { message: string } | null }>, label: string): T | null => {
    if (r.status === 'rejected') { errors.push(`${label}: ${String(r.reason)}`); return null; }
    if (r.value.error) { errors.push(`${label}: ${r.value.error.message}`); return null; }
    return (r.value.data ?? null) as T | null;
  };

  const workRows = unwrap<Array<{ day: string; kind: string; n: number }>>(work, 'série de trabalho') ?? [];
  const properties = unwrap<PropertyHealth[]>(health, 'saúde das propriedades') ?? [];
  const adoptionRows = unwrap<Array<{ property_id: string; module: string; last_used: string | null; n30: number; total: number }>>(adoption, 'adoção de módulos') ?? [];

  for (const p of properties) {
    p.modules = adoptionRows
      .filter(a => a.property_id === p.id)
      .map(a => ({ module: a.module, lastUsed: a.last_used, n30: Number(a.n30), total: Number(a.total) }))
      .sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? ''));
  }

  if (infra.status === 'rejected') errors.push(`métricas de infra: ${String(infra.reason)}`);

  return {
    work: pivotWork(workRows, days),
    properties,
    pulse: unwrap<Pulse>(pulse, 'plantão'),
    dbLoad: unwrap<DbLoad>(dbLoad, 'carga do banco'),
    storage: unwrap<StorageUsage>(storage, 'acervo'),
    infra: infra.status === 'fulfilled' ? infra.value : null,
    errors,
    generatedAt: new Date().toISOString(),
  };
}
