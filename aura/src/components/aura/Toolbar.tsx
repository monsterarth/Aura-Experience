"use client";

import React, { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Dialog } from "./Dialog";
import { Button, IconButton } from "./Button";
import { useIsMobile } from "./hooks";

export interface ToolbarProps {
  /** Normalmente um <SearchInput>. */
  search?: React.ReactNode;
  /** Selects/controles de filtro. No celular vão para um sheet "Filtros". */
  filters?: React.ReactNode;
  /** <FilterChips> — linha própria, rola no celular. */
  chips?: React.ReactNode;
  /** Botões à direita (secundários; a ação primária fica no PageHeader/FAB). */
  actions?: React.ReactNode;
  /** Alternador de visualização (grid/lista). */
  view?: React.ReactNode;
  activeFilterCount?: number;
  onClear?: () => void;
  sticky?: boolean;
  filtersTitle?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Barra de busca/filtros/ações. No celular, filtros viram sheet com badge de ativos. */
export function Toolbar({ search, filters, chips, actions, view, activeFilterCount = 0, onClear, sticky, filtersTitle = "Filtros", className, style }: ToolbarProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  return (
    <div className={`ak-toolbar${className ? ` ${className}` : ""}`} data-sticky={sticky || undefined} style={style}>
      <div className="ak-toolbar__row">
        {search}
        {filters && !isMobile && <div className="ak-toolbar__filters-inline">{filters}</div>}
        {filters && isMobile && (
          <span className="ak-toolbar__filterbtn">
            <IconButton icon={SlidersHorizontal} label={filtersTitle} variant="secondary" size="lg" onClick={() => setOpen(true)} active={activeFilterCount > 0} />
            {activeFilterCount > 0 && <span className="ak-toolbar__badge">{activeFilterCount}</span>}
          </span>
        )}
        {(view || actions) && (
          <div className="ak-toolbar__right">
            {view}
            {actions}
          </div>
        )}
      </div>
      {chips && <div className="ak-toolbar__row">{chips}</div>}
      {filters && isMobile && (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          presentation="sheet"
          size="md"
          title={filtersTitle}
          footer={
            <>
              {onClear && <Button variant="ghost" onClick={() => { onClear(); }}>Limpar</Button>}
              <Button variant="primary" onClick={() => setOpen(false)}>Aplicar</Button>
            </>
          }
        >
          <div className="ak-toolbar__filters-sheet">{filters}</div>
        </Dialog>
      )}
    </div>
  );
}
