"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Layers, ListOrdered, Minus, Package, Plus, Save, ShoppingBag, Trash2, User, XCircle } from "lucide-react";
import type { ConciergeCategory, ConciergeGroup, ConciergeStockComponent } from "@/types/aura";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { Dialog, Button, IconButton, Field, FieldRow, Input, Select, Textarea, Switch, SegmentedTabs, SectionLabel, Pill, useThemeName } from "@/components/aura";
import { emojiFromUrl, emojiToUrl, isEmojiUrl, type ItemForm } from "./concierge-utils";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

type LangTab = "pt" | "en" | "es";
const LANGS: { id: LangTab; label: string }[] = [{ id: "pt", label: "PT" }, { id: "en", label: "EN" }, { id: "es", label: "ES" }];

/** Formulário de item do catálogo (3 idiomas, identidade visual, preço, disponibilidade, ficha de estoque). */
export function CatalogFormModal({ open, form, setForm, editingId, saving, groups, stockProducts, stockLocations, stockEnabled, onClose, onSave }: {
  open: boolean;
  form: ItemForm;
  setForm: React.Dispatch<React.SetStateAction<ItemForm>>;
  editingId: string | null;
  saving: boolean;
  groups: ConciergeGroup[];
  stockProducts: { id: string; name: string; unit: string }[];
  stockLocations: { id: string; name: string }[];
  stockEnabled: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const themeName = useThemeName();
  const [lang, setLang] = useState<LangTab>("pt");
  const [imageType, setImageType] = useState<"emoji" | "url">("emoji");
  const [emoji, setEmoji] = useState("💧");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty: dirty && !saving, escape: false });

  // Ao abrir: estado inicial a partir do form
  useEffect(() => {
    if (!open) return;
    setLang("pt");
    setDirty(false);
    setEmojiOpen(false);
    const isEm = isEmojiUrl(form.image_url);
    setImageType(isEm || !form.image_url ? "emoji" : "url");
    setEmoji(isEm ? emojiFromUrl(form.image_url) : "💧");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isLoan = form.category === "loan";
  const isActive = form.availableForGuest || form.availableForMaid;
  const canSave = form.name.trim().length > 0;

  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => { setDirty(true); setForm(prev => ({ ...prev, [k]: v })); };

  // image_url acompanha o emoji escolhido
  useEffect(() => {
    if (imageType === "emoji" && open) setForm(prev => (prev.image_url === emojiToUrl(emoji) ? prev : { ...prev, image_url: emojiToUrl(emoji) }));
  }, [emoji, imageType, open, setForm]);

  // active deriva do público
  useEffect(() => {
    setForm(prev => (prev.active === (prev.availableForGuest || prev.availableForMaid) ? prev : { ...prev, active: prev.availableForGuest || prev.availableForMaid }));
  }, [form.availableForGuest, form.availableForMaid, setForm]);

  // Fecha o picker ao clicar fora
  useEffect(() => {
    if (!emojiOpen) return;
    const handler = (e: MouseEvent) => { if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) setEmojiOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiOpen]);

  const addComp = () => set("stockComponents", [...form.stockComponents, { productId: "", consumptionQty: 1 }]);
  const removeComp = (idx: number) => set("stockComponents", form.stockComponents.filter((_, i) => i !== idx));
  const updateComp = (idx: number, patch: Partial<ConciergeStockComponent>) => set("stockComponents", form.stockComponents.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const unitOf = (productId: string) => stockProducts.find(p => p.id === productId)?.unit || "";

  const catTone = (c: ConciergeCategory) => toneOf(c === "loan" ? "blue" : "brand");

  return (
    <Dialog open={open} onClose={saving ? () => {} : requestClose} presentation="auto" size="lg" icon={ListOrdered} iconTone="brand"
      title={editingId ? "Editar item do catálogo" : "Novo item do catálogo"} subtitle="Preencha os dados do item em todos os idiomas" panelProps={guardProps}
      footer={(
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: T.glass, border: `1px solid ${isActive ? T.border2 : T.redBorder}`, fontSize: 12, fontWeight: 700, minWidth: 0, maxWidth: 220, marginRight: "auto" }}>
            <span style={{ fontSize: 16, opacity: isActive ? 1 : .4 }}>{imageType === "emoji" ? emoji : "📦"}</span>
            <span style={{ color: form.name.trim() ? (isActive ? T.text : T.muted2) : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{form.name.trim() || "Nome do item"}</span>
            <Pill tone={isLoan ? "blue" : "brand"} label={isLoan ? "Empréstimo" : "Consumo"} />
            {!isActive && <Pill tone="red" label="inativo" />}
          </span>
          <Button variant="secondary" onClick={requestClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" icon={Save} onClick={onSave} disabled={!canSave} loading={saving}>{editingId ? "Salvar alterações" : "Criar item"}</Button>
        </>
      )}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Identidade visual */}
        <section>
          <SectionLabel style={{ marginBottom: 10 }}>Identidade visual</SectionLabel>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <button type="button" onClick={() => setEmojiOpen(p => !p)} className="ak-press ak-focus" style={{ width: 72, height: 72, borderRadius: 18, flexShrink: 0, background: T.glass2, border: `2px solid ${T.g1Border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, cursor: "pointer" }}>
              {imageType === "emoji" ? emoji : (form.image_url ? "🖼️" : "📦")}
            </button>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <SegmentedTabs<"emoji" | "url"> items={[{ id: "emoji", label: "Emoji" }, { id: "url", label: "URL / upload" }]} value={imageType} onChange={setImageType} size="sm" ariaLabel="Tipo de imagem" />
              {imageType === "url" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Input value={form.image_url} onChange={e => set("image_url", e.target.value)} placeholder="https://…" />
                  <span style={{ fontSize: 10, color: T.muted }}>Ou use o upload abaixo</span>
                  <ImageUpload value={form.image_url} onUploadSuccess={url => set("image_url", url)} path="concierge-items" />
                </div>
              ) : (
                <div ref={emojiPickerRef} style={{ position: "relative" }}>
                  <Button variant="secondary" onClick={() => setEmojiOpen(p => !p)} fullWidth style={{ justifyContent: "flex-start" }}>
                    <span style={{ fontSize: 18 }}>{emoji}</span> Clique para trocar o emoji
                  </Button>
                  {emojiOpen && (
                    <div className="ak-fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5, maxWidth: "min(340px, 100%)" }}>
                      <EmojiPicker onEmojiClick={d => { setEmoji(d.emoji); setDirty(true); setEmojiOpen(false); }} theme={themeName as never} skinTonesDisabled searchPlaceholder="Buscar emoji…" width="100%" height={360} previewConfig={{ showPreview: false }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Nome & descrição por idioma */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <SectionLabel>Nome & descrição</SectionLabel>
            <SegmentedTabs<LangTab> items={LANGS} value={lang} onChange={setLang} size="sm" ariaLabel="Idioma" />
          </div>
          {lang === "pt" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Nome em português" required><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex.: Água mineral (500ml)" /></Field>
              <Field label="Descrição em português"><Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="Ex.: Água mineral sem gás, garrafa individual de 500ml." rows={3} /></Field>
            </div>
          )}
          {lang === "en" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Name in English"><Input value={form.name_en} onChange={e => set("name_en", e.target.value)} placeholder="e.g. Still water (500ml)" /></Field>
              <Field label="Description in English"><Textarea value={form.description_en} onChange={e => set("description_en", e.target.value)} placeholder="e.g. Still mineral water, individual 500ml bottle." rows={3} /></Field>
            </div>
          )}
          {lang === "es" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Nombre en español"><Input value={form.name_es} onChange={e => set("name_es", e.target.value)} placeholder="Ej: Agua mineral (500ml)" /></Field>
              <Field label="Descripción en español"><Textarea value={form.description_es} onChange={e => set("description_es", e.target.value)} placeholder="Ej: Agua mineral sin gas, botella individual de 500ml." rows={3} /></Field>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700 }}>Preenchimento:</span>
            {[{ label: "PT", filled: !!form.name.trim() }, { label: "EN", filled: !!form.name_en.trim() }, { label: "ES", filled: !!form.name_es.trim() }].map(l => (
              <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, color: l.filled ? T.green : T.muted2 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: l.filled ? T.green : T.border2 }} /> {l.label}
              </span>
            ))}
          </div>
        </section>

        {/* Tipo */}
        <section>
          <SectionLabel style={{ marginBottom: 10 }}>Tipo de item</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              { id: "consumption" as ConciergeCategory, label: "Consumo", desc: "Item entregue e cobrado. Ex.: bebida, kit amenities.", Icon: ShoppingBag },
              { id: "loan" as ConciergeCategory, label: "Empréstimo", desc: "Item cedido e devolvido. Ex.: guarda-chuva, cadeira.", Icon: Package },
            ]).map(cat => {
              const on = form.category === cat.id;
              const ct = catTone(cat.id);
              return (
                <button key={cat.id} type="button" onClick={() => set("category", cat.id)} className="ak-press ak-focus" aria-pressed={on}
                  style={{ padding: 12, borderRadius: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: on ? ct.bg : T.glass, border: `2px solid ${on ? ct.border : T.border}`, color: T.text }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: on ? ct.bg : T.glass2, display: "inline-flex", alignItems: "center", justifyContent: "center", color: on ? ct.color : T.muted }}><cat.Icon size={14} /></span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: on ? ct.color : T.text }}>{cat.label}</span>
                    {on && <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: ct.color }} />}
                  </span>
                  <span style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{cat.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Preço & quantidade */}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionLabel>Preço & quantidade</SectionLabel>
          <FieldRow cols={2}>
            <Field label={isLoan ? "Preço de entrega (opcional)" : "Preço unitário (R$)"} hint={isLoan ? "Cobrado na entrega, se aplicável." : "Valor cobrado por unidade consumida."}>
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={form.price} onChange={e => set("price", e.target.value)} placeholder="0,00" />
            </Field>
            <Field label="Qtde inclusa na hospedagem" hint="Unidades gratuitas por estadia.">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconButton icon={Minus} label="Menos um" variant="secondary" onClick={() => set("included_qty", String(Math.max(0, parseInt(form.included_qty || "0") - 1)))} />
                <Input type="number" min={0} inputMode="numeric" value={form.included_qty} onChange={e => set("included_qty", e.target.value)} style={{ textAlign: "center" }} />
                <IconButton icon={Plus} label="Mais um" variant="secondary" onClick={() => set("included_qty", String(parseInt(form.included_qty || "0") + 1))} />
              </div>
            </Field>
          </FieldRow>
          {isLoan && (
            <Field label={<span style={{ color: T.red }}>Preço de extravio (R$)</span>} hint="Cobrado automaticamente se o item for marcado como extraviado.">
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={form.loss_price} onChange={e => set("loss_price", e.target.value)} placeholder="0,00" style={{ borderColor: T.redBorder }} />
            </Field>
          )}
          <Field label="Ordem de exibição"><Input type="number" min={0} inputMode="numeric" value={form.order} onChange={e => set("order", e.target.value)} /></Field>
        </section>

        {/* Disponibilidade */}
        <section>
          <SectionLabel style={{ marginBottom: 4 }}>Disponibilidade</SectionLabel>
          {/* A reposição da camareira saiu do Concierge (virou produto do estoque "Solicitável pela camareira"). */}
          <p style={{ margin: "0 0 10px", fontSize: 11, color: T.muted2 }}>Item do cardápio do hóspede. Reposição da camareira agora é configurada em Estoque → Produtos.</p>
          <button type="button" onClick={() => set("availableForGuest", !form.availableForGuest)} className="ak-press ak-focus" aria-pressed={form.availableForGuest}
            style={{ width: "100%", padding: 12, borderRadius: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: form.availableForGuest ? T.greenBg : T.glass, border: `2px solid ${form.availableForGuest ? T.greenBorder : T.border}`, color: T.text }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: form.availableForGuest ? T.greenBg : T.glass2, display: "inline-flex", alignItems: "center", justifyContent: "center", color: form.availableForGuest ? T.green : T.muted }}><User size={14} /></span>
              <span style={{ fontSize: 13, fontWeight: 900, color: form.availableForGuest ? T.green : T.text }}>Hóspede</span>
              <span style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 5, background: form.availableForGuest ? T.green : "transparent", border: `2px solid ${form.availableForGuest ? T.green : T.border2}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{form.availableForGuest && <CheckCircle2 size={11} color="#fff" strokeWidth={3} />}</span>
            </span>
            <span style={{ fontSize: 11, color: T.muted }}>Visível no app do hóspede.</span>
          </button>
          {!isActive && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: T.redBg, border: `1px solid ${T.redBorder}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.red, fontWeight: 600 }}>
              <XCircle size={14} /> Nenhum público selecionado — o item fica inativo e oculto do catálogo.
            </div>
          )}
        </section>

        {/* Grupo */}
        {groups.length > 0 && (
          <Field label="Grupo">
            <Select value={form.groupId} onChange={e => set("groupId", e.target.value)}>
              <option value="">— Sem grupo —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
            </Select>
          </Field>
        )}

        {/* Estoque */}
        {stockEnabled && (
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Layers size={11} /> Estoque · baixar do estoque</SectionLabel>
              <Switch checked={form.deductFromStock} onChange={v => set("deductFromStock", v)} label="Baixar do estoque" />
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 11, color: T.muted, lineHeight: 1.4 }}>
              {form.deductFromStock
                ? (isLoan ? "Ao marcar como perdido, baixa a ficha técnica abaixo do estoque." : "A cada entrega, baixa a ficha técnica do estoque. Sem insumo suficiente, o item fica indisponível para pedido.")
                : "Desligado: o item não controla estoque."}
            </p>
            {form.deductFromStock && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {form.stockComponents.length === 0 && <span style={{ fontSize: 11, color: T.muted }}>Nenhum produto na ficha. Adicione ao menos um.</span>}
                {form.stockComponents.map((c, idx) => (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 11, border: `1px solid ${T.border}`, background: T.glass }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Select value={c.productId} onChange={e => updateComp(idx, { productId: e.target.value, unit: unitOf(e.target.value), name: stockProducts.find(p => p.id === e.target.value)?.name })} wrapStyle={{ flex: 1, minWidth: 0 }} fieldSize="sm">
                        <option value="">Selecione o produto…</option>
                        {stockProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </Select>
                      <div style={{ position: "relative", width: 104, flexShrink: 0 }}>
                        <Input type="number" min={0} step="any" inputMode="decimal" value={c.consumptionQty} onChange={e => updateComp(idx, { consumptionQty: parseFloat(e.target.value) || 0 })} fieldSize="sm" style={{ textAlign: "right", paddingRight: unitOf(c.productId) ? 36 : undefined }} />
                        {unitOf(c.productId) && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: T.muted, pointerEvents: "none" }}>{unitOf(c.productId)}</span>}
                      </div>
                      <IconButton icon={Trash2} label="Remover produto" size="sm" tone="red" variant="soft" onClick={() => removeComp(idx)} />
                    </div>
                    {stockLocations.length > 0 && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: T.muted, flexShrink: 0 }}>Baixar de</span>
                        <Select value={c.locationId || ""} onChange={e => updateComp(idx, { locationId: e.target.value || null })} fieldSize="sm" wrapStyle={{ flex: 1 }}>
                          <option value="">Padrão (local de consumo)</option>
                          {stockLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </Select>
                      </div>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" icon={Plus} onClick={addComp} style={{ alignSelf: "flex-start" }}>Adicionar produto</Button>
                <span style={{ fontSize: 10, color: T.muted }}>Quantidade consumida por unidade entregue.</span>
              </div>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
