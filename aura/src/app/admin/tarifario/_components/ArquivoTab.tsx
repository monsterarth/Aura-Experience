// Aba Arquivo — o histórico de preços da fazenda: tabelas ARQUIVADAS
// (manuais ou importadas de anos passados) + a linha do tempo de VERSÕES de
// qualquer tabela (snapshot automático a cada alteração real / exclusão).
// Leitura para todos os papéis da página; restaurar/importar é de gestão.
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, FileSpreadsheet, History, Loader2 } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { RateTable, RateTableVersion } from "@/types/aura";
import type { RateBundle } from "@/services/rate-service";
import { S, pillS } from "@/app/admin/comercial/_components/shared";
import { ExcelImportModal } from "./ExcelImportModal";
import { PriceGrid } from "./PriceGrid";

function fmtTs(ts: string): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Uma tabela arquivada — grid fechado por padrão + linha do tempo. */
function ArchivedCard({ propertyId, table, bundle, canManage, onRefresh }: {
  propertyId: string;
  table: RateTable;
  bundle: RateBundle;
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const restore = async () => {
    setRestoring(true);
    try {
      const res = await fetch("/api/admin/tarifario/tables/archive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, id: table.id, archived: false }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      toast.success("Tabela restaurada — voltou para a aba Tabelas.");
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao restaurar.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div style={{ ...S.card, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setOpen((o) => !o)}
          style={{ padding: 4, borderRadius: 8, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text, flex: 1, minWidth: 160 }}>
          {table.name}
        </span>
        <span style={pillS(T.glass2, T.muted, T.border2)}>
          <Archive size={9} /> arquivada{table.archivedAt ? ` em ${new Date(table.archivedAt).toLocaleDateString("pt-BR")}` : ""}
        </span>
        {canManage && (
          <button onClick={restore} disabled={restoring}
            style={{ ...S.ghostBtn, padding: "6px 10px", fontSize: 11, opacity: restoring ? 0.6 : 1 }}>
            {restoring ? <Loader2 size={12} className="animate-spin" /> : <ArchiveRestore size={12} />}
            Restaurar
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <PriceGrid prices={table.prices || {}} categories={bundle.categories} readOnly />
          <VersionTimeline propertyId={propertyId} tableId={table.id} bundle={bundle} />
        </div>
      )}
    </div>
  );
}

/** Linha do tempo de versões de uma tabela (lazy — carrega ao abrir). */
function VersionTimeline({ propertyId, tableId, bundle }: {
  propertyId: string;
  tableId: string;
  bundle: RateBundle;
}) {
  const [versions, setVersions] = useState<RateTableVersion[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/tarifario/tables/versions?propertyId=${propertyId}&tableId=${tableId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setVersions(d?.versions ?? []); })
      .catch(() => { if (alive) setVersions([]); });
    return () => { alive = false; };
  }, [propertyId, tableId]);

  if (versions === null) {
    return <p style={{ fontSize: 11, color: T.muted, margin: "10px 0 0" }}><Loader2 size={11} className="animate-spin" /> carregando versões…</p>;
  }
  if (versions.length === 0) {
    return <p style={{ fontSize: 11, color: T.muted, margin: "10px 0 0" }}>Nenhuma versão anterior registrada.</p>;
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase", color: T.muted, margin: 0 }}>
        <History size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
        Versões anteriores ({versions.length})
      </p>
      {versions.map((v) => (
        <div key={v.id} style={{ ...S.row, padding: "8px 11px" }}>
          <button onClick={() => setOpenId((cur) => (cur === v.id ? null : v.id))}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              color: T.text, padding: 0, textAlign: "left",
            }}>
            {openId === v.id ? <ChevronDown size={12} color={T.muted} /> : <ChevronRight size={12} color={T.muted} />}
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {v.name}
            </span>
            <span style={{ fontSize: 10.5, color: T.muted, flexShrink: 0 }}>
              até {fmtTs(v.replacedAt)}{v.replacedByName ? ` · ${v.replacedByName}` : ""}
            </span>
          </button>
          {openId === v.id && (
            <div style={{ marginTop: 8 }}>
              <PriceGrid prices={v.prices || {}} categories={bundle.categories} readOnly />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ArquivoTab({ propertyId, bundle, canManage, onRefresh }: {
  propertyId: string;
  bundle: RateBundle;
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  // Linha do tempo das ATIVAS também — o histórico não é só das arquivadas.
  const [activeTimelineId, setActiveTimelineId] = useState<string>("");

  const archived = bundle.tables.filter((t) => t.archivedAt);
  const active = bundle.tables.filter((t) => !t.archivedAt);

  const importToArchive = async (name: string, prices: RateTable["prices"]) => {
    const res = await fetch("/api/admin/tarifario/tables", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, table: { name, prices, archived: true } }),
    });
    if (!res.ok) throw new Error("Erro ao importar para o arquivo.");
    toast.success("Tarifário histórico arquivado.");
    await onRefresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <p style={{ fontSize: 12.5, color: T.muted, margin: 0, flex: 1, minWidth: 260, lineHeight: 1.6 }}>
          O histórico de preços da fazenda: toda alteração numa tabela guarda a versão
          anterior aqui, e tarifários antigos podem ser arquivados ou importados
          direto do Excel. Nada daqui precifica — é memória.
        </p>
        {canManage && (
          <button onClick={() => setImportOpen(true)} style={S.ghostBtn}>
            <FileSpreadsheet size={13} /> Importar para o arquivo
          </button>
        )}
      </div>

      {/* Arquivadas */}
      {archived.length === 0 ? (
        <div style={{
          border: `1px dashed ${T.border2}`, borderRadius: 16, padding: "36px 24px",
          textAlign: "center", color: T.muted, fontSize: 12.5,
        }}>
          Nenhuma tabela arquivada ainda — arquive pela aba Tabelas ou importe um
          tarifário antigo do Excel.
        </div>
      ) : (
        archived.map((t) => (
          <ArchivedCard key={t.id} propertyId={propertyId} table={t}
            bundle={bundle} canManage={canManage} onRefresh={onRefresh} />
        ))
      )}

      {/* Versões das tabelas ativas */}
      {active.length > 0 && (
        <div style={{ ...S.card, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase", color: T.muted, margin: 0 }}>
            <History size={10} style={{ verticalAlign: -1, marginRight: 5 }} />
            Versões de uma tabela ativa
          </p>
          <select style={{ ...S.input, maxWidth: 340, background: T.card }} value={activeTimelineId}
            onChange={(e) => setActiveTimelineId(e.target.value)}>
            <option value="">Escolha a tabela…</option>
            {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {activeTimelineId && (
            <VersionTimeline key={activeTimelineId} propertyId={propertyId}
              tableId={activeTimelineId} bundle={bundle} />
          )}
        </div>
      )}

      {importOpen && (
        <ExcelImportModal categories={bundle.categories} toArchive
          onClose={() => setImportOpen(false)} onImport={importToArchive} />
      )}
    </div>
  );
}
