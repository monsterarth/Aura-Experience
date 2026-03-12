"use client";

import React, { useState, useEffect } from "react";
import { useProperty } from "@/context/PropertyContext";
import { fbService } from "@/services/fb-service";
import { FBCategory, FBMenuItem, FBIngredient, FBFlavor } from "@/types/aura";
import { Loader2, Plus, Edit2, Trash2, CheckCircle2, XCircle, Search, Save, X, Info, Settings, ArrowUp, ArrowDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImageUpload } from "@/components/admin/ImageUpload";

export default function FBMenuPage() {
    const { currentProperty } = useProperty();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [categories, setCategories] = useState<FBCategory[]>([]);
    const [items, setItems] = useState<FBMenuItem[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    // Modals state
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<FBCategory | null>(null);
    const [categoryForm, setCategoryForm] = useState<{
        name: string;
        name_en: string;
        name_es: string;
        type: FBCategory['type'];
        selectionTarget: 'individual' | 'group_portion' | 'group_unit';
        maxPerGuest: number;
        imageUrl: string;
        order: number;
        alaCarte: boolean;
    }>({ name: "", name_en: "", name_es: "", type: "both", selectionTarget: "individual", maxPerGuest: 1, imageUrl: "", order: 0, alaCarte: false });

    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [settingsForm, setSettingsForm] = useState({ 
        welcomeMessage: "", welcomeMessage_en: "", welcomeMessage_es: "", 
        instructions: "", instructions_en: "", instructions_es: "" 
    });

    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<FBMenuItem | null>(null);
    const [itemForm, setItemForm] = useState<{
        name: string;
        name_en: string;
        name_es: string;
        description: string;
        description_en: string;
        description_es: string;
        price: number;
        categoryId: string;
        active: boolean;
        ingredients: FBIngredient[];
        flavors: FBFlavor[];
        imageUrl: string;
        order: number;
    }>({
        name: "", name_en: "", name_es: "", description: "", description_en: "", description_es: "", price: 0, categoryId: "", active: true, ingredients: [], flavors: [], imageUrl: "", order: 0
    });

    // Temp states for lists
    const [tempFlavor, setTempFlavor] = useState<FBFlavor>({ name: "", name_en: "", name_es: "", imageUrl: "", ingredients: [] });

    // Ingredient Temp State for Item form
    const [tempIngredient, setTempIngredient] = useState<FBIngredient>({ name: "", cost: 0, quantity: "" });

    // For flavors ingredient management
    const [editingFlavorIndex, setEditingFlavorIndex] = useState<number | null>(null);
    const [tempFlavorIngredient, setTempFlavorIngredient] = useState<FBIngredient>({ name: "", cost: 0, quantity: "" });

    // Language tab for modal forms
    const [formLangTab, setFormLangTab] = useState<'pt' | 'en' | 'es'>('pt');

    useEffect(() => {
        if (currentProperty) {
            setSettingsForm({
                welcomeMessage: currentProperty.settings?.fbSettings?.breakfast?.delivery?.welcomeMessage || "",
                welcomeMessage_en: currentProperty.settings?.fbSettings?.breakfast?.delivery?.welcomeMessage_en || "",
                welcomeMessage_es: currentProperty.settings?.fbSettings?.breakfast?.delivery?.welcomeMessage_es || "",
                instructions: currentProperty.settings?.fbSettings?.breakfast?.delivery?.instructions || "",
                instructions_en: currentProperty.settings?.fbSettings?.breakfast?.delivery?.instructions_en || "",
                instructions_es: currentProperty.settings?.fbSettings?.breakfast?.delivery?.instructions_es || "",
            });
            loadData();
        }
    }, [currentProperty]);

    async function loadData() {
        if (!currentProperty) return;
        setLoading(true);
        try {
            const [cats, itms] = await Promise.all([
                fbService.getCategories(currentProperty.id),
                fbService.getMenuItems(currentProperty.id)
            ]);
            setCategories(cats);
            setItems(itms);
        } catch (error) {
            toast.error("Erro ao carregar cardápio.");
        } finally {
            setLoading(false);
        }
    }

    // --- CATEGORY ACTIONS ---
    function openCategoryModal(cat?: FBCategory, isClone: boolean = false) {
        if (cat) {
            setEditingCategory(isClone ? null : cat);
            setCategoryForm({
                name: isClone ? `${cat.name} (Cópia)` : cat.name,
                name_en: cat.name_en || "",
                name_es: cat.name_es || "",
                type: cat.type,
                selectionTarget: (cat.selectionTarget as any) || 'individual',
                maxPerGuest: cat.maxPerGuest || 1,
                imageUrl: cat.imageUrl || "",
                order: isClone ? categories.length : (cat.order || 0),
                alaCarte: cat.alaCarte ?? false,
            });
        } else {
            setEditingCategory(null);
            setCategoryForm({ name: "", name_en: "", name_es: "", type: "both", selectionTarget: "individual", maxPerGuest: 1, imageUrl: "", order: categories.length, alaCarte: false });
        }
        setFormLangTab('pt');
        setIsCategoryModalOpen(true);
    }

    async function saveCategory() {
        if (!currentProperty || !categoryForm.name) return;
        setSaving(true);
        try {
            if (editingCategory) {
                await fbService.updateCategory(editingCategory.id, categoryForm.name, categoryForm.type, categoryForm.selectionTarget, categoryForm.maxPerGuest, categoryForm.order, categoryForm.imageUrl, categoryForm.name_en, categoryForm.name_es, categoryForm.alaCarte);
                toast.success("Categoria atualizada.");
            } else {
                await fbService.createCategory(currentProperty.id, categoryForm.name, categoryForm.type, categoryForm.selectionTarget, categoryForm.maxPerGuest, categoryForm.order, categoryForm.imageUrl, categoryForm.name_en, categoryForm.name_es, categoryForm.alaCarte);
                toast.success("Categoria criada.");
            }
            setIsCategoryModalOpen(false);
            loadData();
        } catch (error) {
            toast.error("Erro ao salvar categoria.");
        } finally {
            setSaving(false);
        }
    }

    async function deleteCategory(id: string) {
        if (!confirm("Tem certeza? Esta ação removerá a categoria e todos itens vinculados!")) return;
        try {
            await fbService.deleteCategory(id);
            toast.success("Categoria removida.");
            loadData();
        } catch (error) {
            toast.error("Erro ao remover categoria.");
        }
    }

    async function moveCategory(index: number, direction: 'up' | 'down') {
        if (!currentProperty) return;
        const newCats = [...categories];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= newCats.length) return;

        // Swap visually
        const temp = newCats[index];
        newCats[index] = newCats[swapIndex];
        newCats[swapIndex] = temp;

        // Reassign orders
        newCats.forEach((c, i) => { c.order = i; });
        setCategories(newCats);

        try {
            await fbService.updateCategoryOrder(newCats.map(c => ({ id: c.id, order: c.order || 0 })));
            toast.success("Ordem salva");
        } catch (e) {
            toast.error("Erro ao ordernar");
            loadData();
        }
    }

    // --- SETTINGS ACTIONS ---
    async function saveSettings() {
        if (!currentProperty) return;
        setSaving(true);
        try {
            const currentFbSettings = currentProperty.settings?.fbSettings || { restaurant: { enabled: false, name: "", operatingHours: [] }, breakfast: { enabled: false, modality: "delivery", name: "" } };
            const newFbSettings = {
                ...currentFbSettings,
                breakfast: {
                    ...currentFbSettings.breakfast,
                    delivery: {
                        ...(currentFbSettings.breakfast.delivery || { orderWindowStart: "18:00", orderWindowEnd: "22:00", deliveryTimes: [] }),
                        welcomeMessage: settingsForm.welcomeMessage,
                        welcomeMessage_en: settingsForm.welcomeMessage_en,
                        welcomeMessage_es: settingsForm.welcomeMessage_es,
                        instructions: settingsForm.instructions,
                        instructions_en: settingsForm.instructions_en,
                        instructions_es: settingsForm.instructions_es,
                    }
                }
            };
            await fbService.updateSettings(currentProperty.id, newFbSettings as any);
            toast.success("Configurações atualizadas com sucesso.");
            setIsSettingsModalOpen(false);
        } catch (error) {
            toast.error("Erro ao salvar configurações.");
        } finally {
            setSaving(false);
        }
    }

    // --- ITEM ACTIONS ---
    function openItemModal(item?: FBMenuItem, catId?: string, isClone: boolean = false) {
        if (item) {
            setEditingItem(isClone ? null : item);
            setItemForm({
                name: isClone ? `${item.name} (Cópia)` : item.name,
                name_en: item.name_en || "",
                name_es: item.name_es || "",
                description: item.description || "",
                description_en: item.description_en || "",
                description_es: item.description_es || "",
                price: item.price,
                categoryId: isClone && catId ? catId : item.categoryId,
                active: item.active,
                ingredients: [...item.ingredients],
                flavors: item.flavors ? JSON.parse(JSON.stringify(item.flavors)) : [],
                imageUrl: item.imageUrl || "",
                order: isClone ? items.filter(i => i.categoryId === (catId || item.categoryId)).length : (item.order || 0)
            });
        } else {
            setEditingItem(null);
            setItemForm({
                name: "",
                name_en: "",
                name_es: "",
                description: "",
                description_en: "",
                description_es: "",
                price: 0,
                categoryId: catId || (categories.length > 0 ? categories[0].id : ""),
                active: true,
                ingredients: [],
                flavors: [],
                imageUrl: "",
                order: items.filter(i => i.categoryId === catId).length
            });
        }
        setFormLangTab('pt');
        setEditingFlavorIndex(null);
        setIsItemModalOpen(true);
    }

    async function saveItem() {
        if (!currentProperty || !itemForm.name || !itemForm.categoryId) return;
        setSaving(true);
        try {
            if (editingItem) {
                await fbService.updateMenuItem(editingItem.id, {
                    ...itemForm,
                });
                toast.success("Item atualizado.");
            } else {
                await fbService.createMenuItem({
                    propertyId: currentProperty.id,
                    ...itemForm,
                });
                toast.success("Item criado.");
            }
            setIsItemModalOpen(false);
            loadData();
        } catch (error) {
            toast.error("Erro ao salvar item.");
        } finally {
            setSaving(false);
        }
    }

    async function deleteItem(id: string) {
        if (!confirm("Tem certeza? Esta ação é irreversível.")) return;
        try {
            await fbService.deleteMenuItem(id);
            toast.success("Item removido.");
            loadData();
        } catch (error) {
            toast.error("Erro ao remover item.");
        }
    }

    function addTempIngredient() {
        if (!tempIngredient.name) return;
        setItemForm(prev => ({
            ...prev,
            ingredients: [...prev.ingredients, { ...tempIngredient }]
        }));
        setTempIngredient({ name: "", cost: 0, quantity: "" });
    }

    function removeIngredient(index: number) {
        setItemForm(prev => {
            const arr = [...prev.ingredients];
            arr.splice(index, 1);
            return { ...prev, ingredients: arr };
        });
    }

    function addFlavor() {
        if (!tempFlavor.name) return;
        setItemForm(prev => ({
            ...prev,
            flavors: [...prev.flavors, { ...tempFlavor }]
        }));
        setTempFlavor({ name: "", name_en: "", name_es: "", imageUrl: "", ingredients: [] });
    }

    function removeFlavor(index: number) {
        setItemForm(prev => {
            const arr = [...prev.flavors];
            arr.splice(index, 1);
            return { ...prev, flavors: arr };
        });
        if (editingFlavorIndex === index) setEditingFlavorIndex(null);
    }

    function addFlavorIngredient() {
        if (editingFlavorIndex === null || !tempFlavorIngredient.name) return;
        setItemForm(prev => {
            const newFlavors = [...prev.flavors];
            const flavor = newFlavors[editingFlavorIndex];
            flavor.ingredients = [...(flavor.ingredients || []), { ...tempFlavorIngredient }];
            return { ...prev, flavors: newFlavors };
        });
        setTempFlavorIngredient({ name: "", cost: 0, quantity: "" });
    }

    function removeFlavorIngredient(flavorIdx: number, ingIdx: number) {
        setItemForm(prev => {
            const newFlavors = [...prev.flavors];
            const flavor = newFlavors[flavorIdx];
            if (flavor.ingredients) {
                flavor.ingredients.splice(ingIdx, 1);
            }
            return { ...prev, flavors: newFlavors };
        });
    }

    async function moveItem(catId: string, indexInCat: number, direction: 'up' | 'down') {
        const catItems = items.filter(i => i.categoryId === catId).sort((a, b) => (a.order || 0) - (b.order || 0));
        const swapIndex = direction === 'up' ? indexInCat - 1 : indexInCat + 1;
        if (swapIndex < 0 || swapIndex >= catItems.length) return;

        // Swap visually
        const temp = catItems[indexInCat];
        catItems[indexInCat] = catItems[swapIndex];
        catItems[swapIndex] = temp;

        // Reorder cat items
        catItems.forEach((c, i) => { c.order = i; });

        // Merge back into main list
        const newItems = items.map(item => {
            const updated = catItems.find(ci => ci.id === item.id);
            if (updated) return { ...item, order: updated.order };
            return item;
        });

        setItems(newItems);

        try {
            await fbService.updateMenuItemOrder(catItems.map(c => ({ id: c.id, order: c.order || 0 })));
        } catch (e) {
            toast.error("Erro ao ordernar itens");
            loadData();
        }
    }

    if (loading) return <div className="flex justify-center p-24"><Loader2 className="animate-spin text-primary" size={40} /></div>;

    const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-3xl shadow-sm">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Buscar categorias..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl font-medium text-foreground outline-none focus:border-primary/50 transition-colors"
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={() => setIsSettingsModalOpen(true)}
                        className="flex items-center justify-center gap-2 p-3 bg-secondary text-foreground hover:bg-secondary/80 rounded-xl transition-all"
                        title="Configurações do F&B"
                    >
                        <Settings size={20} />
                    </button>
                    <button
                        onClick={() => openCategoryModal()}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-secondary text-foreground hover:bg-secondary/80 rounded-xl font-bold transition-all text-xs uppercase tracking-widest whitespace-nowrap"
                    >
                        <Plus size={16} /> Nova Categoria
                    </button>
                    <button
                        onClick={() => {
                            if (categories.length === 0) {
                                toast.error("Crie uma categoria primeiro!");
                                return;
                            }
                            openItemModal();
                        }}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground hover:opacity-90 rounded-xl font-bold transition-all text-xs uppercase tracking-widest shadow-lg shadow-primary/20 whitespace-nowrap"
                    >
                        <Plus size={16} /> Novo Item
                    </button>
                </div>
            </div>

            {/* Content (List) */}
            {categories.length === 0 ? (
                <div className="text-center p-12 bg-card border border-border rounded-3xl border-dashed">
                    <p className="text-muted-foreground mb-4">Nenhuma categoria cadastrada.</p>
                    <button onClick={() => openCategoryModal()} className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest rounded-xl hover:opacity-90">Criar Primeira Categoria</button>
                </div>
            ) : (
                <div className="space-y-8">
                    {filteredCategories.map(cat => {
                        const catItems = items.filter(i => i.categoryId === cat.id);
                        return (
                            <section key={cat.id} className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                                <header className="bg-secondary/50 p-6 flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-border">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-xl font-black">{cat.name}</h2>
                                            <span className="px-2 py-0.5 rounded bg-background border border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                {cat.type === 'both' ? 'Restaurante & Café' : cat.type === 'breakfast' ? 'Só Café da Manhã' : 'Só Restaurante'}
                                            </span>
                                            {cat.selectionTarget && (
                                                <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                                                    {cat.selectionTarget === 'individual' ? `Por Hóspede (Max: ${cat.maxPerGuest || 1})` : cat.selectionTarget === 'group_portion' ? 'Por Grupo (Porções)' : `Por Grupo (Piscina: ${cat.maxPerGuest || 1} un)`}
                                                </span>
                                            )}
                                            {cat.alaCarte && (
                                                <span className="px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold uppercase tracking-widest text-orange-500">
                                                    À La Carte
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">{catItems.length} {catItems.length === 1 ? 'item' : 'itens'}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center bg-secondary rounded-xl mr-2">
                                            <button onClick={() => moveCategory(categories.findIndex(c => c.id === cat.id), 'up')} className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" disabled={categories.findIndex(c => c.id === cat.id) === 0} title="Mover para Cima">
                                                <ArrowUp size={16} />
                                            </button>
                                            <button onClick={() => moveCategory(categories.findIndex(c => c.id === cat.id), 'down')} className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" disabled={categories.findIndex(c => c.id === cat.id) === categories.length - 1} title="Mover para Baixo">
                                                <ArrowDown size={16} />
                                            </button>
                                        </div>
                                        <button onClick={() => openItemModal(undefined, cat.id)} className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-colors" title="Adicionar Item">
                                            <Plus size={18} />
                                        </button>
                                        <button onClick={() => openCategoryModal(cat)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors" title="Editar Categoria">
                                            <Edit2 size={18} />
                                        </button>
                                        <button onClick={() => openCategoryModal(cat, true)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors" title="Duplicar Categoria">
                                            <Copy size={18} />
                                        </button>
                                        <button onClick={() => deleteCategory(cat.id)} className="p-2 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors" title="Excluir Categoria">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </header>

                                {catItems.length > 0 ? (
                                    <div className="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                        {catItems.map(item => (
                                            <div key={item.id} className={cn("p-4 rounded-2xl border transition-all relative group flex flex-col", item.active ? "bg-background border-border hover:border-primary/50" : "bg-card border-border opacity-60")}>

                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className="font-bold text-foreground pr-8">{item.name}</h3>
                                                    {item.active ? (
                                                        <CheckCircle2 size={16} className="text-green-500 shrink-0 absolute right-4 top-4" />
                                                    ) : (
                                                        <XCircle size={16} className="text-muted-foreground shrink-0 absolute right-4 top-4" />
                                                    )}
                                                </div>

                                                {item.description && (
                                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3 max-w-[90%]">{item.description}</p>
                                                )}

                                                <div className="mt-auto pt-3 border-t border-border/50 flex justify-between items-center">
                                                    <span className="font-black text-primary">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}
                                                    </span>

                                                    {/* Actions (Hover) */}
                                                    <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <div className="flex flex-col gap-1 mr-1">
                                                            <button onClick={() => moveItem(cat.id, catItems.findIndex(i => i.id === item.id), 'up')} className="p-1 text-muted-foreground hover:text-foreground rounded bg-secondary disabled:opacity-30" disabled={catItems.findIndex(i => i.id === item.id) === 0}><ArrowUp size={10} /></button>
                                                            <button onClick={() => moveItem(cat.id, catItems.findIndex(i => i.id === item.id), 'down')} className="p-1 text-muted-foreground hover:text-foreground rounded bg-secondary disabled:opacity-30" disabled={catItems.findIndex(i => i.id === item.id) === catItems.length - 1}><ArrowDown size={10} /></button>
                                                        </div>
                                                        <button onClick={() => openItemModal(item, cat.id)} className="p-1.5 text-muted-foreground hover:text-primary rounded-lg bg-secondary" title="Editar"><Edit2 size={14} /></button>
                                                        <button onClick={() => openItemModal(item, cat.id, true)} className="p-1.5 text-muted-foreground hover:text-primary rounded-lg bg-secondary" title="Duplicar"><Copy size={14} /></button>
                                                        <button onClick={() => deleteItem(item.id)} className="p-1.5 text-red-500/70 hover:text-red-500 rounded-lg bg-red-500/10" title="Excluir"><Trash2 size={14} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-6 text-center">
                                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhum item nesta categoria</p>
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}

            {/* MODAL CATEGORIA */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-md max-h-[90vh] flex flex-col rounded-[32px] overflow-hidden shadow-2xl scale-in-center">
                        <div className="p-6 flex justify-between items-center border-b border-border shrink-0">
                            <h2 className="text-xl font-black">{editingCategory ? "Editar Categoria" : "Nova Categoria"}</h2>
                            <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 hover:bg-secondary rounded-full"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Nome da Categoria</label>
                                {/* Language tabs */}
                                <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-2">
                                    {(['pt', 'en', 'es'] as const).map(l => (
                                        <button key={l} type="button"
                                            onClick={() => setFormLangTab(l)}
                                            className={cn("px-3 py-1 text-xs font-bold uppercase rounded-md transition-all",
                                                formLangTab === l ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
                                        >{l}</button>
                                    ))}
                                </div>
                                {formLangTab === 'pt' && (
                                    <input value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})}
                                        className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-primary/50"
                                        placeholder="Ex: Bebidas" />
                                )}
                                {formLangTab === 'en' && (
                                    <input value={categoryForm.name_en || ""} onChange={e => setCategoryForm({...categoryForm, name_en: e.target.value})}
                                        className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-blue-500/50"
                                        placeholder="Ex: Beverages" />
                                )}
                                {formLangTab === 'es' && (
                                    <input value={categoryForm.name_es || ""} onChange={e => setCategoryForm({...categoryForm, name_es: e.target.value})}
                                        className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-orange-500/50"
                                        placeholder="Ex: Bebidas" />
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Imagem da Categoria (Opcional)</label>
                                <div className="h-32 rounded-xl border border-border overflow-hidden">
                                    <ImageUpload
                                        value={categoryForm.imageUrl}
                                        onUploadSuccess={url => setCategoryForm({ ...categoryForm, imageUrl: url })}
                                        path="fb_images"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Onde Disponibilizar?</label>
                                <select
                                    value={categoryForm.type}
                                    onChange={e => setCategoryForm({ ...categoryForm, type: e.target.value as any })}
                                    className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground appearance-none"
                                >
                                    <option value="both">Restaurante & Café da Manhã</option>
                                    <option value="restaurant">Somente no Restaurante</option>
                                    <option value="breakfast">Somente no Café da Manhã</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-secondary rounded-xl border border-border">
                                <div>
                                    <p className="text-sm font-bold text-foreground">À La Carte (Buffet)</p>
                                    <p className="text-xs text-muted-foreground">Exibe esta categoria no pedido à la carte do salão</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCategoryForm({ ...categoryForm, alaCarte: !categoryForm.alaCarte })}
                                    className={cn("w-12 h-6 rounded-full transition-all relative shrink-0", categoryForm.alaCarte ? "bg-primary" : "bg-foreground/20")}
                                >
                                    <span className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow", categoryForm.alaCarte ? "left-7" : "left-1")} />
                                </button>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Lógica de Pedido (Delivery)</label>
                                <select
                                    value={categoryForm.selectionTarget}
                                    onChange={e => setCategoryForm({ ...categoryForm, selectionTarget: e.target.value as any })}
                                    className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground appearance-none"
                                >
                                    <option value="individual">Individual (Cada hóspede escolhe o seu, ex: Tapioca)</option>
                                    <option value="group_portion">Por Grupo - Porção (Ex: Café na garrafa. Pergunta quantos do grupo querem)</option>
                                    <option value="group_unit">Por Grupo - Unidades (Ex: Pães. Pergunta escolha livre no limite total do grupo)</option>
                                </select>
                            </div>
                            {(categoryForm.selectionTarget === 'individual' || categoryForm.alaCarte) && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Nº Máximo de itens (Por hóspede)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={categoryForm.maxPerGuest}
                                        onChange={e => setCategoryForm({ ...categoryForm, maxPerGuest: parseInt(e.target.value) || 1 })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground"
                                    />
                                    <p className="text-xs text-muted-foreground">O Hóspede será perguntado individualmente e só poderá escolher essa quantidade exata.</p>
                                </div>
                            )}
                            {categoryForm.selectionTarget === 'group_unit' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Nº Máximo de intens (Por hóspede no total da cabana)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={categoryForm.maxPerGuest}
                                        onChange={e => setCategoryForm({ ...categoryForm, maxPerGuest: parseInt(e.target.value) || 1 })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground"
                                    />
                                    <p className="text-xs text-muted-foreground">Ex: Se a cabana tem 2 pessoas e limíte é 2, eles poderão colocar 4 itens desta categoria no total, de forma livre.</p>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-border flex justify-end gap-3 bg-secondary/30">
                            <button onClick={() => setIsCategoryModalOpen(false)} className="px-6 py-3 font-bold text-xs uppercase rounded-xl hover:bg-secondary">Cancelar</button>
                            <button onClick={saveCategory} disabled={saving || !categoryForm.name} className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase uppercase rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL ITEM */}
            {isItemModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[32px] overflow-hidden shadow-2xl scale-in-center">
                        <div className="p-6 flex justify-between items-center border-b border-border shrink-0">
                            <h2 className="text-xl font-black">{editingItem ? "Editar Item" : "Novo Item"}</h2>
                            <button onClick={() => setIsItemModalOpen(false)} className="p-2 hover:bg-secondary rounded-full"><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Nome do Produto</label>
                                    {/* Language tabs */}
                                    <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-2">
                                        {(['pt', 'en', 'es'] as const).map(l => (
                                            <button key={l} type="button"
                                                onClick={() => setFormLangTab(l)}
                                                className={cn("px-3 py-1 text-xs font-bold uppercase rounded-md transition-all",
                                                    formLangTab === l ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
                                            >{l}</button>
                                        ))}
                                    </div>
                                    {formLangTab === 'pt' && (
                                        <input value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})}
                                            className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-primary/50"
                                            placeholder="Ex: Hambúrguer Artesanal" />
                                    )}
                                    {formLangTab === 'en' && (
                                        <input value={itemForm.name_en || ""} onChange={e => setItemForm({...itemForm, name_en: e.target.value})}
                                            className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-blue-500/50"
                                            placeholder="Ex: Artisan Burger" />
                                    )}
                                    {formLangTab === 'es' && (
                                        <input value={itemForm.name_es || ""} onChange={e => setItemForm({...itemForm, name_es: e.target.value})}
                                            className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-orange-500/50"
                                            placeholder="Ex: Hamburguesa Artesanal" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Categoria</label>
                                    <select
                                        value={itemForm.categoryId}
                                        onChange={e => setItemForm({ ...itemForm, categoryId: e.target.value })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground appearance-none"
                                    >
                                        <option value="" disabled>Selecione...</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Imagem do Prato (Opcional)</label>
                                    <div className="h-40 rounded-xl border border-border overflow-hidden bg-secondary">
                                        <ImageUpload
                                            value={itemForm.imageUrl}
                                            onUploadSuccess={url => setItemForm({ ...itemForm, imageUrl: url })}
                                            path="fb_images"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Preço de Venda (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={itemForm.price}
                                        onChange={e => setItemForm({ ...itemForm, price: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground font-mono text-lg"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Descrição / Composição</label>
                                    {formLangTab === 'pt' && (
                                        <input value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})}
                                            className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-primary/50"
                                            placeholder="Ex: Pão brioche, blend 180g, queijo prato..." />
                                    )}
                                    {formLangTab === 'en' && (
                                        <input value={itemForm.description_en || ""} onChange={e => setItemForm({...itemForm, description_en: e.target.value})}
                                            className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-blue-500/50"
                                            placeholder="Ex: Brioche bun, 180g blend, cheddar cheese..." />
                                    )}
                                    {formLangTab === 'es' && (
                                        <input value={itemForm.description_es || ""} onChange={e => setItemForm({...itemForm, description_es: e.target.value})}
                                            className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-orange-500/50"
                                            placeholder="Ex: Pan brioche, mezcla 180g, queso cheddar..." />
                                    )}
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="flex items-center gap-3 p-4 bg-background border border-border rounded-xl cursor-pointer hover:bg-secondary/50">
                                        <input
                                            type="checkbox"
                                            checked={itemForm.active}
                                            onChange={e => setItemForm({ ...itemForm, active: e.target.checked })}
                                            className="w-5 h-5 accent-primary cursor-pointer"
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-foreground">Disponível no Cardápio</span>
                                            <span className="text-xs text-muted-foreground">Desmarque caso o produto esteja em falta.</span>
                                        </div>
                                    </label>
                                </div>

                                {/* FLAVORS / OPTIONS */}
                                <div className="md:col-span-2 space-y-2 border-t border-border pt-4">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Sabores ou Variações Extras</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={tempFlavor.name}
                                            onChange={e => setTempFlavor({ ...tempFlavor, name: e.target.value })}
                                            onKeyDown={e => e.key === 'Enter' && addFlavor()}
                                            className="flex-1 bg-background border border-border p-3 rounded-xl outline-none focus:border-primary/50 text-foreground"
                                            placeholder="Ex: Frango, Queijo, Sem Sal..."
                                        />
                                        <button onClick={addFlavor} disabled={!tempFlavor.name} className="p-3 bg-secondary rounded-xl text-primary font-bold hover:bg-primary/10 transition-colors">Adicionar</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <input value={tempFlavor.name_en || ""} onChange={e => setTempFlavor({...tempFlavor, name_en: e.target.value})}
                                            placeholder="Nome (EN)" className="bg-secondary border border-border p-2 rounded-lg text-xs outline-none" />
                                        <input value={tempFlavor.name_es || ""} onChange={e => setTempFlavor({...tempFlavor, name_es: e.target.value})}
                                            placeholder="Nombre (ES)" className="bg-secondary border border-border p-2 rounded-lg text-xs outline-none" />
                                    </div>
                                    {itemForm.flavors.length > 0 && (
                                        <div className="flex flex-col gap-2 mt-4">
                                            {itemForm.flavors.map((flavor, idx) => (
                                                <div key={idx} className="bg-secondary/30 rounded-xl border border-border p-3 overflow-hidden">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-bold">{flavor.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => setEditingFlavorIndex(editingFlavorIndex === idx ? null : idx)}
                                                                className={cn("text-xs font-bold uppercase tracking-widest px-2 py-1 rounded", editingFlavorIndex === idx ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary")}
                                                            >
                                                                Detalhes {(flavor.ingredients?.length || 0) > 0 && `(${flavor.ingredients?.length})`}
                                                            </button>
                                                            <button onClick={() => removeFlavor(idx)} className="p-1 text-red-500 hover:text-red-400 bg-red-500/10 rounded"><Trash2 size={16} /></button>
                                                        </div>
                                                    </div>

                                                    {editingFlavorIndex === idx && (
                                                        <div className="mt-4 pt-4 border-t border-border space-y-4">
                                                            {/* Imagem do sabor */}
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Imagem do Sabor (Opcional - Substitui a do Item)</label>
                                                                <div className="h-32 w-full rounded-xl border border-border overflow-hidden bg-background">
                                                                    <ImageUpload
                                                                        value={flavor.imageUrl}
                                                                        onUploadSuccess={url => {
                                                                            setItemForm(prev => {
                                                                                const nf = [...prev.flavors];
                                                                                nf[idx].imageUrl = url;
                                                                                return { ...prev, flavors: nf };
                                                                            });
                                                                        }}
                                                                        path="fb_images"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Ingredientes */}
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest block mb-2">Ingredientes Específicos do Sabor</label>
                                                                <div className="flex gap-2 mb-2">
                                                                    <input
                                                                        placeholder="Ingrediente do Sabor"
                                                                        value={tempFlavorIngredient.name}
                                                                        onChange={e => setTempFlavorIngredient({ ...tempFlavorIngredient, name: e.target.value })}
                                                                        className="flex-1 bg-background border border-border p-2 rounded-lg outline-none text-sm"
                                                                    />
                                                                    <input
                                                                        type="number" step="0.01" min="0"
                                                                        placeholder="R$"
                                                                        value={tempFlavorIngredient.cost || ""}
                                                                        onChange={e => setTempFlavorIngredient({ ...tempFlavorIngredient, cost: parseFloat(e.target.value) || 0 })}
                                                                        className="w-20 bg-background border border-border p-2 rounded-lg outline-none text-sm font-mono"
                                                                    />
                                                                    <button onClick={addFlavorIngredient} disabled={!tempFlavorIngredient.name} className="bg-primary text-primary-foreground p-2 rounded-lg flex items-center justify-center">
                                                                        <Plus size={16} />
                                                                    </button>
                                                                </div>
                                                                {flavor.ingredients && flavor.ingredients.length > 0 && (
                                                                    <div className="space-y-1 mt-2">
                                                                        {flavor.ingredients.map((ing, iIdx) => (
                                                                            <div key={iIdx} className="flex items-center justify-between bg-background border border-border py-1 px-2 rounded text-xs">
                                                                                <span>{ing.name}</span>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-muted-foreground text-[10px] font-mono">Custo: R$ {ing.cost.toFixed(2)}</span>
                                                                                    <button onClick={() => removeFlavorIngredient(idx, iIdx)} className="text-red-500"><X size={12} /></button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Ficha Técnica (Ingredientes / CMV) */}
                            <div className="bg-secondary/30 border border-border p-6 rounded-2xl space-y-4">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-sm">Ficha Técnica Experimental (Ingredientes)</h3>
                                    <span title="Adicione os ingredientes e seus custos para cálculo futuro de CMV">
                                        <Info size={14} className="text-muted-foreground" />
                                    </span>
                                </div>

                                <div className="flex flex-col md:flex-row gap-2">
                                    <input
                                        placeholder="Ingrediente (ex: Pão Briohe)"
                                        value={tempIngredient.name}
                                        onChange={e => setTempIngredient({ ...tempIngredient, name: e.target.value })}
                                        className="flex-1 bg-background border border-border p-3 rounded-xl outline-none focus:border-primary/50 text-sm"
                                    />
                                    <input
                                        type="number" step="0.01" min="0"
                                        placeholder="Custo Estimado (R$)"
                                        value={tempIngredient.cost || ""}
                                        onChange={e => setTempIngredient({ ...tempIngredient, cost: parseFloat(e.target.value) || 0 })}
                                        className="w-32 bg-background border border-border p-3 rounded-xl outline-none focus:border-primary/50 text-sm font-mono"
                                    />
                                    <input
                                        placeholder="Qtd (Ex: 1 un, 50g)"
                                        value={tempIngredient.quantity}
                                        onChange={e => setTempIngredient({ ...tempIngredient, quantity: e.target.value })}
                                        className="w-32 bg-background border border-border p-3 rounded-xl outline-none focus:border-primary/50 text-sm"
                                    />
                                    <button
                                        onClick={addTempIngredient}
                                        disabled={!tempIngredient.name}
                                        className="bg-primary text-primary-foreground p-3 rounded-xl font-bold disabled:opacity-50"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>

                                {itemForm.ingredients.length > 0 && (
                                    <div className="border border-border rounded-xl bg-background overflow-hidden mt-4">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-secondary/50 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">
                                                <tr>
                                                    <th className="p-3">Ingrediente</th>
                                                    <th className="p-3">Qtd.</th>
                                                    <th className="p-3 text-right">Custo Estimado</th>
                                                    <th className="p-3 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/50 font-medium">
                                                {itemForm.ingredients.map((ing, idx) => (
                                                    <tr key={idx} className="hover:bg-secondary/30">
                                                        <td className="p-3">{ing.name}</td>
                                                        <td className="p-3 text-muted-foreground">{ing.quantity || "-"}</td>
                                                        <td className="p-3 text-right font-mono text-red-500/80">R$ {ing.cost.toFixed(2)}</td>
                                                        <td className="p-3 text-center">
                                                            <button onClick={() => removeIngredient(idx)} className="text-red-500 hover:text-red-400"><Trash2 size={14} /></button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-secondary/30 font-bold">
                                                    <td colSpan={2} className="p-3 text-right">Custo Total (CMV Est.):</td>
                                                    <td className="p-3 text-right font-mono text-red-500">
                                                        R$ {itemForm.ingredients.reduce((acc, ing) => acc + (ing.cost || 0), 0).toFixed(2)}
                                                    </td>
                                                    <td></td>
                                                </tr>
                                                <tr className="bg-primary/5 font-black">
                                                    <td colSpan={2} className="p-3 text-right text-primary">Margem Bruta (Estimada):</td>
                                                    <td className="p-3 text-right font-mono text-primary">
                                                        {itemForm.price > 0 ? (
                                                            (((itemForm.price - itemForm.ingredients.reduce((acc, ing) => acc + (ing.cost || 0), 0)) / itemForm.price) * 100).toFixed(1) + "%"
                                                        ) : "-"}
                                                    </td>
                                                    <td></td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-border flex justify-end gap-3 bg-secondary/30 shrink-0">
                            <button onClick={() => setIsItemModalOpen(false)} className="px-6 py-3 font-bold text-xs uppercase rounded-xl hover:bg-secondary">Cancelar</button>
                            <button onClick={saveItem} disabled={saving || !itemForm.name || !itemForm.categoryId} className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase uppercase rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar Produto
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL SETTINGS */}
            {isSettingsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-xl flex flex-col max-h-[90vh] rounded-[32px] overflow-hidden shadow-2xl scale-in-center">
                        <div className="p-6 flex justify-between items-center border-b border-border shrink-0">
                            <h2 className="text-xl font-black">Configurações (Dashboard Hóspede)</h2>
                            <button onClick={() => setIsSettingsModalOpen(false)} className="p-2 hover:bg-secondary rounded-full"><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                            {/* Language tabs */}
                            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-2">
                                {(['pt', 'en', 'es'] as const).map(l => (
                                    <button key={l} type="button"
                                        onClick={() => setFormLangTab(l)}
                                        className={cn("px-3 py-1 text-xs font-bold uppercase rounded-md transition-all",
                                            formLangTab === l ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
                                    >{l}</button>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Mensagem de Boas Vindas (Delivery Cesta)</label>
                                {formLangTab === 'pt' && (
                                    <textarea value={settingsForm.welcomeMessage} onChange={e => setSettingsForm({ ...settingsForm, welcomeMessage: e.target.value })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground min-h-[100px]" placeholder="Ex: Bom dia! Que tal montar sua cesta perfeita para amanhã?" />
                                )}
                                {formLangTab === 'en' && (
                                    <textarea value={settingsForm.welcomeMessage_en} onChange={e => setSettingsForm({ ...settingsForm, welcomeMessage_en: e.target.value })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-blue-500/50 text-foreground min-h-[100px]" placeholder="Ex: Good morning! Let's build your perfect basket for tomorrow?" />
                                )}
                                {formLangTab === 'es' && (
                                    <textarea value={settingsForm.welcomeMessage_es} onChange={e => setSettingsForm({ ...settingsForm, welcomeMessage_es: e.target.value })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-orange-500/50 text-foreground min-h-[100px]" placeholder="Ex: ¡Buenos días! ¿Qué tal armar tu canasta perfecta para mañana?" />
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Instruções Passo-a-Passo</label>
                                {formLangTab === 'pt' && (
                                    <textarea value={settingsForm.instructions} onChange={e => setSettingsForm({ ...settingsForm, instructions: e.target.value })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground min-h-[100px]" placeholder="Instruções na tela do pedido..." />
                                )}
                                {formLangTab === 'en' && (
                                    <textarea value={settingsForm.instructions_en} onChange={e => setSettingsForm({ ...settingsForm, instructions_en: e.target.value })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-blue-500/50 text-foreground min-h-[100px]" placeholder="Instructions on the order screen..." />
                                )}
                                {formLangTab === 'es' && (
                                    <textarea value={settingsForm.instructions_es} onChange={e => setSettingsForm({ ...settingsForm, instructions_es: e.target.value })}
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-orange-500/50 text-foreground min-h-[100px]" placeholder="Instrucciones en la pantalla de pedidos..." />
                                )}
                            </div>
                        </div>
                        <div className="p-6 border-t border-border flex justify-end gap-3 bg-secondary/30">
                            <button onClick={() => setIsSettingsModalOpen(false)} className="px-6 py-3 font-bold text-xs uppercase rounded-xl hover:bg-secondary">Cancelar</button>
                            <button onClick={saveSettings} disabled={saving} className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase uppercase rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar Configurações
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
