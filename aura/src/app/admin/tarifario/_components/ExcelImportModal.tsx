// Import "colar do Excel" com PREVIEW ao vivo: cola (Ctrl+V, TAB entre
// colunas — o contrato de sempre), a grade parseada aparece na hora com as
// linhas não reconhecidas em destaque, e só então confirma. Serve o import
// normal (Tabelas) e o direto-para-o-arquivo (tarifários de anos passados).
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CabinCategory, RateTable } from "@/types/aura";
import { Dialog, Field, Input, Textarea, Button } from "@/components/aura";
import { parseExcelPaste } from "./excel-paste";
import { PriceGrid } from "./PriceGrid";

export function ExcelImportModal({ categories, toArchive, open = true, onClose, onImport }: {
  categories: CabinCategory[];
  /** true = cria a tabela já ARQUIVADA (histórico de anos passados). */
  toArchive?: boolean;
  open?: boolean;
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

  const confirmImport = async () => {
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
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      presentation="auto"
      size="lg"
      icon={FileSpreadsheet}
      title={toArchive ? "Importar para o arquivo" : "Importar do Excel"}
      subtitle={<>1ª coluna = categoria · seguintes = diária para 1..6 pagantes.{toArchive ? " A tabela nasce ARQUIVADA — só histórico, nunca precifica." : ""}</>}
      footerRow
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" icon={FileSpreadsheet} loading={saving} loadingText="Importando…" disabled={okCount === 0} onClick={confirmImport}>
            {toArchive ? "Arquivar tabela" : "Importar"}
          </Button>
        </>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome da tabela">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={toArchive ? "Ex.: Tarifário 2023" : "Ex.: Alta temporada 2027"} />
        </Field>
        <Field label="Cole aqui (Ctrl+V do Excel)">
          <Textarea
            rows={6}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            placeholder={"Praia 1\t890\t990\t1090\nEco Suíte\t990\t1090"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>

        {/* Preview ao vivo — o que VAI ser salvo, antes de salvar. */}
        {parsed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {okCount > 0 ? (
              <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${T.border}`, background: T.glass }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: T.emerald, margin: "0 0 6px" }}>
                  Pré-visualização · {okCount} categoria{okCount !== 1 ? "s" : ""} reconhecida{okCount !== 1 ? "s" : ""}
                </p>
                <PriceGrid prices={parsed.prices} categories={categories} readOnly />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: T.red, margin: 0 }}>Nenhuma categoria reconhecida ainda.</p>
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
    </Dialog>
  );
}
