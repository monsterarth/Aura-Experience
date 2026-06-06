import React, { useState, useEffect } from "react";
import { X, Save, Clock, Users, Activity, ImagePlus, Trash2, Plus, Calendar, Bot, MapPin, Globe } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StructureService } from "@/services/structure-service";
import { AutomationService } from "@/services/automation-service";
import { Structure, MessageTemplate } from "@/types/aura";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

interface StructureEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    structure: Structure | null;
    onSaved: () => void;
}

const IS_24H = (open?: string, close?: string) =>
    open === "00:00" && (close === "23:59" || close === "00:00");

export function StructureEditModal({ isOpen, onClose, structure, onSaved }: StructureEditModalProps) {
    const { userData } = useAuth();
    const { currentProperty } = useProperty();
    const [loading, setLoading] = useState(false);

    const defaultForm: Partial<Structure> = {
        name: "",
        category: "leisure",
        description: "",
        visibility: "admin_only",
        capacity: 2,
        status: "available",
        bookingType: "fixed_slots",
        units: [],
        requiresTurnover: false,
        operatingHours: { openTime: "08:00", closeTime: "20:00", slotDurationMinutes: 60, slotIntervalMinutes: 15 },
    };

    const [formData, setFormData] = useState<Partial<Structure>>(defaultForm);
    const [is24h, setIs24h] = useState(false);

    useEffect(() => {
        const data = structure ?? defaultForm;
        setFormData(data);
        setIs24h(IS_24H(data.operatingHours?.openTime, data.operatingHours?.closeTime));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [structure, isOpen]);

    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    useEffect(() => {
        if (currentProperty?.id && isOpen) AutomationService.getTemplates(currentProperty.id).then(setTemplates);
    }, [currentProperty?.id, isOpen]);

    if (!isOpen || !currentProperty) return null;

    const isMapOnly = formData.visibility === "map_only";
    const isBookable = !isMapOnly;

    const handle24hToggle = (checked: boolean) => {
        setIs24h(checked);
        if (checked) {
            setFormData(p => ({ ...p, operatingHours: { ...(p.operatingHours ?? { slotDurationMinutes: 60, slotIntervalMinutes: 15 }), openTime: "00:00", closeTime: "23:59" } }));
        } else {
            setFormData(p => ({ ...p, operatingHours: { ...(p.operatingHours ?? { slotDurationMinutes: 60, slotIntervalMinutes: 15 }), openTime: "08:00", closeTime: "20:00" } }));
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, unitId?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const uploadData = new FormData();
            uploadData.append("file", file);
            const response = await fetch("/api/upload", { method: "POST", body: uploadData });
            if (!response.ok) { const err = await response.json().catch(() => null); throw new Error(err?.error || "Upload failed"); }
            const data = await response.json();
            if (unitId) setFormData(p => ({ ...p, units: p.units?.map(u => u.id === unitId ? { ...u, imageUrl: data.url } : u) }));
            else setFormData(p => ({ ...p, imageUrl: data.url }));
            toast.success("Imagem anexada com sucesso!");
        } catch (error) { console.error(error); toast.error("Falha ao anexar imagem."); }
        finally { setLoading(false); if (e.target) e.target.value = ""; }
    };

    const addUnit = () => setFormData(p => ({ ...p, units: [...(p.units || []), { id: uuidv4(), name: `Unidade ${(p.units?.length || 0) + 1}` }] }));
    const removeUnit = (id: string) => setFormData(p => ({ ...p, units: p.units?.filter(u => u.id !== id) }));
    const updateUnitName = (id: string, name: string) => setFormData(p => ({ ...p, units: p.units?.map(u => u.id === id ? { ...u, name } : u) }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData) return;
        setLoading(true);
        try {
            if (structure) {
                const editableKeys = [
                    "name", "name_en", "name_es", "category",
                    "description", "description_en", "description_es",
                    "visibility", "capacity", "status",
                    "bookingType", "units", "requiresTurnover", "requiresDailyRelease", "operatingHours",
                    "imageUrl", "housekeepingChecklist",
                    "messageTemplatePendingId", "messageTemplateConfirmedId", "messageTemplateCancelledId",
                ];
                const payload: Record<string, any> = {};
                for (const key of editableKeys) { if ((formData as any)[key] !== undefined) payload[key] = (formData as any)[key]; }
                await StructureService.updateStructure(currentProperty.id, structure.id, payload, userData.id, userData.fullName);
                toast.success("Estrutura atualizada!");
            } else {
                await StructureService.createStructure(currentProperty.id, formData as Omit<Structure, "id" | "createdAt">, userData.id, userData.fullName);
                toast.success("Estrutura criada!");
            }
            onSaved(); onClose();
        } catch (error) { console.error(error); toast.error("Erro ao salvar estrutura."); }
        finally { setLoading(false); }
    };

    const handleOperatingHoursChange = (field: string, value: any) =>
        setFormData(p => ({ ...p, operatingHours: { ...p.operatingHours!, [field]: value } }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-card w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-border animate-in zoom-in-95 duration-300">

                <header className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">{structure ? "Editar Estrutura" : "Nova Estrutura"}</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {isMapOnly ? "Local informativo — aparece no mapa sem agendamento." : "Configure as regras de operação e agendamentos."}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-xl transition-all"><X size={20} /></button>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
                    <form id="structureForm" onSubmit={handleSubmit} className="space-y-8">

                        {/* ── Informações Básicas ──────────────────────────── */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest border-b border-border pb-2">Informações Básicas</h3>
                            <div className="flex gap-6 items-start">
                                <div className="shrink-0">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Foto Principal</label>
                                    <div className="relative group w-32 h-32 rounded-2xl border-2 border-dashed border-border flex items-center justify-center bg-secondary/30 overflow-hidden hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer">
                                        {formData.imageUrl ? <img src={formData.imageUrl} alt="Structure" className="w-full h-full object-cover" /> : <ImagePlus className="text-muted-foreground group-hover:text-primary transition-colors" size={24} />}
                                        <input type="file" accept="image/*" onChange={e => handleImageUpload(e)} className="absolute inset-0 opacity-0 cursor-pointer z-10" disabled={loading} />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"><span className="text-white text-xs font-bold uppercase">Alterar</span></div>
                                    </div>
                                </div>

                                <div className="flex-1 grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Nome</label>
                                        <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground" placeholder="Ex: Restaurante Principal" />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Descrição {isMapOnly ? "(visível ao hóspede no mapa)" : "(Portal Hóspede)"}</label>
                                        <textarea value={formData.description ?? ""} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground min-h-[80px]" placeholder={isMapOnly ? "Descreva o local, o que oferece, como chegar…" : "Descreva os equipamentos, regras e detalhes visíveis ao hóspede."} />
                                    </div>

                                    {/* Traduções (i18n inline) — opcionais; vazio cai no PT */}
                                    <div className="col-span-2">
                                        <details className="group rounded-xl border border-border bg-background/50">
                                            <summary className="flex items-center gap-2 cursor-pointer select-none p-3 text-[10px] font-bold uppercase text-muted-foreground">
                                                <Globe size={12} /> Traduções (EN / ES) — opcional
                                            </summary>
                                            <div className="p-3 pt-0 space-y-4">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Nome (EN)</label>
                                                        <input value={formData.name_en ?? ""} onChange={e => setFormData({ ...formData, name_en: e.target.value })} className="w-full bg-background border border-border p-2.5 rounded-xl text-sm outline-none focus:border-primary text-foreground" placeholder="e.g. Main Restaurant" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Nome (ES)</label>
                                                        <input value={formData.name_es ?? ""} onChange={e => setFormData({ ...formData, name_es: e.target.value })} className="w-full bg-background border border-border p-2.5 rounded-xl text-sm outline-none focus:border-primary text-foreground" placeholder="ej. Restaurante Principal" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Descrição (EN)</label>
                                                    <textarea value={formData.description_en ?? ""} onChange={e => setFormData({ ...formData, description_en: e.target.value })} className="w-full bg-background border border-border p-2.5 rounded-xl text-sm outline-none focus:border-primary text-foreground min-h-[60px]" placeholder="English description…" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Descrição (ES)</label>
                                                    <textarea value={formData.description_es ?? ""} onChange={e => setFormData({ ...formData, description_es: e.target.value })} className="w-full bg-background border border-border p-2.5 rounded-xl text-sm outline-none focus:border-primary text-foreground min-h-[60px]" placeholder="Descripción en español…" />
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1.5"><Activity size={12} /> Categoria</label>
                                    <select required value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground appearance-none">
                                        <optgroup label="Espaços Agendáveis">
                                            <option value="leisure">Lazer e Recreação</option>
                                            <option value="spa">Spa e Bem Estar</option>
                                            <option value="sport">Quadras Esportivas</option>
                                            <option value="service">Serviços Extras</option>
                                        </optgroup>
                                        <optgroup label="Locais Informativos">
                                            <option value="alimentacao">Alimentação e Bebidas</option>
                                            <option value="natureza">Natureza e Lazer</option>
                                            <option value="comodidade">Comodidades</option>
                                            <option value="acesso">Acesso e Segurança</option>
                                        </optgroup>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1.5"><Users size={12} /> Lotação Máx. <span className="text-muted-foreground/50 font-normal normal-case">(opcional)</span></label>
                                    <input
                                        type="number" min="0"
                                        value={formData.capacity ?? ""}
                                        onChange={e => setFormData({ ...formData, capacity: Number(e.target.value) })}
                                        className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground"
                                        placeholder="0 = não exibir"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ── Visibilidade / Tipo ─────────────────────────── */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest border-b border-border pb-2">Regras de Negócio</h3>
                            <div className="bg-secondary/40 p-4 border border-border rounded-2xl">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1.5">Tipo de acesso</label>
                                <select required value={formData.visibility} onChange={e => setFormData({ ...formData, visibility: e.target.value as any })} className="w-full bg-background border border-border p-3 rounded-xl text-sm font-bold text-foreground mt-2 outline-none focus:border-primary appearance-none">
                                    <option value="admin_only">Apenas Recepção Agenda (hóspede não vê no portal)</option>
                                    <option value="guest_request">Hóspede Solicita — Recepção Aprova</option>
                                    <option value="guest_auto_approve">Hóspede Reserva Automaticamente</option>
                                    <option value="map_only">Apenas no Mapa — Informativo (sem agendamento)</option>
                                </select>
                                {isMapOnly && (
                                    <p className="text-xs text-primary mt-2 flex items-center gap-1.5">
                                        <MapPin size={12} /> Aparece no mapa do hóspede com foto, descrição e horário. Sem fluxo de reserva.
                                    </p>
                                )}
                            </div>

                            {/* Turnover / checklist — visível para TODOS os tipos (governanta precisa) */}
                            <label className="flex items-center gap-3 p-4 bg-secondary/40 border border-border rounded-2xl cursor-pointer hover:bg-secondary/60 transition-colors">
                                <input type="checkbox" checked={formData.requiresTurnover ?? false} onChange={e => setFormData({ ...formData, requiresTurnover: e.target.checked })} className="w-5 h-5 accent-primary rounded cursor-pointer" />
                                <div>
                                    <div className="font-bold text-sm text-foreground">
                                        {isMapOnly ? "Gera Tarefa de Limpeza" : "Exige Limpeza (Turnover) Pós Uso"}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {isMapOnly
                                            ? "Gera tarefa de limpeza periódica no módulo de governança."
                                            : "Ao finalizar uma reserva, dispara uma tarefa de limpeza no módulo de governança."}
                                    </p>
                                </div>
                            </label>

                            {/* Liberação diária — só faz sentido para estruturas agendáveis */}
                            {!isMapOnly && (
                                <label className="flex items-center gap-3 p-4 bg-secondary/40 border border-border rounded-2xl cursor-pointer hover:bg-secondary/60 transition-colors">
                                    <input type="checkbox" checked={formData.requiresDailyRelease ?? false} onChange={e => setFormData({ ...formData, requiresDailyRelease: e.target.checked })} className="w-5 h-5 accent-primary rounded cursor-pointer" />
                                    <div>
                                        <div className="font-bold text-sm text-foreground">Exige Liberação Diária</div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Fica bloqueada para o hóspede todo dia (ex: jacuzzi a limpar/aquecer) até a recepção liberar na Agenda de Estruturas. Reseta sozinha à meia-noite.
                                        </p>
                                    </div>
                                </label>
                            )}

                            {formData.requiresTurnover && (
                                <div className="space-y-4 pt-4 border-t border-border mt-2">
                                    <div className="flex justify-between items-center bg-secondary/20 p-4 border border-border rounded-2xl">
                                        <div>
                                            <h4 className="text-sm font-bold text-foreground">Procedimentos de Limpeza</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">Itens que a camareira deve verificar ao limpar este local.</p>
                                        </div>
                                        <button type="button" onClick={() => setFormData(p => ({ ...p, housekeepingChecklist: [...(p.housekeepingChecklist || []), { id: uuidv4(), label: "" }] }))} className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-bold text-xs uppercase rounded-xl transition-all flex items-center gap-1.5 shrink-0">
                                            <Plus size={16} /> Detalhar Processo
                                        </button>
                                    </div>
                                    <div className="space-y-2 mt-2">
                                        {formData.housekeepingChecklist?.map(item => (
                                            <div key={item.id} className="flex gap-2 items-center group">
                                                <input required value={item.label} onChange={e => setFormData(p => ({ ...p, housekeepingChecklist: p.housekeepingChecklist?.map(i => i.id === item.id ? { ...i, label: e.target.value } : i) }))} className="flex-1 bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground ml-4" placeholder="Ex: Higienizar mesas e cadeiras…" />
                                                <button type="button" onClick={() => setFormData(p => ({ ...p, housekeepingChecklist: p.housekeepingChecklist?.filter(i => i.id !== item.id) }))} className="p-3 text-muted-foreground hover:bg-red-500 hover:border-red-500 hover:text-white border border-transparent rounded-xl transition-colors shrink-0 opacity-50 group-hover:opacity-100"><Trash2 size={16} /></button>
                                            </div>
                                        ))}
                                        {(!formData.housekeepingChecklist || formData.housekeepingChecklist.length === 0) && (
                                            <p className="text-xs text-muted-foreground text-center italic py-4">Nenhum procedimento cadastrado. A camareira deverá realizar a limpeza livremente.</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Horário de funcionamento ─────────────────────── */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest border-b border-border pb-2 flex items-center gap-2">
                                <Clock size={14} /> {isMapOnly ? "Horário de Funcionamento" : "Regras de Tempo & Agenda"}
                                {isMapOnly && <span className="text-muted-foreground/50 font-normal normal-case tracking-normal ml-1">(opcional)</span>}
                            </h3>

                            {/* Tipo de agendamento — apenas para bookable */}
                            {isBookable && (
                                <>
                                    <div className="flex bg-secondary p-1 rounded-xl">
                                        <button type="button" onClick={() => setFormData({ ...formData, bookingType: "fixed_slots" })} className={cn("flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all", formData.bookingType === "fixed_slots" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>Slots Fixos</button>
                                        <button type="button" onClick={() => setFormData({ ...formData, bookingType: "free_time" })} className={cn("flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2", formData.bookingType === "free_time" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>
                                            Tempo Livre <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[8px] rounded-sm">Flexível</span>
                                        </button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {formData.bookingType === "fixed_slots" ? "Os horários disponíveis serão gerados dinamicamente dividindo a janela de operação pela duração do uso e o intervalo de limpeza." : "O hóspede ou admin poderá escolher livremente a hora de início e término, dentro da janela de operação."}
                                    </p>
                                </>
                            )}

                            {/* Toggle 24h + inputs de horário */}
                            <div className="bg-secondary/20 p-4 border border-border rounded-2xl space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={is24h} onChange={e => handle24hToggle(e.target.checked)} className="w-4 h-4 accent-primary rounded cursor-pointer" />
                                    <span className="text-sm font-bold text-foreground">Aberto 24 horas</span>
                                </label>

                                {!is24h && (
                                    <div className="grid grid-cols-2 gap-4 pt-1">
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Abre às</label>
                                            <input type="time" value={formData.operatingHours?.openTime ?? ""} onChange={e => handleOperatingHoursChange("openTime", e.target.value)} className="w-full bg-background border border-border p-3 rounded-xl text-sm font-mono text-center outline-none focus:border-primary text-foreground" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Fecha às</label>
                                            <input type="time" value={formData.operatingHours?.closeTime ?? ""} onChange={e => handleOperatingHoursChange("closeTime", e.target.value)} className="w-full bg-background border border-border p-3 rounded-xl text-sm font-mono text-center outline-none focus:border-primary text-foreground" />
                                        </div>
                                    </div>
                                )}

                                {/* Slots — apenas para fixed_slots bookable */}
                                {isBookable && !is24h && formData.bookingType === "fixed_slots" && (
                                    <div className="grid grid-cols-2 gap-4 pt-1">
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Duração do Uso (min)</label>
                                            <input type="number" step="5" min="5" required value={formData.operatingHours?.slotDurationMinutes ?? ""} onChange={e => handleOperatingHoursChange("slotDurationMinutes", Number(e.target.value))} className="w-full bg-background border border-border p-3 rounded-xl text-sm text-center outline-none focus:border-primary text-foreground font-mono" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Intervalo / Preparação (min)</label>
                                            <input type="number" step="5" min="0" required value={formData.operatingHours?.slotIntervalMinutes ?? ""} onChange={e => handleOperatingHoursChange("slotIntervalMinutes", Number(e.target.value))} className="w-full bg-background border border-border p-3 rounded-xl text-sm text-center outline-none focus:border-primary text-foreground font-mono" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Múltiplas Unidades — apenas bookable ─────────── */}
                        {isBookable && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-border pb-2">
                                    <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest flex items-center gap-2"><Calendar size={14} /> Múltiplas Unidades</h3>
                                    <button type="button" onClick={addUnit} className="text-[10px] font-bold uppercase text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md transition-colors"><Plus size={12} /> Adicionar</button>
                                </div>
                                <p className="text-xs text-muted-foreground mb-4">Se esta estrutura possui mais de um espaço físico que pode ser agendado simultaneamente (ex: Sala de Massagem 1, Sala de Massagem 2), adicione-os aqui.</p>
                                {formData.units && formData.units.length > 0 && (
                                    <div className="space-y-3">
                                        {formData.units.map(unit => (
                                            <div key={unit.id} className="flex gap-4 items-center bg-secondary/30 p-3 rounded-xl border border-border">
                                                <div className="relative group w-12 h-12 shrink-0 rounded-lg border border-dashed border-border flex items-center justify-center bg-background overflow-hidden hover:border-primary/50 cursor-pointer">
                                                    {unit.imageUrl ? <img src={unit.imageUrl} alt={unit.name} className="w-full h-full object-cover" /> : <ImagePlus className="text-muted-foreground group-hover:text-primary transition-colors" size={14} />}
                                                    <input type="file" accept="image/*" onChange={e => handleImageUpload(e, unit.id)} className="absolute inset-0 opacity-0 cursor-pointer z-10" disabled={loading} title="Anexar foto" />
                                                </div>
                                                <div className="flex-1">
                                                    <input type="text" value={unit.name} onChange={e => updateUnitName(unit.id, e.target.value)} className="w-full bg-transparent border-none p-0 text-sm font-bold text-foreground focus:ring-0 outline-none placeholder:font-normal" placeholder="Nome da Unidade…" />
                                                </div>
                                                <button type="button" onClick={() => removeUnit(unit.id)} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Automações WhatsApp — apenas bookable ─────────── */}
                        {isBookable && (
                            <div className="space-y-4">
                                <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest border-b border-border pb-2 flex items-center gap-2"><Bot size={14} /> Automações de Agendamento</h3>
                                <p className="text-xs text-muted-foreground mb-4">Personalize as mensagens disparadas automaticamente no WhatsApp do hóspede referente a esta estrutura.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-secondary/20 p-4 border border-border rounded-xl">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Mensagem: Solicitação Recebida</label>
                                        <p className="text-[10px] text-muted-foreground mb-3 leading-tight">Dispara assim que o hóspede solicita (reserva pendente).</p>
                                        <select value={formData.messageTemplatePendingId || ""} onChange={e => setFormData({ ...formData, messageTemplatePendingId: e.target.value })} className="w-full bg-background border border-border p-2.5 rounded-lg text-sm outline-none focus:border-primary text-foreground">
                                            <option value="">Nenhuma (Não enviar)</option>
                                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="bg-secondary/20 p-4 border border-border rounded-xl">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Mensagem: Confirmada</label>
                                        <p className="text-[10px] text-muted-foreground mb-3 leading-tight">Dispara quando a recepção aprova o agendamento.</p>
                                        <select value={formData.messageTemplateConfirmedId || ""} onChange={e => setFormData({ ...formData, messageTemplateConfirmedId: e.target.value })} className="w-full bg-background border border-border p-2.5 rounded-lg text-sm outline-none focus:border-primary text-foreground">
                                            <option value="">Nenhuma (Não enviar)</option>
                                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="bg-red-500/5 p-4 border border-red-500/20 rounded-xl">
                                        <label className="text-[10px] font-bold uppercase text-red-500/80 mb-1 block">Mensagem: Cancelamento</label>
                                        <p className="text-[10px] text-muted-foreground mb-3 leading-tight">Dispara quando a recepção cancela. Use {"{{cancellation_reason}}"} para o motivo.</p>
                                        <select value={formData.messageTemplateCancelledId || ""} onChange={e => setFormData({ ...formData, messageTemplateCancelledId: e.target.value })} className="w-full bg-background border border-red-500/20 p-2.5 rounded-lg text-sm outline-none focus:border-red-500 text-foreground">
                                            <option value="">Nenhuma (Não enviar)</option>
                                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                    </form>
                </div>

                <footer className="p-4 border-t border-border bg-secondary/30 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 hover:bg-accent rounded-xl text-muted-foreground font-bold text-xs uppercase tracking-wider transition-all">Cancelar</button>
                    <button type="submit" form="structureForm" disabled={loading} className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl text-xs uppercase tracking-wider hover:opacity-90 transition-all flex items-center gap-2">
                        {loading ? "Salvando…" : <><Save size={16} /> Salvar Estrutura</>}
                    </button>
                </footer>
            </div>
        </div>
    );
}
