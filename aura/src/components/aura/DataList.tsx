"use client";

// Tabela responsiva com UMA fonte de dados e UM caminho de render por viewport:
// cards no celular (< 768), tabela no desktop. Até saber o viewport (1ª pintura)
// mostra skeleton — sem DOM duplicado. Colunas declaram o papel no card
// (`mobile`: title/subtitle/meta/trailing/body/hidden) e prioridade (3 some no tablet).
import React, { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, m } from "motion/react";
import { MoreHorizontal } from "lucide-react";
import type { Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";
import { IconButton } from "./Button";
import { Dialog } from "./Dialog";
import { EmptyState, ErrorState } from "./EmptyState";
import { SkeletonList, SkeletonTable } from "./Skeleton";
import { useIsMobile, useViewport } from "./hooks";
import { useOverlayRoot } from "./OverlayProvider";
import { v } from "./motion";

export type MobileRole = "title" | "subtitle" | "meta" | "trailing" | "body" | "hidden";

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  width?: number | string;
  align?: "left" | "right" | "center";
  /** 1 essencial · 2 normal · 3 secundária (some no tablet). */
  priority?: 1 | 2 | 3;
  /** Papel no card do celular. Sem papéis declarados: 1ª = título, 2ª = subtítulo, resto = pares. */
  mobile?: MobileRole;
  /** Rótulo curto para os pares do card (padrão: header). */
  mobileLabel?: React.ReactNode;
  nowrap?: boolean;
}

export interface RowAction<T> {
  id: string;
  label: string;
  icon?: IconLike;
  onClick: (row: T) => void;
  danger?: boolean;
  disabled?: boolean;
  tone?: Tone;
}

export interface DataListProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  rowActions?: (row: T) => RowAction<T>[];
  loading?: boolean;
  skeletonRows?: number;
  empty?: React.ReactNode;
  error?: string | null;
  onRetry?: () => void;
  /** Card customizado no celular (senão o DataList monta pelos papéis das colunas). */
  mobileCard?: (row: T) => React.ReactNode;
  layout?: "auto" | "cards" | "table";
  stickyHeader?: boolean;
  minWidth?: number;
  density?: "regular" | "compact";
  /** Lista que muda ao vivo (realtime): cards entram/saem animados. */
  live?: boolean;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Rótulo do menu de ações (a11y). */
  actionsLabel?: string;
}

function roleOf<T>(cols: Column<T>[]) {
  const explicit = cols.some(c => c.mobile);
  const visible = cols.filter(c => c.mobile !== "hidden");
  if (explicit) {
    return {
      title: visible.find(c => c.mobile === "title") ?? visible.find(c => c.priority === 1) ?? visible[0],
      subtitle: visible.find(c => c.mobile === "subtitle"),
      meta: visible.filter(c => c.mobile === "meta"),
      trailing: visible.filter(c => c.mobile === "trailing"),
      body: visible.filter(c => c.mobile === "body"),
      kv: [] as Column<T>[],
    };
  }
  const rest = visible.slice(2).filter(c => c.priority !== 3);
  return { title: visible[0], subtitle: visible[1], meta: [], trailing: [], body: [], kv: rest.slice(0, 4) };
}

export function DataList<T>(props: DataListProps<T>) {
  const { rows, columns, rowKey, onRowClick, rowHref, rowActions, loading, skeletonRows = 6, empty, error, onRetry, mobileCard, layout = "auto", stickyHeader, minWidth, density = "regular", live, footer, className, style, actionsLabel = "Ações" } = props;
  const vp = useViewport();
  const useCards = layout === "cards" || (layout === "auto" && vp.isMobile);

  if (loading || (layout === "auto" && !vp.ready)) {
    return useCards || !vp.ready ? <SkeletonList rows={skeletonRows} /> : <SkeletonTable rows={skeletonRows} cols={Math.min(columns.length, 6)} />;
  }
  if (error) return <ErrorState description={error} onRetry={onRetry} />;
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nada por aqui" compact bordered />}</>;

  if (useCards) {
    const roles = roleOf(columns);
    const renderCard = (row: T) => {
      if (mobileCard) return mobileCard(row);
      const actions = rowActions?.(row) ?? [];
      const clickable = !!(onRowClick || rowHref);
      const content = (
        <>
          <div className="ak-dl-card__top">
            <div className="ak-dl-card__main">
              {roles.title && <div className="ak-dl-card__title">{roles.title.cell(row)}</div>}
              {roles.subtitle && <div className="ak-dl-card__subtitle">{roles.subtitle.cell(row)}</div>}
            </div>
            {roles.trailing.length > 0 && <div className="ak-dl-card__trailing">{roles.trailing.map(c => <span key={c.id}>{c.cell(row)}</span>)}</div>}
          </div>
          {roles.meta.length > 0 && <div className="ak-dl-card__meta">{roles.meta.map(c => <span key={c.id}>{c.cell(row)}</span>)}</div>}
          {roles.kv.length > 0 && (
            <dl className="ak-skeleton-stack" style={{ gap: 4 }}>
              {roles.kv.map(c => (
                <div key={c.id} className="ak-dl-card__kv"><dt>{c.mobileLabel ?? c.header}</dt><dd>{c.cell(row)}</dd></div>
              ))}
            </dl>
          )}
          {roles.body.map(c => <div key={c.id} className="ak-dl-card__body">{c.cell(row)}</div>)}
          {actions.length > 0 && (
            <div className="ak-dl-card__actions" onClick={e => e.stopPropagation()}>
              <RowActions row={row} actions={actions} label={actionsLabel} />
            </div>
          )}
        </>
      );
      const href = rowHref?.(row);
      if (href) return <Link href={href} className="ak-dl-card" data-clickable>{content}</Link>;
      return (
        <div className="ak-dl-card" data-clickable={clickable || undefined} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => onRowClick?.(row) : undefined}
          onKeyDown={clickable ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick?.(row); } } : undefined}>
          {content}
        </div>
      );
    };
    return (
      <div className={`ak-dl-cards${className ? ` ${className}` : ""}`} style={style}>
        {live ? (
          <AnimatePresence initial={false}>
            {rows.map(row => <m.div key={rowKey(row)} layout {...v.listItem}>{renderCard(row)}</m.div>)}
          </AnimatePresence>
        ) : rows.map(row => <React.Fragment key={rowKey(row)}>{renderCard(row)}</React.Fragment>)}
        {footer}
      </div>
    );
  }

  const cols = columns.filter(c => !(vp.isTablet && c.priority === 3));
  const hasActions = !!rowActions;
  return (
    <div className={`ak-table-wrap${className ? ` ${className}` : ""}`} style={style}>
      <table className="ak-table" data-sticky-header={stickyHeader || undefined} data-density={density} style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>
            {cols.map(c => <th key={c.id} data-align={c.align} data-nowrap={c.nowrap || undefined} style={c.width ? { width: c.width } : undefined}>{c.header}</th>)}
            {hasActions && <th className="ak-table__actions" aria-label={actionsLabel} />}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const clickable = !!(onRowClick || rowHref);
            const href = rowHref?.(row);
            const go = () => { if (href) window.location.assign(href); else onRowClick?.(row); };
            return (
              <tr key={rowKey(row)} data-clickable={clickable || undefined} onClick={clickable ? go : undefined}
                tabIndex={clickable ? 0 : undefined} onKeyDown={clickable ? e => { if (e.key === "Enter") go(); } : undefined}>
                {cols.map(c => <td key={c.id} data-align={c.align} data-nowrap={c.nowrap || undefined}>{c.cell(row)}</td>)}
                {hasActions && (
                  <td className="ak-table__actions" onClick={e => e.stopPropagation()}>
                    <span className="ak-table__actions-inner"><RowActions row={row} actions={rowActions!(row)} label={actionsLabel} /></span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer && <div className="ak-table__footer">{footer}</div>}
    </div>
  );
}

/** Até 3 ações com ícone viram botões (2 no celular); mais que isso, menu (popover no desktop, sheet no celular). */
export function RowActions<T>({ row, actions, label = "Ações" }: { row: T; actions: RowAction<T>[]; label?: string }) {
  const isMobile = useIsMobile();
  const inline = actions.length <= (isMobile ? 2 : 3) && actions.every(a => a.icon);
  if (inline) {
    return (
      <>
        {actions.map(a => (
          <IconButton key={a.id} icon={a.icon!} label={a.label} size="sm" variant={a.danger ? "danger" : "ghost"} tone={a.tone} disabled={a.disabled} onClick={() => a.onClick(row)} />
        ))}
      </>
    );
  }
  return <ActionMenu items={actions.map(a => ({ id: a.id, label: a.label, icon: a.icon, danger: a.danger, disabled: a.disabled, onClick: () => a.onClick(row) }))} label={label} />;
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconLike;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Menu "⋯": popover no desktop, action sheet no celular. */
export function ActionMenu({ items, label = "Ações", icon = MoreHorizontal, size = "sm", align = "end" }: { items: MenuItem[]; label?: string; icon?: IconLike; size?: "sm" | "md" | "lg"; align?: "start" | "center" | "end" }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const root = useOverlayRoot();
  if (isMobile) {
    return (
      <>
        <IconButton icon={icon} label={label} size={size} onClick={() => setOpen(true)} />
        <Dialog open={open} onClose={() => setOpen(false)} presentation="sheet" size="sm" title={label} bodyPad={0}>
          <div className="ak-actionsheet">
            {items.map(it => (
              <button key={it.id} type="button" className="ak-actionsheet__item ak-press" data-danger={it.danger || undefined} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
                {it.icon && renderIcon(it.icon, 18)}
                {it.label}
              </button>
            ))}
          </div>
        </Dialog>
      </>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton icon={icon} label={label} size={size} active={open} />
      </Popover.Trigger>
      <Popover.Portal container={root ?? undefined}>
        <Popover.Content className="ak-menu" align={align} sideOffset={6} collisionPadding={8}>
          {items.map(it => (
            <button key={it.id} type="button" className="ak-menu__item" data-danger={it.danger || undefined} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && renderIcon(it.icon, 15)}
              {it.label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Matriz de comparação (escalas, tarifário): tabela em todo tamanho, 1ª coluna e header fixos. */
export function ScrollMatrix({ children, stickyFirstCol = true, minWidth, maxHeight, className, style }: {
  children: React.ReactNode; stickyFirstCol?: boolean; minWidth?: number; maxHeight?: number | string; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={`ak-matrix-wrap${className ? ` ${className}` : ""}`} style={{ maxHeight, ...style }} role="region" tabIndex={0}>
      <table className="ak-matrix" data-sticky-col={stickyFirstCol || undefined} style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}
