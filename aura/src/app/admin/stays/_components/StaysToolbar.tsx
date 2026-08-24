"use client";

// Busca + filtros avançados + ordenação + modo de visualização.
//
// Os filtros ficam atrás de um botão em TODOS os tamanhos de tela (e não inline
// no desktop): a lista de cabanas e os atalhos de período não cabem numa linha
// sem espremer a busca, e um painel só mantém o mesmo mapa mental no celular e
// no balcão. O que está ligado aparece como chip removível abaixo da barra —
// filtro escondido é a maior fonte de "sumiu uma reserva".
import React, { useMemo, useState } from "react";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, List, Rows3, SlidersHorizontal, X } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { Button, Dialog, Field, FilterChips, IconButton, SearchInput, SegmentedTabs, Select } from "@/components/aura";
import type { StaysViewMode } from "@/types/aura";
import type { StayRow, TabStatus } from "./stay-utils";
import {
  EMPTY_FILTERS, FLAG_LABELS, SORT_LABELS, activeFilterCount, type FlagId, type SortKey, type SortState, type StayFilters,
} from "./stay-filters";

const VIEW_ITEMS = [
  { id: "card" as const, label: "Cartão", icon: LayoutGrid },
  { id: "compact" as const, label: "Compacto", icon: Rows3 },
  { id: "list" as const, label: "Lista", icon: List },
];

const SORT_KEYS: SortKey[] = ["checkIn", "checkOut", "cabin", "guest", "created"];

const STATUS_BY_TAB: Partial<Record<TabStatus, { id: string; label: string }[]>> = {
  futuras: [
    { id: "pending", label: "Pré-check-in pendente" },
    { id: "pre_checkin_done", label: "Pré-check-in pronto" },
  ],
  encerradas: [
    { id: "finished", label: "Encerradas" },
    { id: "cancelled", label: "Canceladas" },
  ],
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function periodPresets(): { id: string; label: string; from: string; to: string }[] {
  const today = new Date();
  return [
    { id: "hoje", label: "Hoje", from: iso(today), to: iso(today) },
    { id: "amanha", label: "Amanhã", from: iso(addDays(today, 1)), to: iso(addDays(today, 1)) },
    { id: "7d", label: "7 dias", from: iso(today), to: iso(addDays(today, 7)) },
    { id: "mes", label: "Este mês", from: iso(startOfMonth(today)), to: iso(endOfMonth(today)) },
  ];
}

const PERIOD_HINT: Record<TabStatus, string> = {
  ativas: "Estadias que passam pelo período (chegada ou saída dentro dele).",
  futuras: "Filtra pela data de chegada.",
  pendente: "Filtra pela data de saída.",
  encerradas: "Filtra pela data de saída.",
};

export interface StaysToolbarProps {
  tab: TabStatus;
  search: string;
  onSearch: (v: string) => void;
  sort: SortState;
  onSort: (s: SortState) => void;
  filters: StayFilters;
  onFilters: (f: StayFilters) => void;
  /** Origem das opções de cabana: as próprias estadias carregadas. */
  rows: StayRow[];
  view?: StaysViewMode;
  onView?: (v: StaysViewMode) => void;
}

export function StaysToolbar({ tab, search, onSearch, sort, onSort, filters, onFilters, rows, view, onView }: StaysToolbarProps) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);
  const presets = useMemo(periodPresets, []);
  const statusOptions = STATUS_BY_TAB[tab] ?? [];

  const cabinOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of rows) if (s.cabinId) map.set(s.cabinId, s.cabinName || "Sem nome");
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [rows]);

  const patch = (p: Partial<StayFilters>) => onFilters({ ...filters, ...p });
  const activePreset = presets.find(p => p.from === filters.from && p.to === filters.to)?.id ?? null;

  const periodLabel = filters.from && filters.to
    ? `${format(new Date(`${filters.from}T00:00:00`), "dd/MM")} → ${format(new Date(`${filters.to}T00:00:00`), "dd/MM")}`
    : filters.from
      ? `A partir de ${format(new Date(`${filters.from}T00:00:00`), "dd/MM")}`
      : filters.to
        ? `Até ${format(new Date(`${filters.to}T00:00:00`), "dd/MM")}`
        : "";

  return (
    <div className="ak-toolbar">
      <div className="ak-toolbar__row">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder="Hóspede, cabana ou data…"
          debounce={150}
          wrapStyle={{ flex: "1 1 220px", maxWidth: 380 }}
        />
        <div className="ak-toolbar__right">
          <span className="ak-toolbar__filterbtn">
            <IconButton icon={SlidersHorizontal} label="Filtros" variant="secondary" size="lg" active={count > 0} onClick={() => setOpen(true)} />
            {count > 0 && <span className="ak-toolbar__badge">{count}</span>}
          </span>

          <Select
            aria-label="Ordenar por"
            fieldSize="sm"
            value={sort.key}
            onChange={e => onSort({ ...sort, key: e.target.value as SortKey })}
            wrapStyle={{ minWidth: 132 }}
          >
            {SORT_KEYS.map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
          </Select>
          <IconButton
            icon={sort.dir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow}
            label={sort.dir === "asc" ? "Ordem crescente — clique para inverter" : "Ordem decrescente — clique para inverter"}
            variant="secondary"
            onClick={() => onSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
          />

          {view && onView && (
            <SegmentedTabs<StaysViewMode>
              items={VIEW_ITEMS}
              value={view}
              onChange={onView}
              size="sm"
              iconOnlyOnMobile
              ariaLabel="Modo de visualização"
            />
          )}
        </div>
      </div>

      {count > 0 && (
        <div className="ak-toolbar__row" style={{ gap: 6 }}>
          {periodLabel && <ActiveChip label={periodLabel} onRemove={() => patch({ from: "", to: "" })} />}
          {filters.flags.map(f => (
            <ActiveChip key={f} label={FLAG_LABELS[f]} onRemove={() => patch({ flags: filters.flags.filter(x => x !== f) })} />
          ))}
          {filters.cabins.length > 0 && (
            <ActiveChip
              label={filters.cabins.length === 1 ? (cabinOptions.find(c => c.id === filters.cabins[0])?.label ?? "1 cabana") : `${filters.cabins.length} cabanas`}
              onRemove={() => patch({ cabins: [] })}
            />
          )}
          {filters.status.map(st => (
            <ActiveChip
              key={st}
              label={statusOptions.find(o => o.id === st)?.label ?? st}
              onRemove={() => patch({ status: filters.status.filter(x => x !== st) })}
            />
          ))}
          <Button variant="ghost" size="sm" onClick={() => onFilters(EMPTY_FILTERS)}>Limpar tudo</Button>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        presentation="auto"
        size="md"
        icon={SlidersHorizontal}
        title="Filtros"
        subtitle={PERIOD_HINT[tab]}
        footer={
          <>
            <Button variant="ghost" onClick={() => onFilters(EMPTY_FILTERS)}>Limpar</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Aplicar</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FilterChips
              ariaLabel="Atalhos de período"
              scroll={false}
              items={presets.map(p => ({ id: p.id, label: p.label }))}
              value={activePreset}
              onChange={id => {
                const p = presets.find(x => x.id === id);
                if (!p) return;
                patch(activePreset === id ? { from: "", to: "" } : { from: p.from, to: p.to });
              }}
            />
            <div className="ak-fieldrow" data-cols="2">
              <Field label="De">
                <input className="ak-input" type="date" value={filters.from} onChange={e => patch({ from: e.target.value })} />
              </Field>
              <Field label="Até">
                <input className="ak-input" type="date" value={filters.to} onChange={e => patch({ to: e.target.value })} />
              </Field>
            </div>
          </div>

          <Field label="Sinalizadores">
            <FilterChips<FlagId>
              multiple
              scroll={false}
              ariaLabel="Sinalizadores"
              items={(Object.keys(FLAG_LABELS) as FlagId[]).map(id => ({ id, label: FLAG_LABELS[id] }))}
              values={filters.flags}
              onChange={flags => patch({ flags })}
            />
          </Field>

          {statusOptions.length > 0 && (
            <Field label="Situação">
              <FilterChips
                multiple
                scroll={false}
                ariaLabel="Situação"
                items={statusOptions}
                values={filters.status}
                onChange={status => patch({ status })}
              />
            </Field>
          )}

          {cabinOptions.length > 0 && (
            <Field label="Cabanas" hint={filters.cabins.length ? `${filters.cabins.length} selecionada(s)` : "Nenhuma selecionada = todas"}>
              <div style={{ maxHeight: 180, overflowY: "auto", paddingRight: 2 }}>
                <FilterChips
                  multiple
                  scroll={false}
                  ariaLabel="Cabanas"
                  items={cabinOptions}
                  values={filters.cabins}
                  onChange={cabins => patch({ cabins })}
                />
              </div>
            </Field>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 999, padding: "3px 4px 3px 10px", fontSize: 11, fontWeight: 800, color: T.text }}>
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        className="ak-press ak-focus"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, border: "none", background: "none", color: T.muted, cursor: "pointer" }}
      >
        <X size={12} />
      </button>
    </span>
  );
}
