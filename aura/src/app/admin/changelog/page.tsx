"use client";

import { Dialog, IconButton, SkeletonList } from "@/components/aura";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { toast } from "sonner";
import { useCloseGuard } from "@/lib/use-discard-guard";
import {
  Plus, Trash2, X, History,
  Sparkles, TrendingUp, Wrench,
  Globe, EyeOff, Save, Loader2,
  FileText, ChevronRight, Check,
  RotateCcw,
} from "lucide-react";
import type { Changelog, ChangelogEntry, ChangelogEntryType } from "@/types/aura";

/* ─── types ───────────────────────────────────────────────────── */

interface ParsedEntry {
  type: ChangelogEntryType;
  text: string;
  section: string;
  include: boolean;
}

interface ParseResult {
  version: string;
  label:   string;
  date:    string;
  entries: ParsedEntry[];
}

/* ─── constants ───────────────────────────────────────────────── */

const ENTRY_TYPES: {
  value: ChangelogEntryType;
  label: string;
  icon:  React.ElementType;
  color: string;
  bg:    string;
  border: string;
}[] = [
  { value: "feature",     label: "Novo",     icon: Sparkles,   color: "var(--t-blue)", bg: "var(--t-blue-bg)",   border: "var(--t-blue-border)"   },
  { value: "improvement", label: "Melhoria", icon: TrendingUp, color: "var(--t-violet)", bg: "var(--t-violet-bg)", border: "var(--t-violet-border)" },
  { value: "fix",         label: "Correção", icon: Wrench,     color: "var(--t-emerald)", bg: "var(--t-emerald-bg)",  border: "var(--t-emerald-border)"  },
];

const TYPE_CYCLE: Record<ChangelogEntryType, ChangelogEntryType> = {
  feature: "improvement",
  improvement: "fix",
  fix: "feature",
};

const getTypeMeta = (t: ChangelogEntryType) => ENTRY_TYPES.find(m => m.value === t) ?? ENTRY_TYPES[0];

/* ─── markdown parser ─────────────────────────────────────────── */

function parseMarkdownChangelog(md: string): ParseResult {
  const lines = md.split("\n");
  let version = "";
  let label   = "";
  let currentType: ChangelogEntryType = "feature";
  let currentSection = "";
  const entries: ParsedEntry[] = [];

  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t === "---") continue;

    // H1 — título principal: extrai versão e label
    if (/^#\s/.test(t)) {
      const vm = t.match(/(\d+\.\d+[\.\d]*)/);
      if (vm) version = vm[1];
      label = t
        .replace(/^#\s+/, "")
        .replace(/\*\*/g, "")
        .replace(/\s*[_—-]\s*[a-f0-9]{6,}.*$/, "")   // remove hash de commit
        .replace(/Atualização\s*[—–-]\s*/i, "")
        .replace(/Aura\s+/i, "")
        .trim();
      continue;
    }

    // H2 — seção principal: define tipo base para todos os bullets abaixo
    if (/^##\s/.test(t)) {
      const low = t.toLowerCase();
      if (low.includes("nova") || low.includes("feature") || low.includes("🚀") || low.includes("funcional")) {
        currentType = "feature";
      } else if (low.includes("corre") || low.includes("fix") || low.includes("🐛") || low.includes("estabil")) {
        currentType = "fix";
      } else {
        currentType = "improvement";
      }
      continue;
    }

    // H3 — sub-seção: apenas atualiza label do grupo
    if (/^###\s/.test(t)) {
      currentSection = t
        .replace(/^###\s+/, "")
        // mantém letras latinas, números e pontuação básica; remove emojis
        .replace(/[^\w\s\-–—()&.,:/àáâãèéêìíîòóôõùúûçÀÁÂÃÈÉÊÌÍÎÒÓÔÕÙÚÛÇ]/g, "")
        .trim();
      continue;
    }

    // Bullets (* ou -)
    if (/^[*-]\s/.test(t)) {
      let text = t.replace(/^[*-]\s+/, "");
      // **Título:** texto → "Título: texto"
      text = text.replace(/^\*\*(.+?)\*\*\s*[:–—]\s*/, "$1: ");
      // limpa markdown residual
      text = text
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .trim();
      if (text.length > 8) {
        entries.push({ type: currentType, text, section: currentSection, include: true });
      }
    }
  }

  return {
    version,
    label: label || "Nova versão",
    date: new Date().toISOString().slice(0, 10),
    entries,
  };
}

/* ─── sub-components ─────────────────────────────────────────── */

function TypePill({
  type,
  onClick,
  interactive = false,
}: {
  type: ChangelogEntryType;
  onClick?: () => void;
  interactive?: boolean;
}) {
  const m = getTypeMeta(type);
  const Icon = m.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={interactive ? "Clique para mudar o tipo" : undefined}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 transition-opacity ${interactive ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
      style={{ color: m.color, backgroundColor: m.bg, borderColor: m.border }}
    >
      <Icon size={8} />
      {m.label}
    </button>
  );
}

function StatusBadge({ status }: { status: "draft" | "published" }) {
  return status === "published" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
      <Globe size={8} /> Publicado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/12 text-amber-500 border border-amber-500/25">
      <EyeOff size={8} /> Rascunho
    </span>
  );
}

/* ─── import modal ────────────────────────────────────────────── */

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep]         = useState<"paste" | "review">("paste");
  const [mdText, setMdText]     = useState("");
  const [parsed, setParsed]     = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);

  // editable version/label/date fields
  const [version, setVersion]   = useState("");
  const [label,   setLabel]     = useState("");
  const [date,    setDate]      = useState(new Date().toISOString().slice(0, 10));
  const [highlight, setHighlight] = useState("");
  const { requestClose, guardProps } = useCloseGuard(onClose, {
    dirty: !!mdText.trim() || !!parsed,
    message: "Descartar a importação em andamento?",
  });

  function handleParse() {
    if (!mdText.trim()) return;
    const result = parseMarkdownChangelog(mdText);
    setParsed(result);
    setVersion(result.version || "");
    setLabel(result.label || "");
    setDate(result.date);
    setStep("review");
  }

  function toggleEntry(i: number) {
    if (!parsed) return;
    setParsed(p => p ? ({
      ...p,
      entries: p.entries.map((e, idx) => idx === i ? { ...e, include: !e.include } : e),
    }) : p);
  }

  function cycleType(i: number) {
    if (!parsed) return;
    setParsed(p => p ? ({
      ...p,
      entries: p.entries.map((e, idx) => idx === i ? { ...e, type: TYPE_CYCLE[e.type] } : e),
    }) : p);
  }

  function toggleSection(section: string, include: boolean) {
    if (!parsed) return;
    setParsed(p => p ? ({
      ...p,
      entries: p.entries.map(e => e.section === section ? { ...e, include } : e),
    }) : p);
  }

  async function handleImport() {
    if (!parsed || !version.trim() || !label.trim()) {
      toast.error("Preencha versão e título.");
      return;
    }
    const toImport = parsed.entries.filter(e => e.include);
    if (toImport.length === 0) {
      toast.error("Nenhuma entrada selecionada.");
      return;
    }

    setImporting(true);
    try {
      // 1. create changelog version
      const cvRes = await fetch("/api/admin/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: version.trim(), label: label.trim(), date, highlight: highlight || null, status: "draft" }),
      });
      if (!cvRes.ok) { const e = await cvRes.json(); throw new Error(e.error); }
      const created: Changelog = await cvRes.json();

      // 2. batch insert entries
      const batchRes = await fetch(`/api/admin/changelog/${created.id}/entries/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: toImport.map(e => ({ type: e.type, text: e.text })) }),
      });
      if (!batchRes.ok) { const e = await batchRes.json(); throw new Error(e.error); }

      toast.success(`v${version} criada com ${toImport.length} entradas!`);
      onImported();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  }

  /* ── sections for grouped preview ── */
  const sections = parsed
    ? Array.from(new Set(parsed.entries.map(e => e.section)))
    : [];

  const includedCount = parsed?.entries.filter(e => e.include).length ?? 0;

  return (
    <Dialog open onClose={requestClose} presentation="auto" size="xl" rawBody hideClose panelProps={guardProps} ariaLabel="Importar do Markdown">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            <span className="text-sm font-bold text-foreground">Importar do Markdown</span>
            {step === "review" && parsed && (
              <span className="text-xs text-muted-foreground ml-2">
                {includedCount} de {parsed.entries.length} entradas selecionadas
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === "review" && (
              <button
                onClick={() => setStep("paste")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw size={11} /> Reeditar
              </button>
            )}
            <IconButton icon={X} label="Fechar" variant="secondary" size="sm" onClick={requestClose} />
          </div>
        </div>

        {/* steps indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-border shrink-0">
          {(["paste", "review"] as const).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? "text-primary" : step === "review" && i === 0 ? "text-emerald-500" : "text-muted-foreground/70"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${step === s ? "bg-primary/15 border-primary/40 text-primary" : step === "review" && i === 0 ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500" : "border-border text-muted-foreground/70"}`}>
                  {step === "review" && i === 0 ? <Check size={9} /> : i + 1}
                </div>
                {s === "paste" ? "Colar Markdown" : "Revisar & Importar"}
              </div>
              {i === 0 && <ChevronRight size={12} className="text-muted-foreground/60 mx-1" />}
            </React.Fragment>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-hidden flex">

          {/* ── step 1: paste ── */}
          {step === "paste" && (
            <div className="flex-1 flex flex-col p-6 gap-4">
              <div>
                <label className="field-label">Cole o markdown do changelog aqui</label>
                <p className="text-xs text-muted-foreground/70 mb-3">
                  Suporta <code className="text-muted-foreground"># Título</code>, <code className="text-muted-foreground">## Seção</code>, <code className="text-muted-foreground">### Sub-seção</code> e bullets <code className="text-muted-foreground">* item</code>. Emojis e negrito são detectados automaticamente.
                </p>
                <textarea
                  value={mdText}
                  onChange={e => setMdText(e.target.value)}
                  placeholder={"# Atualização — Aura 0.8.0\n\n## 🚀 Novas Funcionalidades\n\n### 📱 App da Camareira\n* **DND:** Novo botão de pular tarefa registra Não Perturbe.\n\n## 🐛 Correções\n\n### 🔐 Autenticação\n* Corrigida race condition no AuthContext ao recarregar a página."}
                  rows={18}
                  className="field-input w-full font-mono text-xs leading-relaxed resize-none"
                  style={{ minHeight: 360 }}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={requestClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleParse}
                  disabled={!mdText.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-sm font-semibold transition-colors disabled:opacity-40"
                >
                  Analisar <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── step 2: review ── */}
          {step === "review" && parsed && (
            <div className="flex-1 flex overflow-hidden">

              {/* left: version fields */}
              <div className="w-64 shrink-0 border-r border-border p-5 flex flex-col gap-4 overflow-y-auto">
                <div>
                  <label className="field-label">Versão detectada</label>
                  <input
                    value={version}
                    onChange={e => setVersion(e.target.value)}
                    placeholder="ex: 0.8.0"
                    className="field-input w-full font-mono"
                  />
                </div>
                <div>
                  <label className="field-label">Título</label>
                  <input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    className="field-input w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="field-input w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Badge <span className="normal-case text-muted-foreground/70">(opcional)</span></label>
                  <input
                    value={highlight}
                    onChange={e => setHighlight(e.target.value)}
                    placeholder='ex: "Mais recente"'
                    className="field-input w-full"
                  />
                </div>

                <div className="mt-auto pt-4 border-t border-border space-y-2">
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground font-semibold">{includedCount}</span> de {parsed.entries.length} entradas
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {ENTRY_TYPES.map(({ value, label: tLabel, color }) => {
                      const count = parsed.entries.filter(e => e.include && e.type === value).length;
                      return count > 0 ? (
                        <span key={value} className="text-[9px] font-bold" style={{ color }}>
                          {count} {tLabel.toLowerCase()}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <button
                    onClick={handleImport}
                    disabled={importing || includedCount === 0 || !version.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-sm font-semibold transition-colors disabled:opacity-40"
                  >
                    {importing
                      ? <><Loader2 size={13} className="animate-spin" /> Importando...</>
                      : <><FileText size={13} /> Importar {includedCount} entradas</>
                    }
                  </button>
                </div>
              </div>

              {/* right: entries preview */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {sections.map(section => {
                  const sectionEntries = parsed.entries.map((e, i) => ({ ...e, _i: i })).filter(e => e.section === section);
                  const allIncluded  = sectionEntries.every(e => e.include);
                  const noneIncluded = sectionEntries.every(e => !e.include);
                  return (
                    <div key={section || "__root"}>
                      {/* section header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {section || "Geral"}
                        </span>
                        <div className="flex-1 h-px bg-secondary/60" />
                        <button
                          onClick={() => toggleSection(section, !allIncluded)}
                          className="text-[9px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                        >
                          {allIncluded ? "Desmarcar todos" : noneIncluded ? "Marcar todos" : "Marcar todos"}
                        </button>
                      </div>

                      {/* entries */}
                      <div className="rounded-xl border border-border bg-background divide-y divide-white/5 overflow-hidden">
                        {sectionEntries.map(entry => (
                          <div
                            key={entry._i}
                            className={`flex items-start gap-3 px-4 py-2.5 transition-opacity ${!entry.include ? "opacity-35" : ""}`}
                          >
                            {/* include toggle */}
                            <button
                              onClick={() => toggleEntry(entry._i)}
                              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${entry.include ? "bg-primary/20 border-primary/50" : "bg-transparent border-border"}`}
                            >
                              {entry.include && <Check size={9} className="text-primary" />}
                            </button>

                            {/* type badge (clickable to cycle) */}
                            <TypePill
                              type={entry.type}
                              interactive
                              onClick={() => cycleType(entry._i)}
                            />

                            {/* text */}
                            <p className="text-xs text-foreground/80 font-light leading-relaxed flex-1 min-w-0">
                              {entry.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/* ─── main page ──────────────────────────────────────────────── */

export default function ChangelogAdminPage() {
  useAuth();

  const [changelogs, setChangelogs] = useState<Changelog[]>([]);
  const [selected,   setSelected]   = useState<Changelog | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [form, setForm] = useState({
    version: "", label: "", date: "", status: "draft" as "draft" | "published", highlight: "",
  });

  const [entryType, setEntryType]     = useState<ChangelogEntryType>("feature");
  const [entryText, setEntryText]     = useState("");
  const [addingEntry, setAddingEntry] = useState(false);

  /* ── data ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/changelog");
      if (!res.ok) throw new Error("Falha ao carregar");
      const data: Changelog[] = await res.json();
      setChangelogs(data);
      if (selected) {
        const refreshed = data.find(c => c.id === selected.id);
        if (refreshed) { setSelected(refreshed); syncForm(refreshed); }
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  function syncForm(c: Changelog) {
    setForm({ version: c.version, label: c.label, date: c.date.slice(0, 10), status: c.status, highlight: c.highlight ?? "" });
  }

  function selectChangelog(c: Changelog) {
    setShowNew(false);
    setSelected(c);
    syncForm(c);
    setEntryText("");
  }

  /* ── create ── */
  async function handleCreate() {
    if (!form.version.trim() || !form.label.trim() || !form.date) {
      toast.error("Preencha versão, título e data.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, highlight: form.highlight || null }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const created: Changelog = await res.json();
      toast.success(`Versão ${created.version} criada!`);
      setShowNew(false);
      await load();
      setSelected({ ...created, entries: [] });
      syncForm(created);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  /* ── save ── */
  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/changelog/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, highlight: form.highlight || null }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success("Salvo.");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  /* ── publish toggle ── */
  async function handleTogglePublish() {
    if (!selected) return;
    const next = selected.status === "published" ? "draft" : "published";
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/changelog/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success(next === "published" ? "Publicado!" : "Despublicado.");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  /* ── delete changelog ── */
  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Excluir versão ${selected.version}?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/changelog/${selected.id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success("Excluído.");
      setSelected(null);
      setForm({ version: "", label: "", date: "", status: "draft", highlight: "" });
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  /* ── add entry ── */
  async function handleAddEntry() {
    if (!selected || !entryText.trim()) return;
    setAddingEntry(true);
    try {
      const res = await fetch(`/api/admin/changelog/${selected.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: entryType, text: entryText.trim(), sortOrder: selected.entries?.length ?? 0 }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setEntryText("");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setAddingEntry(false); }
  }

  /* ── remove entry ── */
  async function handleRemoveEntry(entryId: string) {
    try {
      const res = await fetch(`/api/admin/changelog/entries/${entryId}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      await load();
    } catch (e: any) { toast.error(e.message); }
  }

  /* ─── render ─────────────────────────────────────────────────── */
  return (
    <RoleGuard allowedRoles={["super_admin"]} redirectTo="/admin/login">
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={async () => { await load(); }}
        />
      )}

      <div className="flex flex-col lg:flex-row lg:h-[calc(100dvh-var(--topbar-h,48px)-2*var(--page-pad,16px))] overflow-hidden bg-card border border-border rounded-2xl">

        {/* ── LEFT: list ── */}
        <div className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col bg-card max-h-[45dvh] lg:max-h-none">
          <div className="px-4 py-4 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History size={15} className="text-primary" />
                <span className="text-sm font-bold text-foreground">Changelog</span>
              </div>
              <button
                onClick={() => { setSelected(null); setShowNew(true); setForm({ version: "", label: "", date: new Date().toISOString().slice(0,10), status: "draft", highlight: "" }); }}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors"
              >
                <Plus size={11} /> Nova
              </button>
            </div>
            {/* import button */}
            <button
              onClick={() => setShowImport(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-secondary/60 border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileText size={11} /> Importar do Markdown
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="px-4 py-3"><SkeletonList rows={3} avatar={false} /></div>
            ) : changelogs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground/70">
                Nenhuma versão ainda.
              </div>
            ) : (
              changelogs.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectChangelog(c)}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/40 transition-colors ${selected?.id === c.id ? "bg-secondary/60 border-l-2 border-l-primary" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground font-mono">{c.version}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">{c.date.slice(0, 10)} · {c.entries?.length ?? 0} entradas</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: editor ── */}
        <div className="flex-1 overflow-y-auto">
          {!showNew && !selected ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-secondary/60 border border-border flex items-center justify-center mb-4">
                <History size={22} className="text-muted-foreground/70" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground mb-1">Selecione uma versão</p>
              <p className="text-xs text-muted-foreground/70 max-w-xs">
                Escolha uma versão na lista, crie manualmente ou use{" "}
                <button onClick={() => setShowImport(true)} className="text-primary hover:underline">
                  Importar do Markdown
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground">
                  {showNew ? "Nova Versão" : `Editando ${selected?.version}`}
                </h2>
                {selected && <StatusBadge status={selected.status} />}
              </div>

              {/* version fields */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">Versão</label>
                    <input value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))} placeholder="0.8.0" className="field-input w-full font-mono" />
                  </div>
                  <div>
                    <label className="field-label">Data</label>
                    <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="field-input w-full" />
                  </div>
                </div>
                <div>
                  <label className="field-label">Título</label>
                  <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Portal do Hóspede Multilíngue" className="field-input w-full" />
                </div>
                <div>
                  <label className="field-label">Badge de destaque <span className="normal-case text-muted-foreground/70">(opcional)</span></label>
                  <input value={form.highlight} onChange={e => setForm(p => ({ ...p, highlight: e.target.value }))} placeholder='"Mais recente"' className="field-input w-full" />
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <button
                    onClick={showNew ? handleCreate : handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {showNew ? "Criar" : "Salvar"}
                  </button>

                  {!showNew && selected && (
                    <>
                      <button
                        onClick={handleTogglePublish}
                        disabled={saving}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${selected.status === "published" ? "bg-amber-500/10 text-amber-500 border-amber-500/25 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/25 hover:bg-emerald-500/20"}`}
                      >
                        {selected.status === "published"
                          ? <><EyeOff size={12} /> Despublicar</>
                          : <><Globe size={12} /> Publicar</>}
                      </button>
                      <button onClick={handleDelete} disabled={saving} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-semibold transition-colors disabled:opacity-50">
                        <Trash2 size={12} /> Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* entries */}
              {!showNew && selected && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-wider">
                    Entradas ({selected.entries?.length ?? 0})
                  </h3>

                  {(selected.entries ?? []).length > 0 ? (
                    <div className="rounded-2xl border border-border bg-card divide-y divide-white/5 overflow-hidden">
                      {(selected.entries ?? []).map(entry => (
                        <div key={entry.id} className="flex items-start gap-3 px-4 py-3 group">
                          <TypePill type={entry.type} />
                          <p className="flex-1 text-sm text-foreground/80 font-light leading-relaxed min-w-0">{entry.text}</p>
                          <button onClick={() => handleRemoveEntry(entry.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/15 text-muted-foreground/70 hover:text-red-400 transition-all shrink-0">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center">
                      <p className="text-xs text-muted-foreground/70">Nenhuma entrada ainda.</p>
                    </div>
                  )}

                  {/* add entry */}
                  <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <label className="field-label">Adicionar entrada</label>
                    <div className="flex gap-2">
                      {ENTRY_TYPES.map(t => {
                        const Icon = t.icon;
                        const active = entryType === t.value;
                        return (
                          <button
                            key={t.value}
                            onClick={() => setEntryType(t.value)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                            style={active
                              ? { backgroundColor: t.bg, borderColor: t.border, color: t.color }
                              : { backgroundColor: "transparent", borderColor: "var(--t-border)", color: "var(--t-muted)" }}
                          >
                            <Icon size={11} /> {t.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={entryText}
                        onChange={e => setEntryText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddEntry(); } }}
                        placeholder="Descreva a mudança..."
                        className="field-input flex-1"
                      />
                      <button
                        onClick={handleAddEntry}
                        disabled={!entryText.trim() || addingEntry}
                        className="px-3 py-2 rounded-xl bg-secondary/60 border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
                      >
                        {addingEntry ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70">Enter para adicionar rapidamente.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
