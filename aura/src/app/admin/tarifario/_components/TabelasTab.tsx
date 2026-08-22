// Aba Tabelas — as tabelas de preço ATIVAS (arquivadas vivem no Arquivo).
// Recepção CONSULTA; criar/editar/importar é de gestão (canManage) — decisão
// do refactor fase 4. Toda alteração real gera versão no arquivo (servidor).
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, Copy, FileSpreadsheet, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CabinCategory, RateTable } from "@/types/aura";
import { useConfirm } from "@/components/aura";
import type { RateBundle } from "@/services/rate-service";
import { S, pillS } from "@/app/admin/comercial/_components/shared";
import { ExcelImportModal } from "./ExcelImportModal";
import { PriceGrid } from "./PriceGrid";

function TableCard({ propertyId, table, categories, canManage, onRefresh }: {
  propertyId: string;
  table: RateTable;
  categories: CabinCategory[];
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const [name, setName] = useState(table.name);
  const confirm = useConfirm();
  const [prices, setPrices] = useState<RateTable["prices"]>(table.prices || {});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState("");

  // Sincroniza com o servidor quando não há edição local pendente.
  useEffect(() => {
    if (!dirty) {
      setName(table.name);
      setPrices(table.prices || {});
    }
  }, [table, dirty]);

  const setPrice = (catId: string, pax: string, value: string) => {
    setDirty(true);
    setPrices((prev) => {
      const next = { ...prev, [catId]: { ...(prev[catId] || {}) } };
      const v = parseFloat(value);
      if (!value || isNaN(v) || v <= 0) delete next[catId][pax];
      else next[catId][pax] = v;
      return next;
    });
  };

  const addCategory = () => {
    if (!newCategoryId) return;
    if (prices[newCategoryId]) return toast.error("Categoria já está na tabela.");
    setDirty(true);
    setPrices((prev) => ({ ...prev, [newCategoryId]: {} }));
    setNewCategoryId("");
  };

  const removeCategory = (catId: string) => {
    setDirty(true);
    setPrices((prev) => {
      const next = { ...prev };
      delete next[catId];
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Dê um nome à tabela.");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/tables", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, table: { id: table.id, name: name.trim(), prices } }),
      });
      if (!res.ok) throw new Error();
      // Refresh ANTES de soltar o dirty: senão o sync-effect reverte a UI.
      await onRefresh();
      setDirty(false);
      toast.success("Tabela salva — a versão anterior foi para o arquivo.");
    } catch {
      toast.error("Erro ao salvar a tabela.");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    try {
      const res = await fetch("/api/admin/tarifario/tables", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, table: { name: `${name} (cópia)`, prices } }),
      });
      if (!res.ok) throw new Error();
      toast.success("Tabela duplicada.");
      await onRefresh();
    } catch {
      toast.error("Erro ao duplicar.");
    }
  };

  const archive = async () => {
    try {
      const res = await fetch("/api/admin/tarifario/tables/archive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, id: table.id, archived: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      if (data?.referencedBy?.length) {
        toast.warning(
          `Arquivada, mas ainda usada por: ${data.referencedBy.map((r: { name: string }) => r.name).join(", ")}. ` +
          "O calendário continua precificando essas datas.",
          { duration: 9000 }
        );
      } else {
        toast.success("Tabela arquivada — está na aba Arquivo.");
      }
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao arquivar.");
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Excluir tabela?", description: `"${name}" sai do tarifário. O último estado fica no arquivo, mas regras que a usam ficarão sem preço — prefere arquivar?`, confirmLabel: "Excluir", tone: "danger" }))) return;
    try {
      const res = await fetch(
        `/api/admin/tarifario/tables?id=${table.id}&propertyId=${propertyId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      toast.success("Tabela excluída (último estado no arquivo).");
      await onRefresh();
    } catch {
      toast.error("Erro ao excluir (verifique sua permissão).");
    }
  };

  const available = categories.filter((c) => !prices[c.id]);

  return (
    <div style={{ ...S.card, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {canManage ? (
          <input style={{ ...S.input, flex: 1, minWidth: 220, fontWeight: 800 }}
            value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        ) : (
          <span style={{ fontSize: 15, fontWeight: 900, color: T.text, flex: 1, minWidth: 220 }}>{table.name}</span>
        )}
        {canManage && (<>
          <button onClick={duplicate} style={{ ...S.ghostBtn, padding: "7px 11px", fontSize: 11.5 }}>
            <Copy size={12} /> Duplicar
          </button>
          <button onClick={archive} title="Sai das listas ativas; vive na aba Arquivo"
            style={{ ...S.ghostBtn, padding: "7px 11px", fontSize: 11.5 }}>
            <Archive size={12} /> Arquivar
          </button>
          <button onClick={remove}
            style={{ ...S.ghostBtn, padding: "7px 11px", fontSize: 11.5, color: T.red, borderColor: T.redBorder }}>
            <Trash2 size={12} /> Excluir
          </button>
          <button onClick={save} disabled={saving || !dirty}
            style={{ ...S.gradBtn, padding: "7px 14px", fontSize: 12, opacity: saving || !dirty ? 0.5 : 1 }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {dirty ? "Salvar" : "Salvo"}
          </button>
        </>)}
      </div>

      <PriceGrid prices={prices} categories={categories} readOnly={!canManage}
        onSetPrice={setPrice} onRemoveCategory={removeCategory} />

      {canManage && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <select style={{ ...S.input, width: 280, background: T.card }} value={newCategoryId}
            onChange={(e) => setNewCategoryId(e.target.value)}>
            <option value="">Adicionar categoria…</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={addCategory} disabled={!newCategoryId}
            style={{ ...S.ghostBtn, padding: "8px 12px", opacity: newCategoryId ? 1 : 0.5 }}>
            <Plus size={13} /> Adicionar
          </button>
          {available.length === 0 && (
            <span style={{ fontSize: 10.5, color: T.muted }}>
              Todas as categorias já estão nesta tabela.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function TabelasTab({ propertyId, bundle, canManage, onRefresh }: {
  propertyId: string;
  bundle: RateBundle;
  canManage: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const [newName, setNewName] = useState("");
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = bundle.tables.filter((t) => !t.archivedAt);
  const archivedCount = bundle.tables.length - active.length;

  const createTable = async () => {
    if (!newName.trim()) return toast.error("Dê um nome à tabela.");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/tarifario/tables", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, table: { name: newName.trim(), prices: {} } }),
      });
      if (!res.ok) throw new Error();
      setNewName("");
      toast.success("Tabela criada.");
      await onRefresh();
    } catch {
      toast.error("Erro ao criar a tabela.");
    } finally {
      setCreating(false);
    }
  };

  const importExcel = async (name: string, prices: RateTable["prices"]) => {
    const res = await fetch("/api/admin/tarifario/tables", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, table: { name, prices } }),
    });
    if (!res.ok) throw new Error("Erro ao importar.");
    toast.success(`Tabela importada (${Object.keys(prices).length} categorias).`);
    await onRefresh();
  };

  const importSit = async (file: File) => {
    setImporting(true);
    try {
      const backup = JSON.parse(await file.text());
      const res = await fetch("/api/admin/tarifario/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, backup }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha na importação");
      toast.success(
        `SIT importado: ${data.tables} tabelas, ${data.periods} regras, ${data.promos} promoções, ${data.discounts} descontos.` +
        (data.skippedWeddings ? ` ${data.skippedWeddings} casamentos ignorados.` : "")
      );
      if (data.unmatchedCategories?.length) {
        toast.warning(
          `Sem categoria cadastrada (preços descartados): ${data.unmatchedCategories.join(", ")}.`,
          { duration: 12000 }
        );
      }
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Arquivo inválido.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canManage ? (
        <div style={{
          ...S.card, borderStyle: "dashed", padding: 16,
          display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted, marginBottom: 5, display: "block" }}>
              Nova tabela de preços
            </label>
            <input style={S.input} placeholder="Ex.: Verão 2027 - Final de semana"
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createTable()} />
          </div>
          <button onClick={createTable} disabled={creating}
            style={{ ...S.gradBtn, opacity: creating ? 0.6 : 1 }}>
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Criar vazia
          </button>
          <button onClick={() => setExcelOpen(true)} style={S.ghostBtn}>
            <FileSpreadsheet size={13} /> Colar do Excel
          </button>
          <button disabled={importing} style={{ ...S.ghostBtn, opacity: importing ? 0.6 : 1 }}
            onClick={async () => {
              if (await confirm({ title: "Importar backup do SIT?", description: "Isso SUBSTITUI todas as tabelas e regras de calendário atuais (as tabelas atuais ficam versionadas no arquivo) e mescla a configuração comercial.", confirmLabel: "Importar", tone: "danger" })) fileRef.current?.click();
            }}>
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Backup SIT
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && importSit(e.target.files[0])} />
        </div>
      ) : (
        <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
          Consulta — criação e edição de tabelas são da gestão. Precisa de um ajuste
          de preço? Fale com a gerência ou use as <b>flutuações</b> (aba ao lado).
        </p>
      )}

      {active.length === 0 ? (
        <div style={{
          border: `1px dashed ${T.border2}`, borderRadius: 16, padding: "48px 24px",
          textAlign: "center", color: T.muted, fontSize: 13,
        }}>
          Nenhuma tabela ativa.
          {archivedCount > 0 ? ` (${archivedCount} no arquivo)` : " Crie uma, cole do Excel ou importe o backup do SIT."}
        </div>
      ) : (
        active.map((t) => (
          <TableCard key={t.id} propertyId={propertyId} table={t}
            categories={bundle.categories} canManage={canManage} onRefresh={onRefresh} />
        ))
      )}

      {archivedCount > 0 && (
        <p style={{ fontSize: 11, color: T.muted, margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={pillS(T.glass2, T.muted, T.border2)}>{archivedCount} arquivada{archivedCount !== 1 ? "s" : ""}</span>
          — histórico completo na aba Arquivo.
        </p>
      )}

      {excelOpen && (
        <ExcelImportModal categories={bundle.categories}
          onClose={() => setExcelOpen(false)} onImport={importExcel} />
      )}
    </div>
  );
}
