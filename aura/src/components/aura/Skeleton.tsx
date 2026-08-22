// Skeletons: sem hooks e sem "use client" — servem em loading.tsx (RSC).
// O shimmer anima só background-position (barato) e para em reduced-motion.
import React from "react";

export interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  radius?: number | string;
  className?: string;
  style?: React.CSSProperties;
  /** Círculo (avatar). */
  circle?: boolean;
}

export function Skeleton({ w = "100%", h = 14, radius = 8, circle, className, style }: SkeletonProps) {
  return <span className={`ak-skeleton${className ? ` ${className}` : ""}`} aria-hidden style={{ width: w, height: h, borderRadius: circle ? "50%" : radius, ...style }} />;
}

export function SkeletonText({ lines = 3, width = "100%", gap = 8 }: { lines?: number; width?: number | string; gap?: number }) {
  return (
    <div className="ak-skeleton-stack" style={{ gap, width }} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 && lines > 1 ? "62%" : "100%"} radius={6} />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 2, header = true, style }: { lines?: number; header?: boolean; style?: React.CSSProperties }) {
  return (
    <div className="ak-skeleton-card" aria-hidden style={style}>
      {header && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Skeleton w={32} h={32} radius={9} />
          <div style={{ flex: 1 }}><Skeleton w="55%" h={12} /><Skeleton w="35%" h={9} style={{ marginTop: 6 }} /></div>
        </div>
      )}
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonKpiRow({ n = 4 }: { n?: number }) {
  return (
    <div className="ak-kpis" data-cols={String(Math.min(Math.max(n, 2), 6))} aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="ak-kpi">
          <Skeleton w={36} h={36} radius={10} />
          <div className="ak-kpi__body">
            <Skeleton w={72} h={20} radius={6} />
            <Skeleton w={96} h={10} radius={4} style={{ marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 6, avatar = true, card = true }: { rows?: number; avatar?: boolean; card?: boolean }) {
  const list = (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ak-skeleton-row">
          {avatar && <Skeleton w={36} h={36} radius={10} />}
          <div style={{ flex: 1 }}>
            <Skeleton w={`${55 + ((i * 17) % 30)}%`} h={12} />
            <Skeleton w={`${30 + ((i * 23) % 25)}%`} h={9} style={{ marginTop: 7 }} />
          </div>
          <Skeleton w={56} h={18} radius={999} />
        </div>
      ))}
    </div>
  );
  return card ? <div className="ak-card" data-pad="16">{list}</div> : list;
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="ak-table-wrap" aria-hidden>
      <table className="ak-table">
        <thead>
          <tr>{Array.from({ length: cols }).map((_, i) => <th key={i}><Skeleton w={60 + ((i * 29) % 50)} h={9} radius={4} /></th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>{Array.from({ length: cols }).map((_, c) => <td key={c}><Skeleton w={`${40 + ((r * 13 + c * 31) % 55)}%`} h={12} radius={6} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonCards({ n = 6, minWidth = 280 }: { n?: number; minWidth?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))`, gap: 12 }} aria-hidden>
      {Array.from({ length: n }).map((_, i) => <SkeletonCard key={i} lines={2 + (i % 2)} />)}
    </div>
  );
}

export function SkeletonKanban({ cols = 3, cards = 3 }: { cols?: number; cards?: number }) {
  return (
    <div style={{ display: "flex", gap: 12, overflow: "hidden" }} aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton w="45%" h={12} />
          {Array.from({ length: cards }).map((_, j) => <SkeletonCard key={j} header={false} lines={2} />)}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ h = 220 }: { h?: number }) {
  return (
    <div className="ak-card" data-pad="16" aria-hidden>
      <Skeleton w="40%" h={12} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: h, marginTop: 16 }}>
        {[42, 70, 55, 88, 63, 76, 50, 92, 60, 71, 45, 80].map((p, i) => <Skeleton key={i} w="100%" h={`${p}%`} radius={6} />)}
      </div>
    </div>
  );
}

/** Header + KPIs + lista — o fallback genérico de loading.tsx do admin. */
export function PageSkeleton({ kpis = 4, rows = 6 }: { kpis?: number; rows?: number }) {
  return (
    <div className="ak-pageshell" data-maxw="xl" aria-busy="true" aria-label="Carregando">
      <div className="ak-pagehead__row">
        <div className="ak-pagehead__main">
          <Skeleton w={40} h={40} radius={12} />
          <div style={{ flex: 1 }}><Skeleton w="38%" h={20} radius={6} /><Skeleton w="24%" h={11} style={{ marginTop: 8 }} /></div>
        </div>
        <Skeleton w={140} h={38} radius={10} />
      </div>
      {kpis > 0 && <SkeletonKpiRow n={kpis} />}
      <SkeletonList rows={rows} />
    </div>
  );
}

export function DialogSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div style={{ padding: 20 }} aria-busy="true">
      <Skeleton w="50%" h={16} />
      <div style={{ marginTop: 16 }}><SkeletonText lines={lines} gap={12} /></div>
    </div>
  );
}
