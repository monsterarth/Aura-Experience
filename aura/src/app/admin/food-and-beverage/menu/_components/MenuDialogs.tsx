"use client";

import React, { useEffect, useRef } from "react";
import { Plus, Trash2, X, Save, Info } from "lucide-react";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T } from "@/lib/admin-tokens";
import { Dialog, SegmentedTabs, Field, FieldRow, Input, Select, Textarea, Switch, Button, IconButton, Pill } from "@/components/aura";
import type { useMenu, Lang } from "./useMenu";

type Menu = ReturnType<typeof useMenu>;
const LANGS: { id: Lang; label: string }[] = [{ id: "pt", label: "PT" }, { id: "en", label: "EN" }, { id: "es", label: "ES" }];
const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function LangTabs({ menu }: { menu: Menu }) {
  return <SegmentedTabs<Lang> items={LANGS} value={menu.lang} onChange={menu.setLang} size="sm" ariaLabel="Idioma" style={{ alignSelf: "flex-start" }} />;
}

/** Guarda de descarte por snapshot do formulário (inputs nativos e listas montadas a botão). */
function useFormGuard<TForm>(open: boolean, form: TForm, onClose: () => void) {
  const snapshot = useRef("");
  useEffect(() => { if (open) snapshot.current = JSON.stringify(form); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [open]);
  const dirty = open && JSON.stringify(form) !== snapshot.current;
  return useCloseGuard(onClose, { open, dirty, escape: false });
}

// ── Categoria ──
export function CategoryDialog({ menu }: { menu: Menu }) {
  const f = menu.categoryForm;
  const set = (patch: Partial<typeof f>) => menu.setCategoryForm({ ...f, ...patch });
  const { requestClose, guardProps } = useFormGuard(menu.categoryOpen, f, () => menu.setCategoryOpen(false));
  return (
    <Dialog open={menu.categoryOpen} onClose={requestClose} presentation="auto" size="md" title={menu.editingCategory ? "Editar categoria" : "Nova categoria"} panelProps={guardProps} footerRow
      footer={(<><Button variant="ghost" onClick={requestClose}>Cancelar</Button><Button variant="primary" icon={Save} loading={menu.saving} loadingText="Salvando…" disabled={!f.name} onClick={menu.saveCategory}>Salvar</Button></>)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Nome da categoria" required>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <LangTabs menu={menu} />
            {menu.lang === "pt" && <Input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Ex: Bebidas" />}
            {menu.lang === "en" && <Input value={f.name_en} onChange={e => set({ name_en: e.target.value })} placeholder="Ex: Beverages" />}
            {menu.lang === "es" && <Input value={f.name_es} onChange={e => set({ name_es: e.target.value })} placeholder="Ex: Bebidas" />}
          </div>
        </Field>
        <Field label="Imagem da categoria" hint="opcional">
          <div style={{ height: 128, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden", background: T.glass }}>
            <ImageUpload value={f.imageUrl} onUploadSuccess={url => set({ imageUrl: url })} path="fb_images" />
          </div>
        </Field>
        <Field label="Onde disponibilizar?">
          <Select value={f.type} onChange={e => set({ type: e.target.value as typeof f.type })}>
            <option value="both">Restaurante & Café da Manhã</option>
            <option value="restaurant">Somente no Restaurante</option>
            <option value="breakfast">Somente no Café da Manhã</option>
          </Select>
        </Field>
        <div style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${f.alaCarte ? T.orangeBorder : T.border}`, background: f.alaCarte ? T.orangeBg : T.glass }}>
          <Switch checked={f.alaCarte} onChange={v => set({ alaCarte: v })} label="À la carte (buffet)" hint="Exibe esta categoria no pedido à la carte do salão" />
        </div>
        <Field label="Lógica de pedido (delivery)">
          <Select value={f.selectionTarget} onChange={e => set({ selectionTarget: e.target.value as typeof f.selectionTarget })}>
            <option value="individual">Individual — cada hóspede escolhe o seu (ex.: tapioca)</option>
            <option value="group_portion">Por grupo · porção — pergunta quantos do grupo querem (ex.: café na garrafa)</option>
            <option value="group_unit">Por grupo · unidades — escolha livre no limite total do grupo (ex.: pães)</option>
          </Select>
        </Field>
        {(f.selectionTarget === "individual" || f.alaCarte) && (
          <Field label="Nº máximo de itens por hóspede" hint="O hóspede será perguntado individualmente e só poderá escolher essa quantidade exata.">
            <Input type="number" min={1} inputMode="numeric" value={f.maxPerGuest} onChange={e => set({ maxPerGuest: parseInt(e.target.value) || 1 })} style={{ maxWidth: 140 }} />
          </Field>
        )}
        {f.selectionTarget === "group_unit" && (
          <Field label="Nº máximo de itens por hóspede (total da cabana)" hint="Ex.: cabana com 2 pessoas e limite 2 → até 4 itens desta categoria no total, de forma livre.">
            <Input type="number" min={1} inputMode="numeric" value={f.maxPerGuest} onChange={e => set({ maxPerGuest: parseInt(e.target.value) || 1 })} style={{ maxWidth: 140 }} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

// ── Item ──
export function ItemDialog({ menu }: { menu: Menu }) {
  const f = menu.itemForm;
  const set = (patch: Partial<typeof f>) => menu.setItemForm({ ...f, ...patch });
  const { requestClose, guardProps } = useFormGuard(menu.itemOpen, f, () => menu.setItemOpen(false));
  const cmv = f.ingredients.reduce((acc, ing) => acc + (ing.cost || 0), 0);
  const margin = f.price > 0 ? (((f.price - cmv) / f.price) * 100).toFixed(1) + "%" : "—";
  return (
    <Dialog open={menu.itemOpen} onClose={requestClose} presentation="auto" size="lg" title={menu.editingItem ? "Editar item" : "Novo item"} subtitle={menu.editingItem?.name} panelProps={guardProps} footerRow
      footer={(<><Button variant="ghost" onClick={requestClose}>Cancelar</Button><Button variant="primary" icon={Save} loading={menu.saving} loadingText="Salvando…" disabled={!f.name || !f.categoryId} onClick={menu.saveItem}>Salvar produto</Button></>)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Field label="Nome do produto" required>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <LangTabs menu={menu} />
            {menu.lang === "pt" && <Input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Ex: Hambúrguer Artesanal" />}
            {menu.lang === "en" && <Input value={f.name_en} onChange={e => set({ name_en: e.target.value })} placeholder="Ex: Artisan Burger" />}
            {menu.lang === "es" && <Input value={f.name_es} onChange={e => set({ name_es: e.target.value })} placeholder="Ex: Hamburguesa Artesanal" />}
          </div>
        </Field>
        <Field label="Descrição / composição">
          {menu.lang === "pt" && <Input value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Ex: Pão brioche, blend 180g, queijo prato..." />}
          {menu.lang === "en" && <Input value={f.description_en} onChange={e => set({ description_en: e.target.value })} placeholder="Ex: Brioche bun, 180g blend, cheddar cheese..." />}
          {menu.lang === "es" && <Input value={f.description_es} onChange={e => set({ description_es: e.target.value })} placeholder="Ex: Pan brioche, mezcla 180g, queso cheddar..." />}
        </Field>
        <FieldRow cols={2}>
          <Field label="Categoria" required>
            <Select value={f.categoryId} onChange={e => set({ categoryId: e.target.value })}>
              <option value="" disabled>Selecione...</option>
              {menu.categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </Select>
          </Field>
          <Field label="Preço de venda (R$)">
            <Input type="number" step="0.01" min="0" inputMode="decimal" value={f.price} onChange={e => set({ price: parseFloat(e.target.value) || 0 })} style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }} />
          </Field>
        </FieldRow>
        <Field label="Imagem do prato" hint="opcional">
          <div style={{ height: 160, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden", background: T.glass }}>
            <ImageUpload value={f.imageUrl} onUploadSuccess={url => set({ imageUrl: url })} path="fb_images" />
          </div>
        </Field>
        <div style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${f.active ? T.greenBorder : T.border}`, background: f.active ? T.greenBg : T.glass }}>
          <Switch checked={f.active} onChange={v => set({ active: v })} label="Disponível no cardápio" hint="Desmarque caso o produto esteja em falta." />
        </div>

        {/* Sabores / variações */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="ak-field__label">Sabores ou variações extras</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Input value={menu.tempFlavor.name} onChange={e => menu.setTempFlavor({ ...menu.tempFlavor, name: e.target.value })} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); menu.addFlavor(); } }} placeholder="Ex: Frango, Queijo, Sem Sal..." style={{ flex: 1 }} />
            <Button variant="secondary" icon={Plus} onClick={menu.addFlavor} disabled={!menu.tempFlavor.name}>Adicionar</Button>
          </div>
          <FieldRow cols={2}>
            <Input fieldSize="sm" value={menu.tempFlavor.name_en || ""} onChange={e => menu.setTempFlavor({ ...menu.tempFlavor, name_en: e.target.value })} placeholder="Nome (EN)" />
            <Input fieldSize="sm" value={menu.tempFlavor.name_es || ""} onChange={e => menu.setTempFlavor({ ...menu.tempFlavor, name_es: e.target.value })} placeholder="Nombre (ES)" />
          </FieldRow>
          {f.flavors.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {f.flavors.map((flavor, idx) => {
                const openDetails = menu.editingFlavorIndex === idx;
                return (
                  <div key={idx} style={{ borderRadius: 12, border: `1px solid ${T.border}`, background: T.glass, padding: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: T.text }}>{flavor.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Button variant={openDetails ? "primary" : "secondary"} size="sm" onClick={() => menu.setEditingFlavorIndex(openDetails ? null : idx)}>Detalhes{(flavor.ingredients?.length || 0) > 0 ? ` (${flavor.ingredients?.length})` : ""}</Button>
                        <IconButton icon={Trash2} label="Remover sabor" variant="ghost" tone="red" size="sm" onClick={() => menu.removeFlavor(idx)} />
                      </div>
                    </div>
                    {openDetails && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
                        <Field label="Imagem do sabor" hint="opcional — substitui a do item">
                          <div style={{ height: 120, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden", background: T.card }}>
                            <ImageUpload value={flavor.imageUrl} onUploadSuccess={url => menu.setFlavorImage(idx, url)} path="fb_images" />
                          </div>
                        </Field>
                        <Field label="Ingredientes específicos do sabor">
                          <div style={{ display: "flex", gap: 6 }}>
                            <Input fieldSize="sm" placeholder="Ingrediente do sabor" value={menu.tempFlavorIngredient.name} onChange={e => menu.setTempFlavorIngredient({ ...menu.tempFlavorIngredient, name: e.target.value })} style={{ flex: 1 }} />
                            <Input fieldSize="sm" type="number" step="0.01" min="0" inputMode="decimal" placeholder="R$" value={menu.tempFlavorIngredient.cost || ""} onChange={e => menu.setTempFlavorIngredient({ ...menu.tempFlavorIngredient, cost: parseFloat(e.target.value) || 0 })} style={{ width: 84 }} />
                            <IconButton icon={Plus} label="Adicionar ingrediente" variant="primary" onClick={menu.addFlavorIngredient} disabled={!menu.tempFlavorIngredient.name} />
                          </div>
                          {flavor.ingredients && flavor.ingredients.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                              {flavor.ingredients.map((ing, iIdx) => (
                                <div key={iIdx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 12 }}>
                                  <span style={{ color: T.text }}>{ing.name}</span>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: T.muted, fontVariantNumeric: "tabular-nums" }}>
                                    Custo: R$ {ing.cost.toFixed(2)}
                                    <IconButton icon={X} label="Remover" variant="ghost" tone="red" size="sm" onClick={() => menu.removeFlavorIngredient(idx, iIdx)} />
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ficha técnica */}
        <div style={{ borderRadius: 14, border: `1px solid ${T.border}`, background: T.glass, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text }}>Ficha técnica experimental (ingredientes)</h3>
            <span title="Adicione os ingredientes e seus custos para cálculo futuro de CMV" style={{ color: T.muted, display: "inline-flex" }}><Info size={13} /></span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_120px_120px_auto] gap-2 items-end">
            <Input fieldSize="sm" className="col-span-2 sm:col-span-1" placeholder="Ingrediente (ex: Pão brioche)" value={menu.tempIngredient.name} onChange={e => menu.setTempIngredient({ ...menu.tempIngredient, name: e.target.value })} />
            <Input fieldSize="sm" type="number" step="0.01" min="0" inputMode="decimal" placeholder="Custo (R$)" value={menu.tempIngredient.cost || ""} onChange={e => menu.setTempIngredient({ ...menu.tempIngredient, cost: parseFloat(e.target.value) || 0 })} />
            <Input fieldSize="sm" placeholder="Qtd (1 un, 50g)" value={menu.tempIngredient.quantity} onChange={e => menu.setTempIngredient({ ...menu.tempIngredient, quantity: e.target.value })} />
            <Button variant="primary" icon={Plus} className="col-span-2 sm:col-span-1" onClick={menu.addTempIngredient} disabled={!menu.tempIngredient.name}>Adicionar</Button>
          </div>
          {menu.stockEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
              <Field label="Baixa de estoque (opcional)">
                <Select fieldSize="sm" value={menu.tempIngredient.productId ?? ""} onChange={e => menu.setTempIngredient({ ...menu.tempIngredient, productId: e.target.value || null })}>
                  <option value="">Sem vínculo de estoque</option>
                  {menu.stockProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                </Select>
              </Field>
              <Field label="Qtd consumida / porção">
                <Input fieldSize="sm" type="number" step="0.001" min="0" inputMode="decimal" placeholder="0,000" value={menu.tempIngredient.consumptionQty ?? ""} onChange={e => menu.setTempIngredient({ ...menu.tempIngredient, consumptionQty: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
              </Field>
            </div>
          )}
          {f.ingredients.length > 0 && (
            <div style={{ borderRadius: 12, border: `1px solid ${T.border}`, background: T.card, overflow: "hidden" }}>
              {f.ingredients.map((ing, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ color: T.text, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ing.name}</span>
                  <span style={{ color: T.muted }}>{ing.quantity || "—"}</span>
                  <span style={{ color: T.red, fontVariantNumeric: "tabular-nums" }}>R$ {ing.cost.toFixed(2)}</span>
                  <IconButton icon={Trash2} label="Remover" variant="ghost" tone="red" size="sm" onClick={() => menu.removeIngredient(idx)} />
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", fontSize: 12, fontWeight: 800, background: T.glass }}>
                <span style={{ color: T.muted }}>Custo total (CMV est.)</span><span style={{ color: T.red }}>R$ {cmv.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", fontSize: 12, fontWeight: 900 }}>
                <span style={{ color: T.brandText }}>Margem bruta (estimada)</span><span style={{ color: T.brandText }}>{margin}</span>
              </div>
            </div>
          )}
          {f.price > 0 && f.ingredients.length === 0 && <span style={{ fontSize: 11, color: T.muted }}>Preço atual: {money(f.price)} · sem ingredientes cadastrados.</span>}
        </div>
      </div>
    </Dialog>
  );
}

// ── Configurações (mensagens do café no portal) ──
export function SettingsDialog({ menu }: { menu: Menu }) {
  const f = menu.settingsForm;
  const set = (patch: Partial<typeof f>) => menu.setSettingsForm({ ...f, ...patch });
  const { requestClose, guardProps } = useFormGuard(menu.settingsOpen, f, () => menu.setSettingsOpen(false));
  return (
    <Dialog open={menu.settingsOpen} onClose={requestClose} presentation="auto" size="md" title="Mensagens do café no portal" subtitle="Boas-vindas e instruções da cesta (delivery)" panelProps={guardProps} footerRow
      footer={(<><Button variant="ghost" onClick={requestClose}>Cancelar</Button><Button variant="primary" icon={Save} loading={menu.saving} loadingText="Salvando…" onClick={menu.saveSettings}>Salvar configurações</Button></>)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <LangTabs menu={menu} />
        <Field label="Mensagem de boas-vindas (delivery cesta)">
          {menu.lang === "pt" && <Textarea rows={3} autoGrow value={f.welcomeMessage} onChange={e => set({ welcomeMessage: e.target.value })} placeholder="Ex: Bom dia! Que tal montar sua cesta perfeita para amanhã?" />}
          {menu.lang === "en" && <Textarea rows={3} autoGrow value={f.welcomeMessage_en} onChange={e => set({ welcomeMessage_en: e.target.value })} placeholder="Ex: Good morning! Let's build your perfect basket for tomorrow?" />}
          {menu.lang === "es" && <Textarea rows={3} autoGrow value={f.welcomeMessage_es} onChange={e => set({ welcomeMessage_es: e.target.value })} placeholder="Ex: ¡Buenos días! ¿Qué tal armar tu canasta perfecta para mañana?" />}
        </Field>
        <Field label="Instruções passo a passo">
          {menu.lang === "pt" && <Textarea rows={3} autoGrow value={f.instructions} onChange={e => set({ instructions: e.target.value })} placeholder="Instruções na tela do pedido..." />}
          {menu.lang === "en" && <Textarea rows={3} autoGrow value={f.instructions_en} onChange={e => set({ instructions_en: e.target.value })} placeholder="Instructions on the order screen..." />}
          {menu.lang === "es" && <Textarea rows={3} autoGrow value={f.instructions_es} onChange={e => set({ instructions_es: e.target.value })} placeholder="Instrucciones en la pantalla de pedidos..." />}
        </Field>
        <Pill tone="neutral" label="Cada idioma é salvo separadamente" />
      </div>
    </Dialog>
  );
}
