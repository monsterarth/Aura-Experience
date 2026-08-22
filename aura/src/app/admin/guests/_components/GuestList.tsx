"use client";

import React from "react";
import { UserPlus, Users } from "lucide-react";
import type { Guest } from "@/types/aura";
import { T } from "@/lib/admin-tokens";
import { Pill, SkeletonList, EmptyState, SearchInput } from "@/components/aura";
import { getInitials, LANG_LABELS, LANG_TONE } from "./guest-utils";

export interface GuestListProps {
  guests: Guest[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  selectedId?: string | null;
  onSelect: (g: Guest) => void;
  onNew: () => void;
  /** Desktop: coluna com scroll próprio; celular: lista na página. */
  desktop: boolean;
}

/** Lista/busca de hóspedes (coluna do master-detail). */
export function GuestList({ guests, loading, search, onSearch, selectedId, onSelect, onNew, desktop }: GuestListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: desktop ? "100%" : undefined }}>
      <div style={{ padding: desktop ? 12 : 0, paddingBottom: 12, borderBottom: desktop ? `1px solid ${T.border}` : "none", flexShrink: 0 }}>
        <SearchInput value={search} onChange={onSearch} placeholder="Nome, CPF, e-mail, telefone…" debounce={300} loading={loading} fullWidth />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: desktop ? "auto" : "visible" }}>
        {loading && guests.length === 0 ? (
          <div style={{ padding: desktop ? 12 : 0 }}><SkeletonList rows={8} card={false} /></div>
        ) : guests.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? `Nada encontrado para “${search}”` : "Nenhum hóspede cadastrado"}
            description={search ? "Tente nome, documento, e-mail ou telefone." : "Crie o primeiro cadastro para começar."}
            action={{ label: "Novo hóspede", icon: UserPlus, onClick: onNew }}
            compact={desktop}
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {guests.map(g => {
              const active = selectedId === g.id;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(g)}
                    className="ak-press ak-focus ak-nav-item"
                    data-active={active || undefined}
                    aria-current={active ? "true" : undefined}
                    style={{
                      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
                      padding: "11px 12px", background: active ? T.glass2 : "transparent", border: "none",
                      borderLeft: `3px solid ${active ? T.g1 : "transparent"}`, borderBottom: `1px solid ${T.border}`,
                      cursor: "pointer", fontFamily: "inherit", color: T.text, minHeight: 56,
                    }}
                  >
                    <span style={{ width: 38, height: 38, borderRadius: 11, background: T.glass2, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.muted, flexShrink: 0 }}>
                      {getInitials(g.fullName)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.fullName}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.document?.type} · {g.document?.number}</span>
                        {g.preferredLanguage && <Pill tone={LANG_TONE[g.preferredLanguage] ?? "neutral"} label={LANG_LABELS[g.preferredLanguage] ?? g.preferredLanguage} />}
                      </span>
                      {g.email && <span style={{ display: "block", fontSize: 11, color: T.muted2, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.email}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {guests.length > 0 && (
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.border}`, textAlign: "center", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted2, flexShrink: 0 }}>
          {guests.length} hóspede{guests.length !== 1 ? "s" : ""}{guests.length >= 100 ? " (refine a busca)" : ""}
        </div>
      )}
    </div>
  );
}
