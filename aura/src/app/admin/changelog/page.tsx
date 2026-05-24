"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { toast } from "sonner";
import {
  Plus, Trash2, Check, Edit3, X, ChevronDown,
  Sparkles, TrendingUp, Wrench, History,
  Globe, EyeOff, Save, Loader2,
} from "lucide-react";
import type { Changelog, ChangelogEntry, ChangelogEntryType } from "@/types/aura";

/* ─── constants ───────────────────────────────────────────────── */

const ENTRY_TYPES: { value: ChangelogEntryType; label: string; icon: React.ElementType; color: string; bg: string; border: string }[] = [
  { value: "feature",     label: "Novo",     icon: Sparkles,    color: "#00BFFF", bg: "rgba(0,191,255,0.12)",    border: "rgba(0,191,255,0.3)"    },
  { value: "improvement", label: "Melhoria", icon: TrendingUp,  color: "#a78bfa", bg: "rgba(167,139,250,0.12)",  border: "rgba(167,139,250,0.3)"  },
  { value: "fix",         label: "Correção", icon: Wrench,      color: "#10b981", bg: "rgba(16,185,129,0.12)",   border: "rgba(16,185,129,0.3)"   },
];

const getTypeMeta = (type: ChangelogEntryType) =>
  ENTRY_TYPES.find(t => t.value === type) ?? ENTRY_TYPES[0];

/* ─── sub-components ─────────────────────────────────────────── */

function EntryBadge({ type }: { type: ChangelogEntryType }) {
  const m = getTypeMeta(type);
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0"
      style={{ color: m.color, backgroundColor: m.bg, borderColor: m.border }}
    >
      <Icon size={8} />
      {m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: "draft" | "published" }) {
  return status === "published" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
      <Globe size={8} /> Publicado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#f59e0b]/12 text-[#f59e0b] border border-[#f59e0b]/25">
      <EyeOff size={8} /> Rascunho
    </span>
  );
}

/* ─── main page ──────────────────────────────────────────────── */

export default function ChangelogAdminPage() {
  const { userData } = useAuth();

  const [changelogs, setChangelogs]   = useState<Changelog[]>([]);
  const [selected,   setSelected]     = useState<Changelog | null>(null);
  const [loading,    setLoading]      = useState(true);
  const [saving,     setSaving]       = useState(false);
  const [showNew,    setShowNew]      = useState(false);

  // form state for selected / new
  const [form, setForm] = useState({
    version: "", label: "", date: "", status: "draft" as "draft" | "published", highlight: "",
  });

  // new entry form
  const [entryType, setEntryType]   = useState<ChangelogEntryType>("feature");
  const [entryText, setEntryText]   = useState("");
  const [addingEntry, setAddingEntry] = useState(false);

  /* ── data ── */

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/changelog");
      if (!res.ok) throw new Error("Falha ao carregar changelogs");
      const data: Changelog[] = await res.json();
      setChangelogs(data);
      // keep selected in sync
      if (selected) {
        const refreshed = data.find(c => c.id === selected.id);
        if (refreshed) { setSelected(refreshed); syncForm(refreshed); }
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  function syncForm(c: Changelog) {
    setForm({
      version:   c.version,
      label:     c.label,
      date:      c.date.slice(0, 10),
      status:    c.status,
      highlight: c.highlight ?? "",
    });
  }

  function selectChangelog(c: Changelog) {
    setShowNew(false);
    setSelected(c);
    syncForm(c);
    setEntryText("");
  }

  /* ── create new version ── */

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
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  /* ── update selected version ── */

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
      toast.success("Versão salva.");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  /* ── toggle publish ── */

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
      toast.success(next === "published" ? "Versão publicada!" : "Versão despublicada.");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  /* ── delete version ── */

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Excluir versão ${selected.version}? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/changelog/${selected.id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success("Versão excluída.");
      setSelected(null);
      setForm({ version: "", label: "", date: "", status: "draft", highlight: "" });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  /* ── add entry ── */

  async function handleAddEntry() {
    if (!selected || !entryText.trim()) return;
    setAddingEntry(true);
    try {
      const res = await fetch(`/api/admin/changelog/${selected.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: entryType, text: entryText.trim(), sortOrder: (selected.entries?.length ?? 0) }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setEntryText("");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingEntry(false);
    }
  }

  /* ── remove entry ── */

  async function handleRemoveEntry(entryId: string) {
    try {
      const res = await fetch(`/api/admin/changelog/entries/${entryId}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  /* ─────────────────────────── render ─────────────────────────── */

  return (
    <RoleGuard allowedRoles={["super_admin"]} redirectTo="/admin/login">
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#141414]">

        {/* ── LEFT: list panel ── */}
        <div className="w-80 shrink-0 border-r border-white/5 flex flex-col bg-[#111111]">
          {/* header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <History size={16} className="text-[#00BFFF]" />
              <span className="text-sm font-bold text-white">Changelog</span>
            </div>
            <button
              onClick={() => { setSelected(null); setShowNew(true); setForm({ version: "", label: "", date: new Date().toISOString().slice(0,10), status: "draft", highlight: "" }); }}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#00BFFF]/15 text-[#00BFFF] border border-[#00BFFF]/25 hover:bg-[#00BFFF]/25 transition-colors"
            >
              <Plus size={12} /> Nova Versão
            </button>
          </div>

          {/* list */}
          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 size={16} className="animate-spin text-gray-600" />
              </div>
            ) : changelogs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-600">
                Nenhuma versão criada.
              </div>
            ) : (
              changelogs.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectChangelog(c)}
                  className={`w-full text-left px-4 py-3 border-b border-white/3 hover:bg-white/3 transition-colors ${selected?.id === c.id ? "bg-white/5 border-l-2 border-l-[#00BFFF]" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white font-mono">{c.version}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">{c.label}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5 font-mono">{c.date.slice(0,10)}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: editor panel ── */}
        <div className="flex-1 overflow-y-auto">
          {!showNew && !selected ? (
            /* empty state */
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mb-4">
                <History size={22} className="text-gray-600" />
              </div>
              <p className="text-sm font-semibold text-gray-400 mb-1">Selecione uma versão</p>
              <p className="text-xs text-gray-600 max-w-xs">
                Escolha uma versão na lista ou crie uma nova para começar a registrar o changelog.
              </p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

              {/* ── form header ── */}
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">
                  {showNew ? "Nova Versão" : `Editando ${selected?.version}`}
                </h2>
                {selected && <StatusBadge status={selected.status} />}
              </div>

              {/* ── version fields ── */}
              <div className="rounded-2xl border border-white/8 bg-[#1a1a1a] p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">Versão</label>
                    <input
                      value={form.version}
                      onChange={e => setForm(p => ({ ...p, version: e.target.value }))}
                      placeholder="ex: 0.8.0"
                      className="field-input w-full font-mono"
                    />
                  </div>
                  <div>
                    <label className="field-label">Data</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                      className="field-input w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label">Título da versão</label>
                  <input
                    value={form.label}
                    onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                    placeholder="ex: Portal do Hóspede Multilíngue"
                    className="field-input w-full"
                  />
                </div>

                <div>
                  <label className="field-label">Badge de destaque <span className="normal-case text-gray-600">(opcional)</span></label>
                  <input
                    value={form.highlight}
                    onChange={e => setForm(p => ({ ...p, highlight: e.target.value }))}
                    placeholder='ex: "Mais recente"'
                    className="field-input w-full"
                  />
                </div>

                {/* actions */}
                <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                  <button
                    onClick={showNew ? handleCreate : handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00BFFF]/15 text-[#00BFFF] border border-[#00BFFF]/25 hover:bg-[#00BFFF]/25 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {showNew ? "Criar versão" : "Salvar alterações"}
                  </button>

                  {!showNew && selected && (
                    <>
                      <button
                        onClick={handleTogglePublish}
                        disabled={saving}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
                          selected.status === "published"
                            ? "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/25 hover:bg-[#f59e0b]/20"
                            : "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/25 hover:bg-[#10b981]/20"
                        }`}
                      >
                        {selected.status === "published"
                          ? <><EyeOff size={12} /> Despublicar</>
                          : <><Globe size={12} /> Publicar</>
                        }
                      </button>

                      <button
                        onClick={handleDelete}
                        disabled={saving}
                        className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={12} /> Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── entries section (only when editing existing) ── */}
              {!showNew && selected && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                      Entradas ({selected.entries?.length ?? 0})
                    </h3>
                  </div>

                  {/* existing entries */}
                  {(selected.entries ?? []).length > 0 ? (
                    <div className="rounded-2xl border border-white/8 bg-[#1a1a1a] divide-y divide-white/5 overflow-hidden">
                      {(selected.entries ?? []).map(entry => (
                        <div key={entry.id} className="flex items-start gap-3 px-4 py-3 group">
                          <EntryBadge type={entry.type} />
                          <p className="flex-1 text-sm text-gray-300 font-light leading-relaxed min-w-0">
                            {entry.text}
                          </p>
                          <button
                            onClick={() => handleRemoveEntry(entry.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/15 text-gray-600 hover:text-red-400 transition-all shrink-0"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-[#1a1a1a] px-4 py-6 text-center">
                      <p className="text-xs text-gray-600">Nenhuma entrada ainda. Adicione abaixo.</p>
                    </div>
                  )}

                  {/* add entry form */}
                  <div className="rounded-2xl border border-white/8 bg-[#1a1a1a] p-4 space-y-3">
                    <label className="field-label">Adicionar entrada</label>

                    {/* type selector */}
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
                              : { backgroundColor: "transparent", borderColor: "rgba(255,255,255,0.08)", color: "#6b7280" }
                            }
                          >
                            <Icon size={11} /> {t.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* text + submit */}
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
                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                      >
                        {addingEntry ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-600">Enter para adicionar rapidamente.</p>
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
