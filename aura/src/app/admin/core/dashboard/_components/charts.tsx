"use client";

// Gráficos do painel de plataforma.
//
// Especificação das marcas (vale para todos daqui): barra ≤24px com ponta
// arredondada de 4px e base quadrada na linha zero · linha de 2px · ponto ≥8px
// com anel de 2px na cor da superfície · área a ~10% de opacidade (lavada, nunca
// bloco chapado) · grade fina SÓLIDA e recessiva (tracejado compete com o dado)
// · rótulo direto só no extremo, nunca em todo ponto · texto sempre em token de
// texto, jamais na cor da série.
//
// As cores vêm de CHART/T (var(--c-*)), então o gráfico troca de tema junto com
// o resto do admin sem nenhum listener de tema aqui dentro.
import React from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from "recharts";
import { T, CHART, alpha } from "@/lib/admin-tokens";

// ─── Formatação ──────────────────────────────────────────────────────────────

export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(".0", "")}k`
  : String(Math.round(n));

export const bytes = (b: number | null | undefined) => {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TipRow { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }

function ChartTip({ active, payload, label, unit, titleOf }: {
  active?: boolean; payload?: TipRow[]; label?: string | number;
  unit?: (v: number) => string;
  titleOf?: (label: string | number | undefined, row?: TipRow) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = unit ?? ((v: number) => v.toLocaleString("pt-BR"));
  return (
    <div style={{
      background: T.elev, border: `1px solid ${T.border2}`, borderRadius: 12,
      padding: "8px 10px", fontSize: 12, color: T.text,
      boxShadow: "0 8px 24px rgba(0,0,0,0.28)", minWidth: 120,
    }}>
      <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
        {titleOf ? titleOf(label, payload[0]) : dayLabel(String(label))}
      </div>
      {payload.map((row, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          {row.name && payload.length > 1 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.muted }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: row.color }} />
              {row.name}
            </span>
          )}
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(Number(row.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

const axisTick = { fontSize: 10, fill: T.muted2, fontVariantNumeric: "tabular-nums" as const };

// ─── 1. Área: o trabalho executado ao longo do tempo ─────────────────────────
// Série única → sem legenda (o título já diz o que está plotado). O valor do
// último dia ganha rótulo direto; os outros ficam com o eixo e o tooltip.

export function WorkArea({ data, height = 210 }: { data: Array<{ day: string; total: number }>; height?: number }) {
  const last = data.length - 1;

  // Rótulo direto SÓ no último ponto (o recorte "hoje"); os demais valores ficam
  // com o eixo e o tooltip — número em todo ponto vira ruído e ninguém lê.
  const EndLabel = (p: { index?: number; x?: number | string; y?: number | string; value?: unknown }) => {
    if (p.index !== last || p.x == null || p.y == null) return null;
    return (
      <text x={Number(p.x) + 9} y={Number(p.y) + 4} fill={T.text} fontSize={11} fontWeight={700}>
        {compact(Number(p.value ?? 0))}
      </text>
    );
  };
  const peak = data.reduce((m, d) => Math.max(m, d.total), 0);

  const EndDot = (props: { cx?: number; cy?: number; index?: number }) => {
    if (props.index !== last || props.cx == null || props.cy == null) return <g />;
    return (
      <g>
        <circle cx={props.cx} cy={props.cy} r={4.5} fill="var(--c-1)" stroke={T.card} strokeWidth={2} />
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 14, right: 46, left: -14, bottom: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id="gWork" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--c-1)" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={T.grid} vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayLabel} tick={axisTick} tickLine={false}
               axisLine={{ stroke: T.grid }} minTickGap={24} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44}
               tickFormatter={(v: number) => compact(v)} domain={[0, Math.max(4, Math.ceil(peak * 1.1))]} />
        <Tooltip content={<ChartTip />} cursor={{ stroke: T.border2, strokeWidth: 1 }} />
        <Area type="monotone" dataKey="total" stroke="var(--c-1)" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" fill="url(#gWork)"
              dot={<EndDot />} activeDot={{ r: 4.5, stroke: T.card, strokeWidth: 2, fill: "var(--c-1)" }}>
          <LabelList dataKey="total" position="top" offset={10} content={EndLabel} />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── 2. Barras horizontais ranqueadas ────────────────────────────────────────
// Uma medida só, várias categorias → rampa sequencial (não categórica): a cor
// repete a magnitude que o comprimento já diz, e o topo do ranking se destaca.
// O valor vai na ponta da barra, fora dela — assim nunca é cortado.

export interface RankRow { label: string; value: number; hint?: string }

export function RankBars({ rows, format = compact, height, unit }: {
  rows: RankRow[]; format?: (n: number) => string; height?: number; unit?: (v: number) => string;
}) {
  const n = rows.length;
  const h = height ?? Math.max(120, n * 34 + 16);
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 52, left: 0, bottom: 0 }}
                barCategoryGap={8} accessibilityLayer>
        <CartesianGrid stroke={T.grid} horizontal={false} />
        <XAxis type="number" hide domain={[0, Math.max(1, max * 1.12)]} />
        <YAxis type="category" dataKey="label" width={112} tick={{ ...axisTick, fill: T.muted }}
               tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTip unit={unit} titleOf={(l) => String(l)} />}
                 cursor={{ fill: alpha(T.text, 4) }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
          {rows.map((_, i) => <Cell key={i} fill={CHART.rank(i, n)} />)}
          <LabelList dataKey="value" position="right" offset={8}
                     style={{ fill: T.text, fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                     formatter={(v) => format(Number(v))} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 3. Colunas por faixa (escala ordinal) ───────────────────────────────────
// As faixas têm ordem natural (do arquivo leve ao pesado), então a rampa anda
// junto com a faixa — a cor nunca contradiz a posição.

export function BandColumns({ rows, height = 168, format = compact }: {
  rows: Array<{ band: string; n: number; bytes?: number }>; height?: number; format?: (n: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 18, right: 4, left: -18, bottom: 0 }} accessibilityLayer>
        <CartesianGrid stroke={T.grid} vertical={false} />
        <XAxis dataKey="band" tick={{ ...axisTick, fill: T.muted }} tickLine={false} axisLine={{ stroke: T.grid }} interval={0} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: alpha(T.text, 4) }}
          content={<ChartTip titleOf={(l) => String(l)} unit={(v) => `${v} arquivo${v === 1 ? "" : "s"}`} />} />
        <Bar dataKey="n" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
          {rows.map((_, i) => <Cell key={i} fill={`var(--c-seq-${Math.min(5, i + 1)})`} />)}
          <LabelList dataKey="n" position="top" offset={6}
                     style={{ fill: T.text, fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                     formatter={(v) => format(Number(v))} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 4. Medidor ──────────────────────────────────────────────────────────────
// Trilho é um passo mais claro da MESMA rampa (nunca cinza neutro): o estado
// lê-se ao longo da barra inteira, não só na parte preenchida.

export function Meter({ pct, tone = "brand", label, value }: {
  pct: number; tone?: "brand" | "amber" | "red"; label: string; value: string;
}) {
  const fill = tone === "red" ? T.red : tone === "amber" ? T.amber : "var(--c-seq-4)";
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 11, color: T.muted }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: alpha(fill, 16), overflow: "hidden" }}
           role="meter" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div style={{ width: `${clamped}%`, height: "100%", borderRadius: 999, background: fill, transition: "width var(--dur-3) var(--ease-out)" }} />
      </div>
    </div>
  );
}
