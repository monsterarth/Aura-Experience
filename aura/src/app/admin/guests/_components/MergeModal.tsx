"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Merge, X } from "lucide-react";
import { toast } from "sonner";
import type { Guest } from "@/types/aura";
import { GuestService } from "@/services/guest-service";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T } from "@/lib/admin-tokens";
import { Dialog, Button, SearchInput, Card, IconButton, SectionLabel, SkeletonList } from "@/components/aura";

export interface MergeModalProps {
  open: boolean;
  primary: Guest;
  propertyId: string;
  onClose: () => void;
  onSuccess: () => void;
  actorId: string;
  actorName: string;
}

/** Unificação de cadastros duplicados: busca o secundário, compara e confirma. */
export function MergeModal({ open, primary, propertyId, onClose, onSuccess, actorId, actorName }: MergeModalProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Guest[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [secondary, setSecondary] = useState<Guest | null>(null);
  const [secondaryStays, setSecondaryStays] = useState(0);
  const [merging, setMerging] = useState(false);
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty: !!secondary && !merging, escape: false });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) { setSearch(""); setResults([]); setSecondary(null); }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const data = await GuestService.listGuests(propertyId, search);
        setResults(data.filter(g => g.id !== primary.id));
      } finally {
        setLoadingSearch(false);
      }
    }, 300);
  }, [search, propertyId, primary.id]);

  const selectSecondary = async (g: Guest) => {
    setSecondary(g);
    setResults([]);
    setSearch("");
    const stays = await GuestService.getGuestStays(propertyId, g.id);
    setSecondaryStays(stays.length);
  };

  const handleMerge = async () => {
    if (!secondary) return;
    setMerging(true);
    try {
      const count = await GuestService.mergeGuests(propertyId, primary.id, secondary.id, actorId, actorName);
      toast.success(`Cadastros unificados. ${count} estadia(s) transferida(s).`);
      onSuccess();
    } catch (e) {
      // A rota devolve o motivo (cargo, propriedade errada, ficha inexistente).
      toast.error(e instanceof Error ? e.message : "Erro ao unificar cadastros.");
    } finally {
      setMerging(false);
    }
  };

  const docLine = (g: Guest) => `${g.document?.type ?? "—"} · ${g.document?.number ?? "—"}`;

  return (
    <Dialog
      open={open}
      onClose={merging ? () => {} : requestClose}
      presentation="auto"
      size="md"
      icon={Merge}
      iconTone="brand"
      title="Unificar cadastros"
      subtitle={<>Manter: <strong style={{ color: T.text }}>{primary.fullName}</strong></>}
      panelProps={guardProps}
      footer={secondary ? (
        <>
          <Button variant="secondary" onClick={requestClose} disabled={merging}>Cancelar</Button>
          <Button variant="danger-solid" icon={Merge} onClick={handleMerge} loading={merging} loadingText="Unificando…">Confirmar unificação</Button>
        </>
      ) : undefined}
    >
      {!secondary ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Busque o cadastro <strong style={{ color: T.text }}>duplicado</strong> que será removido:</p>
          <SearchInput value={search} onChange={setSearch} placeholder="Nome, documento, e-mail…" debounce={0} loading={loadingSearch} fullWidth autoFocus />
          {loadingSearch && results.length === 0 && search.trim() && <SkeletonList rows={3} avatar={false} />}
          {results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {results.map(g => (
                <Card key={g.id} pad={12} interactive onClick={() => void selectSecondary(g)} style={{ textAlign: "left", width: "100%" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{g.fullName}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{docLine(g)}{g.email ? ` · ${g.email}` : ""}</div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ak-fieldrow" data-cols="2" style={{ gap: 10 }}>
            <Card tone="green" pad={12}>
              <SectionLabel style={{ color: T.green, marginBottom: 6 }}>Manter</SectionLabel>
              <div style={{ fontSize: 13, fontWeight: 900, color: T.text, lineHeight: 1.2 }}>{primary.fullName}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{docLine(primary)}</div>
              {primary.email && <div style={{ fontSize: 11, color: T.muted2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{primary.email}</div>}
              {primary.phone && <div style={{ fontSize: 11, color: T.muted2 }}>{primary.phone}</div>}
            </Card>
            <Card tone="red" pad={12}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <SectionLabel style={{ color: T.red }}>Remover</SectionLabel>
                <IconButton icon={X} label="Escolher outro" size="sm" onClick={() => setSecondary(null)} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color: T.text, lineHeight: 1.2 }}>{secondary.fullName}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{docLine(secondary)}</div>
              {secondary.email && <div style={{ fontSize: 11, color: T.muted2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{secondary.email}</div>}
              {secondary.phone && <div style={{ fontSize: 11, color: T.muted2 }}>{secondary.phone}</div>}
            </Card>
          </div>
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 12 }}>
            <AlertTriangle size={16} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.5 }}>
              O cadastro <strong style={{ color: T.red }}>{secondary.fullName}</strong> será <strong>apagado permanentemente</strong>.
              {secondaryStays > 0 ? <> As <strong>{secondaryStays} estadia(s)</strong> serão transferidas para o cadastro principal.</> : " Este cadastro não possui estadias."}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
