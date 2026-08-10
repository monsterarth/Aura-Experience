// Import "colar do Excel" com PREVIEW ao vivo: cola (Ctrl+V, TAB entre
// colunas — o contrato de sempre), a grade parseada aparece na hora com as
// linhas não reconhecidas em destaque, e só então confirma. Serve o import
// normal (Tabelas) e o direto-para-o-arquivo (tarifários de anos passados).
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CabinCategory, RateTable } from "@/types/aura";
import { S } from "@/app/admin/comercial/_components/shared";
import { parseExcelPaste } from "./excel-paste";
import { PriceGrid } from "./PriceGrid";

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: T.muted, marginBottom: 5, display: "block",
};

export function ExcelImportModal({ categories, toArchive, onClose, onImport }: {
  categories: CabinCategory[];
  /** true = cria a tabela já ARQUIVADA (histórico de anos passados). */
  toArchive?: boolean;
  onClose: () => void;
  onImport: (name: string, prices: RateTable["prices"]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(
    () => (text.trim() ? parseExcelPaste(text, categories) : null),
    [text, categories]
  );
  const okCount = parsed ? Object.keys(parsed.prices).length : 0;

  const confirm = async () => {
    if (!parsed || okCount === 0) {
      toast.error("Nada reconhecido — cole as células direto do Excel (com TAB entre colunas).");
      return;
    }
    setSaving(true);
    try {
      await onImport(
        name.trim() || `Importada ${new Date().toLocaleDateString("pt-BR")}`,
        parsed.prices
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao importar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24,
      }}>
      <div style={{
        width: "100%", maxWidth: 760, maxHeight: "90vh", background: T.card,
        border: `1px solid ${T.border2}`, borderRadius: 20,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,.7)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <FileSpreadsheet size={16} color={T.g1} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: T.text }}>
              {toArchive ? "Importar para o arquivo" : "Importar do Excel"}
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
              1ª coluna = categoria · seguintes = diária para 1..6 pagantes.
              {toArchive ? " A tabela nasce ARQUIVADA — só histórico, nunca precifica." : ""}
            </div>
          </div>
          <button onClick={onClose}
            style={{ padding: 7, borderRadius: 10, background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={fieldLabel}>Nome da tabela</label>
            <input autoFocus style={S.input} value={name} onChange={(e) => setName(e.target.value)}
              placeholder={toArchive ? "Ex.: Tarifário 2023" : "Ex.: Alta temporada 2027"} />
          </div>
          <div>
            <label style={fieldLabel}>Cole aqui (Ctrl+V do Excel)</label>
            <textarea
              style={{ ...S.input, height: 130, fontFamily: "ui-monospace, monospace", fontSize: 11.5, resize: "vertical" }}
              placeholder={"Praia 1\t890\t990\t1090\nEco Suíte\t990\t1090"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {/* Preview ao vivo — o que VAI ser salvo, antes de salvar. */}
          {parsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {okCount > 0 ? (
                <div style={{ ...S.row, padding: "10px 12px" }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: T.emerald, margin: "0 0 6px" }}>
                    Pré-visualização · {okCount} categoria{okCount !== 1 ? "s" : ""} reconhecida{okCount !== 1 ? "s" : ""}
                  </p>
                  <PriceGrid prices={parsed.prices} categories={categories} readOnly />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: T.red, margin: 0 }}>
                  Nenhuma categoria reconhecida ainda.
                </p>
              )}
              {parsed.unmatched.length > 0 && (
                <p style={{
                  fontSize: 11.5, color: T.amber, background: T.amberBg,
                  border: `1px solid ${T.amberBorder}`, borderRadius: 10,
                  padding: "8px 11px", margin: 0, lineHeight: 1.5,
                }}>
                  Sem categoria cadastrada (serão ignoradas): <b>{parsed.unmatched.join(", ")}</b>.
                  Cadastre em Cabanas → Categorias e cole de novo.
                </p>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "13px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancelar</button>
          <button onClick={confirm} disabled={saving || okCount === 0}
            style={{ ...S.gradBtn, marginLeft: "auto", opacity: saving || okCount === 0 ? 0.5 : 1 }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            {toArchive ? "Arquivar tabela" : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}
