// Aba Tabelas — CRUD das tabelas de preço (categoria × nº de pagantes),
// importação "copiar e colar do Excel" e importação do backup do SIT.
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy, FileSpreadsheet, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { CabinCategory, RateTable } from "@/types/aura";
import type { RateBundle } from "@/services/rate-service";
import { MAX_PAX } from "@/lib/rate-engine";

interface Props {
  propertyId: string;
  bundle: RateBundle;
  onRefresh: () => Promise<void> | void;
}

const PAX_COLS = Array.from({ length: MAX_PAX }, (_, i) => String(i + 1));

/** "1.590" / "1590,50" / "R$ 990" → número (formato pt-BR do Excel). */
function parseBRLCell(raw: string): number {
  const clean = raw.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(clean);
  return isNaN(v) ? 0 : v;
}

const normKey = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Colagem do Excel: 1ª coluna é o nome da categoria, que precisa casar com uma
 * categoria cadastrada (nome operacional ou comercial). Linha sem correspondente
 * é reportada em `unmatched` em vez de virar categoria fantasma.
 */
function parseExcelPaste(
  raw: string,
  categories: CabinCategory[]
): { prices: RateTable["prices"]; unmatched: string[] } {
  const byKey: { key: string; id: string }[] = [];
  for (const c of categories) {
    byKey.push({ key: normKey(c.name), id: c.id });
    if (c.shortName) byKey.push({ key: normKey(c.shortName), id: c.id });
  }

  const prices: RateTable["prices"] = {};
  const unmatched: string[] = [];

  for (const line of raw.split("\n")) {
    const cells = line.split("\t");
    if (cells.length < 2) continue;
    const rawName = cells[0].trim();
    if (!rawName) continue;

    const row: Record<string, number> = {};
    for (let i = 1; i <= MAX_PAX && i < cells.length; i++) {
      const v = parseBRLCell(cells[i]);
      if (v > 0) row[String(i)] = v;
    }
    if (Object.keys(row).length === 0) continue;

    const key = normKey(rawName);
    const catId =
      byKey.find((e) => e.key === key)?.id ??
      byKey.find((e) => e.key.includes(key) || key.includes(e.key))?.id;

    if (catId) prices[catId] = row;
    else unmatched.push(rawName);
  }
  return { prices, unmatched };
}

function TableCard({
  propertyId, table, categories, onRefresh,
}: {
  propertyId: string;
  table: RateTable;
  categories: CabinCategory[];
  onRefresh: Props["onRefresh"];
}) {
  const [name, setName] = useState(table.name);
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, table: { id: table.id, name: name.trim(), prices } }),
      });
      if (!res.ok) throw new Error();
      // Refresh ANTES de soltar o dirty: senão o sync-effect reverte a UI para
      // o bundle antigo enquanto o fetch novo ainda está no ar.
      await onRefresh();
      setDirty(false);
      toast.success("Tabela salva.");
    } catch {
      toast.error("Erro ao salvar a tabela.");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    try {
      const res = await fetch("/api/admin/tarifario/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, table: { name: `${name} (cópia)`, prices } }),
      });
      if (!res.ok) throw new Error();
      toast.success("Tabela duplicada.");
      await onRefresh();
    } catch {
      toast.error("Erro ao duplicar.");
    }
  };

  const remove = async () => {
    if (!confirm(`Excluir a tabela "${name}"? Regras de calendário que a usam ficarão sem preço.`)) return;
    try {
      const res = await fetch(
        `/api/admin/tarifario/tables?id=${table.id}&propertyId=${propertyId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      toast.success("Tabela excluída.");
      await onRefresh();
    } catch {
      toast.error("Erro ao excluir (verifique sua permissão).");
    }
  };

  const catById = new Map(categories.map((c) => [c.id, c]));
  // Só linhas de categorias que ainda existem (chave órfã fica escondida).
  const rowIds = Object.keys(prices).filter((id) => catById.has(id));
  const available = categories.filter((c) => !prices[c.id]);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          className="field-input !w-auto flex-1 min-w-[220px] font-semibold"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
        />
        <Button variant="outline" size="sm" onClick={duplicate}>
          <Copy size={13} className="mr-1" /> Duplicar
        </Button>
        <Button variant="outline" size="sm" className="text-red-600" onClick={remove}>
          <Trash2 size={13} className="mr-1" /> Excluir
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
          {dirty ? "Salvar alterações" : "Salvo"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 text-xs font-bold text-muted-foreground uppercase">Categoria</th>
              {PAX_COLS.map((n) => (
                <th key={n} className="px-2 py-2 text-xs font-bold text-muted-foreground text-center w-24">
                  {n} pax
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rowIds.length === 0 && (
              <tr>
                <td colSpan={MAX_PAX + 2} className="text-center text-muted-foreground text-sm py-6">
                  Tabela vazia — adicione categorias abaixo.
                </td>
              </tr>
            )}
            {rowIds.map((catId) => (
              <tr key={catId} className="border-t border-border">
                <td className="px-2 py-1.5 font-medium text-foreground whitespace-nowrap">
                  {catById.get(catId)!.name}
                </td>
                {PAX_COLS.map((pax) => (
                  <td key={pax} className="px-1 py-1">
                    <input
                      type="number"
                      className="w-full text-center font-semibold text-blue-600 bg-secondary/40 rounded-md px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      value={prices[catId]?.[pax] ?? ""}
                      onChange={(e) => setPrice(catId, pax, e.target.value)}
                      placeholder="—"
                    />
                  </td>
                ))}
                <td className="text-center">
                  <button onClick={() => removeCategory(catId)} title="Remover da tabela"
                    className="text-muted-foreground hover:text-red-600">
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 mt-3 items-center">
        <select className="field-input !w-72" value={newCategoryId}
          onChange={(e) => setNewCategoryId(e.target.value)}>
          <option value="">Adicionar categoria…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={addCategory} disabled={!newCategoryId}>
          <Plus size={13} className="mr-1" /> Adicionar
        </Button>
        {available.length === 0 && (
          <span className="text-[11px] text-muted-foreground">
            Todas as categorias da propriedade já estão nesta tabela.
          </span>
        )}
      </div>
    </div>
  );
}

export default function TablesTab({ propertyId, bundle, onRefresh }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [excelText, setExcelText] = useState("");
  const [excelName, setExcelName] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = bundle.categories;

  const createTable = async () => {
    if (!newName.trim()) return toast.error("Dê um nome à tabela.");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/tarifario/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const processExcel = async () => {
    const { prices, unmatched } = parseExcelPaste(excelText, categories);
    if (Object.keys(prices).length === 0) {
      return toast.error(
        unmatched.length
          ? `Nenhuma categoria reconhecida: ${unmatched.join(", ")}. Cadastre-as em Cabanas → Categorias.`
          : "Nada reconhecido — cole as células direto do Excel (com TAB entre colunas)."
      );
    }
    if (unmatched.length) {
      toast.warning(`Ignoradas (sem categoria cadastrada): ${unmatched.join(", ")}`, { duration: 8000 });
    }
    try {
      const res = await fetch("/api/admin/tarifario/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          table: { name: excelName.trim() || `Importada ${new Date().toLocaleDateString("pt-BR")}`, prices },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Tabela importada (${Object.keys(prices).length} categorias).`);
      setExcelOpen(false); setExcelText(""); setExcelName("");
      await onRefresh();
    } catch {
      toast.error("Erro ao importar.");
    }
  };

  const importSit = async (file: File) => {
    setImporting(true);
    try {
      const backup = JSON.parse(await file.text());
      const res = await fetch("/api/admin/tarifario/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, backup }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha na importação");
      toast.success(
        `SIT importado: ${data.tables} tabelas, ${data.periods} regras, ${data.promos} promoções, ${data.discounts} descontos.` +
        (data.skippedWeddings ? ` ${data.skippedWeddings} casamentos ignorados (use o módulo Casamentos).` : "")
      );
      if (data.unmatchedCategories?.length) {
        toast.warning(
          `Sem categoria cadastrada (preços descartados): ${data.unmatchedCategories.join(", ")}. ` +
          `Cadastre em Cabanas → Categorias (use o nome comercial) e importe de novo.`,
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
    <div className="space-y-4">
      <div className="bg-card border border-dashed border-blue-300 rounded-2xl p-4 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[240px]">
          <label className="field-label">Nova tabela de preços</label>
          <input className="field-input" placeholder="Ex.: Verão 2027 - Final de semana"
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTable()} />
        </div>
        <Button onClick={createTable} disabled={creating}>
          <Plus size={15} className="mr-1" /> Criar vazia
        </Button>
        <Button variant="secondary" onClick={() => setExcelOpen(true)}>
          <FileSpreadsheet size={15} className="mr-1" /> Colar do Excel
        </Button>
        <Button variant="outline" disabled={importing}
          onClick={() => {
            if (confirm(
              "Importar backup do SIT?\n\nIsso SUBSTITUI todas as tabelas e regras de calendário atuais desta propriedade e mescla a configuração comercial. Casamentos e eventos do backup são ignorados."
            )) fileRef.current?.click();
          }}>
          {importing ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Upload size={15} className="mr-1" />}
          Importar backup SIT
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => e.target.files?.[0] && importSit(e.target.files[0])} />
      </div>

      {bundle.tables.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-14 text-center text-muted-foreground">
          <p className="text-3xl mb-2">💰</p>
          <p>Nenhuma tabela de preços ainda.</p>
          <p className="text-xs mt-1">Crie uma vazia, cole do Excel ou importe o backup do SIT.</p>
        </div>
      ) : (
        bundle.tables.map((t) => (
          <TableCard key={t.id} propertyId={propertyId} table={t}
            categories={categories} onRefresh={onRefresh} />
        ))
      )}

      {/* Modal: colar do Excel */}
      {excelOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-background rounded-2xl w-full max-w-2xl p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground">📥 Importar do Excel</h3>
            <p className="text-sm text-muted-foreground">
              Copie as células do Excel (1ª coluna = categoria, colunas seguintes = preço para 1..6 pagantes)
              e cole aqui. As categorias são casadas automaticamente com as das cabanas.
            </p>
            <div>
              <label className="field-label">Nome da tabela</label>
              <input className="field-input" value={excelName} onChange={(e) => setExcelName(e.target.value)}
                placeholder="Ex.: Alta temporada 2027" />
            </div>
            <textarea
              className="field-input font-mono text-xs !h-48"
              placeholder={"Praia 1\t890\t990\t1090\nEco Suíte\t990\t1090"}
              value={excelText}
              onChange={(e) => setExcelText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setExcelOpen(false)}>Cancelar</Button>
              <Button onClick={processExcel}>Processar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
