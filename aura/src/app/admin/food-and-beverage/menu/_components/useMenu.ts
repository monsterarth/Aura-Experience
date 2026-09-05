"use client";

// Cardápio F&B — categorias, itens, ficha técnica e mensagens do café (lógica portada do page.tsx).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { fbService } from "@/services/fb-service";
import { StockClient } from "@/lib/stock-client";
import { isModuleOn } from "@/lib/modules";
import type { FBCategory, FBMenuItem, FBIngredient, FBFlavor } from "@/types/aura";
import { useConfigDeepLink } from "@/lib/settings-deeplink";
import { useConfirm } from "@/components/aura";

export type Lang = "pt" | "en" | "es";
export type CategoryForm = {
  name: string; name_en: string; name_es: string; type: FBCategory["type"];
  selectionTarget: "individual" | "group_portion" | "group_unit"; maxPerGuest: number; imageUrl: string; order: number; alaCarte: boolean;
};
export type ItemForm = {
  name: string; name_en: string; name_es: string; description: string; description_en: string; description_es: string;
  price: number; categoryId: string; active: boolean; ingredients: FBIngredient[]; flavors: FBFlavor[]; imageUrl: string; order: number;
};
export type SettingsForm = { welcomeMessage: string; welcomeMessage_en: string; welcomeMessage_es: string; instructions: string; instructions_en: string; instructions_es: string };

const EMPTY_CATEGORY: CategoryForm = { name: "", name_en: "", name_es: "", type: "both", selectionTarget: "individual", maxPerGuest: 1, imageUrl: "", order: 0, alaCarte: false };
const EMPTY_ITEM: ItemForm = { name: "", name_en: "", name_es: "", description: "", description_en: "", description_es: "", price: 0, categoryId: "", active: true, ingredients: [], flavors: [], imageUrl: "", order: 0 };
const EMPTY_FLAVOR: FBFlavor = { name: "", name_en: "", name_es: "", imageUrl: "", ingredients: [] };
const EMPTY_ING: FBIngredient = { name: "", cost: 0, quantity: "", productId: null, consumptionQty: undefined };

export function useMenu() {
  const { currentProperty } = useProperty();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<FBCategory[]>([]);
  const [items, setItems] = useState<FBMenuItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Categoria
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FBCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY);

  // Configurações (mensagens do café no portal)
  const [settingsOpen, setSettingsOpen] = useState(false);
  useConfigDeepLink({ cafe: () => setSettingsOpen(true) });
  const [settingsForm, setSettingsForm] = useState<SettingsForm>({ welcomeMessage: "", welcomeMessage_en: "", welcomeMessage_es: "", instructions: "", instructions_en: "", instructions_es: "" });

  // Item
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FBMenuItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
  const [tempFlavor, setTempFlavor] = useState<FBFlavor>(EMPTY_FLAVOR);
  const [tempIngredient, setTempIngredient] = useState<FBIngredient>(EMPTY_ING);
  const [editingFlavorIndex, setEditingFlavorIndex] = useState<number | null>(null);
  const [tempFlavorIngredient, setTempFlavorIngredient] = useState<FBIngredient>({ name: "", cost: 0, quantity: "" });
  const [lang, setLang] = useState<Lang>("pt");

  // Estoque: produtos para vincular na ficha técnica (só se o módulo estiver ligado)
  const stockEnabled = isModuleOn(currentProperty?.settings, "estoque");
  const [stockProducts, setStockProducts] = useState<{ id: string; name: string; unit: string }[]>([]);
  useEffect(() => {
    if (!currentProperty?.id || !stockEnabled) { setStockProducts([]); return; }
    StockClient.products(currentProperty.id)
      .then(ps => setStockProducts(ps.map(p => ({ id: p.id, name: p.name, unit: p.unit }))))
      .catch(() => setStockProducts([]));
  }, [currentProperty?.id, stockEnabled]);

  const loadData = useCallback(async () => {
    if (!currentProperty) return;
    try {
      const [cats, itms] = await Promise.all([fbService.getCategories(currentProperty.id), fbService.getMenuItems(currentProperty.id)]);
      setCategories(cats);
      setItems(itms);
    } catch {
      toast.error("Erro ao carregar cardápio.");
    } finally {
      setLoading(false);
    }
  }, [currentProperty]);

  useEffect(() => {
    if (!currentProperty) return;
    const d = currentProperty.settings?.fbSettings?.breakfast?.delivery;
    setSettingsForm({
      welcomeMessage: d?.welcomeMessage || "", welcomeMessage_en: d?.welcomeMessage_en || "", welcomeMessage_es: d?.welcomeMessage_es || "",
      instructions: d?.instructions || "", instructions_en: d?.instructions_en || "", instructions_es: d?.instructions_es || "",
    });
    setLoading(true);
    void loadData();
  }, [currentProperty, loadData]);

  // ── Categorias ──
  const openCategory = (cat?: FBCategory, isClone = false) => {
    if (cat) {
      setEditingCategory(isClone ? null : cat);
      setCategoryForm({
        name: isClone ? `${cat.name} (Cópia)` : cat.name, name_en: cat.name_en || "", name_es: cat.name_es || "", type: cat.type,
        selectionTarget: (cat.selectionTarget as CategoryForm["selectionTarget"]) || "individual", maxPerGuest: cat.maxPerGuest || 1,
        imageUrl: cat.imageUrl || "", order: isClone ? categories.length : (cat.order || 0), alaCarte: cat.alaCarte ?? false,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ ...EMPTY_CATEGORY, order: categories.length });
    }
    setLang("pt");
    setCategoryOpen(true);
  };

  const saveCategory = async () => {
    if (!currentProperty || !categoryForm.name) return;
    setSaving(true);
    try {
      const f = categoryForm;
      if (editingCategory) {
        await fbService.updateCategory(editingCategory.id, f.name, f.type, f.selectionTarget, f.maxPerGuest, f.order, f.imageUrl, f.name_en, f.name_es, f.alaCarte);
        toast.success("Categoria atualizada.");
      } else {
        await fbService.createCategory(currentProperty.id, f.name, f.type, f.selectionTarget, f.maxPerGuest, f.order, f.imageUrl, f.name_en, f.name_es, f.alaCarte);
        toast.success("Categoria criada.");
      }
      setCategoryOpen(false);
      void loadData();
    } catch {
      toast.error("Erro ao salvar categoria.");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (cat: FBCategory) => {
    const ok = await confirm({ title: "Excluir categoria?", description: `“${cat.name}” e todos os itens vinculados serão removidos. Esta ação não pode ser desfeita.`, confirmLabel: "Excluir", tone: "danger" });
    if (!ok) return;
    try {
      await fbService.deleteCategory(currentProperty!.id, cat.id);
      toast.success("Categoria removida.");
      void loadData();
    } catch {
      toast.error("Erro ao remover categoria.");
    }
  };

  const moveCategory = async (index: number, direction: "up" | "down") => {
    if (!currentProperty) return;
    const newCats = [...categories];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newCats.length) return;
    [newCats[index], newCats[swapIndex]] = [newCats[swapIndex], newCats[index]];
    newCats.forEach((c, i) => { c.order = i; });
    setCategories(newCats);
    try {
      await fbService.updateCategoryOrder(newCats.map(c => ({ id: c.id, order: c.order || 0 })));
      toast.success("Ordem salva");
    } catch {
      toast.error("Erro ao ordenar");
      void loadData();
    }
  };

  // ── Configurações ──
  const saveSettings = async () => {
    if (!currentProperty) return;
    setSaving(true);
    try {
      const currentFbSettings = currentProperty.settings?.fbSettings || { restaurant: { enabled: false, name: "", operatingHours: [] }, breakfast: { enabled: false, modality: "delivery", name: "" } };
      const newFbSettings = {
        ...currentFbSettings,
        breakfast: {
          ...currentFbSettings.breakfast,
          delivery: { ...(currentFbSettings.breakfast.delivery || { orderWindowStart: "18:00", orderWindowEnd: "22:00", deliveryTimes: [] }), ...settingsForm },
        },
      };
      await fbService.updateSettings(currentProperty.id, newFbSettings as never);
      toast.success("Configurações atualizadas com sucesso.");
      setSettingsOpen(false);
    } catch {
      toast.error("Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  // ── Itens ──
  const openItem = (item?: FBMenuItem, catId?: string, isClone = false) => {
    if (item) {
      setEditingItem(isClone ? null : item);
      setItemForm({
        name: isClone ? `${item.name} (Cópia)` : item.name, name_en: item.name_en || "", name_es: item.name_es || "",
        description: item.description || "", description_en: item.description_en || "", description_es: item.description_es || "",
        price: item.price, categoryId: isClone && catId ? catId : item.categoryId, active: item.active,
        ingredients: [...item.ingredients], flavors: item.flavors ? JSON.parse(JSON.stringify(item.flavors)) : [],
        imageUrl: item.imageUrl || "", order: isClone ? items.filter(i => i.categoryId === (catId || item.categoryId)).length : (item.order || 0),
      });
    } else {
      setEditingItem(null);
      setItemForm({ ...EMPTY_ITEM, categoryId: catId || (categories.length > 0 ? categories[0].id : ""), order: items.filter(i => i.categoryId === catId).length });
    }
    setTempFlavor(EMPTY_FLAVOR);
    setTempIngredient(EMPTY_ING);
    setLang("pt");
    setEditingFlavorIndex(null);
    setItemOpen(true);
  };

  const saveItem = async () => {
    if (!currentProperty || !itemForm.name || !itemForm.categoryId) return;
    setSaving(true);
    try {
      if (editingItem) {
        await fbService.updateMenuItem(editingItem.id, { ...itemForm });
        toast.success("Item atualizado.");
      } else {
        await fbService.createMenuItem({ propertyId: currentProperty.id, ...itemForm });
        toast.success("Item criado.");
      }
      setItemOpen(false);
      void loadData();
    } catch {
      toast.error("Erro ao salvar item.");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: FBMenuItem) => {
    const ok = await confirm({ title: "Excluir item?", description: `“${item.name}” sai do cardápio. Esta ação é irreversível.`, confirmLabel: "Excluir", tone: "danger" });
    if (!ok) return;
    try {
      await fbService.deleteMenuItem(currentProperty!.id, item.id);
      toast.success("Item removido.");
      void loadData();
    } catch {
      toast.error("Erro ao remover item.");
    }
  };

  const addTempIngredient = () => {
    if (!tempIngredient.name) return;
    setItemForm(prev => ({ ...prev, ingredients: [...prev.ingredients, { ...tempIngredient }] }));
    setTempIngredient(EMPTY_ING);
  };
  const removeIngredient = (index: number) => setItemForm(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== index) }));
  const addFlavor = () => {
    if (!tempFlavor.name) return;
    setItemForm(prev => ({ ...prev, flavors: [...prev.flavors, { ...tempFlavor }] }));
    setTempFlavor(EMPTY_FLAVOR);
  };
  const removeFlavor = (index: number) => {
    setItemForm(prev => ({ ...prev, flavors: prev.flavors.filter((_, i) => i !== index) }));
    if (editingFlavorIndex === index) setEditingFlavorIndex(null);
  };
  const setFlavorImage = (idx: number, url: string) => setItemForm(prev => {
    const nf = [...prev.flavors]; nf[idx] = { ...nf[idx], imageUrl: url }; return { ...prev, flavors: nf };
  });
  const addFlavorIngredient = () => {
    if (editingFlavorIndex === null || !tempFlavorIngredient.name) return;
    setItemForm(prev => {
      const nf = [...prev.flavors];
      const flavor = { ...nf[editingFlavorIndex] };
      flavor.ingredients = [...(flavor.ingredients || []), { ...tempFlavorIngredient }];
      nf[editingFlavorIndex] = flavor;
      return { ...prev, flavors: nf };
    });
    setTempFlavorIngredient({ name: "", cost: 0, quantity: "" });
  };
  const removeFlavorIngredient = (flavorIdx: number, ingIdx: number) => setItemForm(prev => {
    const nf = [...prev.flavors];
    const flavor = { ...nf[flavorIdx], ingredients: (nf[flavorIdx].ingredients || []).filter((_, i) => i !== ingIdx) };
    nf[flavorIdx] = flavor;
    return { ...prev, flavors: nf };
  });

  const moveItem = async (catId: string, indexInCat: number, direction: "up" | "down") => {
    const catItems = items.filter(i => i.categoryId === catId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const swapIndex = direction === "up" ? indexInCat - 1 : indexInCat + 1;
    if (swapIndex < 0 || swapIndex >= catItems.length) return;
    [catItems[indexInCat], catItems[swapIndex]] = [catItems[swapIndex], catItems[indexInCat]];
    catItems.forEach((c, i) => { c.order = i; });
    setItems(items.map(item => { const u = catItems.find(ci => ci.id === item.id); return u ? { ...item, order: u.order } : item; }));
    try {
      await fbService.updateMenuItemOrder(catItems.map(c => ({ id: c.id, order: c.order || 0 })));
    } catch {
      toast.error("Erro ao ordenar itens");
      void loadData();
    }
  };

  const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return {
    currentProperty, loading, saving, categories, items, filteredCategories, searchTerm, setSearchTerm, stockEnabled, stockProducts, lang, setLang,
    categoryOpen, setCategoryOpen, editingCategory, categoryForm, setCategoryForm, openCategory, saveCategory, deleteCategory, moveCategory,
    settingsOpen, setSettingsOpen, settingsForm, setSettingsForm, saveSettings,
    itemOpen, setItemOpen, editingItem, itemForm, setItemForm, openItem, saveItem, deleteItem, moveItem,
    tempFlavor, setTempFlavor, addFlavor, removeFlavor, setFlavorImage, editingFlavorIndex, setEditingFlavorIndex, tempFlavorIngredient, setTempFlavorIngredient, addFlavorIngredient, removeFlavorIngredient,
    tempIngredient, setTempIngredient, addTempIngredient, removeIngredient,
  };
}
