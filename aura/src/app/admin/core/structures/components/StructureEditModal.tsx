import React, { useState, useEffect, useRef } from "react";
import { X, Save, Clock, Users, Activity, ImagePlus, Trash2, Plus, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StructureService } from "@/services/structure-service";
import { Structure } from "@/types/aura";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

interface StructureEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    structure: Structure | null; // null if creating new
    onSaved: () => void;
}

export function StructureEditModal({ isOpen, onClose, structure, onSaved }: StructureEditModalProps) {
    const { userData } = useAuth();
    const { currentProperty } = useProperty();
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState<Partial<Structure>>({
        name: "",
        category: "leisure",
        description: "",
        visibility: "admin_only",
        capacity: 2,
        status: "available",
        bookingType: "fixed_slots",
        units: [],
        requiresTurnover: false,
        operatingHours: {
            openTime: "08:00",
            closeTime: "20:00",
            slotDurationMinutes: 60,
            slotIntervalMinutes: 15
        }
    });

    useEffect(() => {
        if (structure) {
            setFormData(structure);
        } else {
            setFormData({
                name: "",
                category: "leisure",
                description: "",
                visibility: "admin_only",
                capacity: 2,
                status: "available",
                bookingType: "fixed_slots",
                units: [],
                requiresTurnover: false,
                operatingHours: {
                    openTime: "08:00",
                    closeTime: "20:00",
                    slotDurationMinutes: 60,
                    slotIntervalMinutes: 15
                }
            });
        }
    }, [structure, isOpen]);

    if (!isOpen || !currentProperty) return null;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, unitId?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('filename', file.name);

            // Note: Since Vercel Blob doesn't accept multipart/form-data directly in the standard put() via this route, 
            // It's better to send the file as the body and pass filename in query
            const response = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
                method: 'POST',
                body: file,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();

            if (unitId) {
                setFormData(prev => ({
                    ...prev,
                    units: prev.units?.map(u => u.id === unitId ? { ...u, imageUrl: data.url } : u)
                }));
            } else {
                setFormData(prev => ({ ...prev, imageUrl: data.url }));
            }
            toast.success("Imagem anexada com sucesso!");
        } catch (error) {
            console.error(error);
            toast.error("Falha ao anexar imagem.");
        } finally {
            setLoading(false);
            if (e.target) e.target.value = ''; // Reset input
        }
    };

    const addUnit = () => {
        setFormData(prev => ({
            ...prev,
            units: [...(prev.units || []), { id: uuidv4(), name: `Unidade ${(prev.units?.length || 0) + 1}` }]
        }));
    };

    const removeUnit = (id: string) => {
        setFormData(prev => ({
            ...prev,
            units: prev.units?.filter(u => u.id !== id)
        }));
    };

    const updateUnitName = (id: string, name: string) => {
        setFormData(prev => ({
            ...prev,
            units: prev.units?.map(u => u.id === id ? { ...u, name } : u)
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData) return;

        setLoading(true);
        try {
            if (structure) {
                await StructureService.updateStructure(
                    currentProperty.id,
                    structure.id,
                    formData,
                    userData.id,
                    userData.fullName
                );
                toast.success("Estrutura atualizada!");
            } else {
                await StructureService.createStructure(
                    currentProperty.id,
                    formData as Omit<Structure, 'id' | 'createdAt'>,
                    userData.id,
                    userData.fullName
                );
                toast.success("Estrutura criada!");
            }
            onSaved();
            onClose();
        } catch (error) {
            toast.error("Erro ao salvar estrutura.");
        } finally {
            setLoading(false);
        }
    };

    const handleOperatingHoursChange = (field: string, value: any) => {
        setFormData({
            ...formData,
            operatingHours: { ...formData.operatingHours!, [field]: value }
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-card w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-border animate-in zoom-in-95 duration-300">

                <header className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">
                            {structure ? "Editar Estrutura" : "Nova Estrutura"}
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Configure as regras de operação e agendamentos.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-xl transition-all"><X size={20} /></button>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
                    <form id="structureForm" onSubmit={handleSubmit} className="space-y-8">

                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest border-b border-border pb-2">Informações Básicas</h3>
                            <div className="flex gap-6 items-start">
                                {/* Image Upload */}
                                <div className="shrink-0">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Foto Principal</label>
                                    <div className="relative group w-32 h-32 rounded-2xl border-2 border-dashed border-border flex items-center justify-center bg-secondary/30 overflow-hidden hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer">
                                        {formData.imageUrl ? (
                                            <img src={formData.imageUrl} alt="Structure" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImagePlus className="text-muted-foreground group-hover:text-primary transition-colors" size={24} />
                                        )}
                                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e)} className="absolute inset-0 opacity-0 cursor-pointer" disabled={loading} />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-white text-xs font-bold uppercase">Alterar</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Nome da Estrutura</label>
                                        <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground" placeholder="Ex: Quadra de Tênis de Saibro" />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Descrição Longa (Portal Hóspede)</label>
                                        <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground min-h-[80px]" placeholder="Descreva os equipamentos, regras e detalhes visíveis ao hóspede." />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1.5"><Activity size={12} /> Categoria</label>
                                    <select required value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground appearance-none">
                                        <option value="leisure">Lazer e Recreação</option>
                                        <option value="spa">Spa e Bem Estar</option>
                                        <option value="sport">Quadas Esportivas</option>
                                        <option value="service">Serviços Extras</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1.5"><Users size={12} /> Lotação Máx. (Pessoas)</label>
                                    <input type="number" min="1" required value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: Number(e.target.value) })} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest border-b border-border pb-2">Regras de Negócio</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-secondary/40 p-4 border border-border rounded-2xl">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1.5">Quem pode visualizar e agendar?</label>
                                    <select required value={formData.visibility} onChange={e => setFormData({ ...formData, visibility: e.target.value as any })} className="w-full bg-background border border-border p-3 rounded-xl text-sm font-bold text-foreground mt-2 outline-none focus:border-primary appearance-none">
                                        <option value="admin_only">Oculto. (Apenas Recepção Pode Agendar)</option>
                                        <option value="guest_request">Hóspede Pode Solicitar (Requer Aprovação da Recepção)</option>
                                        <option value="guest_auto_approve">Hóspede Reserva e Aprova Automaticamente</option>
                                    </select>
                                </div>

                                <label className="flex items-center gap-3 p-4 bg-secondary/40 border border-border rounded-2xl cursor-pointer hover:bg-secondary/60 transition-colors">
                                    <input type="checkbox" checked={formData.requiresTurnover} onChange={e => setFormData({ ...formData, requiresTurnover: e.target.checked })} className="w-5 h-5 accent-primary rounded cursor-pointer" />
                                    <div>
                                        <div className="font-bold text-sm text-foreground">Exige Limpeza (Turnover) Pós Uso</div>
                                        <p className="text-xs text-muted-foreground mt-0.5">Ao finalizar uma reserva, dispara uma tarefa de limpeza no módulo de governança.</p>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest border-b border-border pb-2 flex items-center justify-between">
                                <span className="flex items-center gap-2"><Clock size={14} /> Regras de Tempo & Agenda</span>
                            </h3>

                            <div className="flex bg-secondary p-1 rounded-xl">
                                <button type="button" onClick={() => setFormData({ ...formData, bookingType: 'fixed_slots' })} className={cn("flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all", formData.bookingType === 'fixed_slots' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>
                                    Slots Fixos
                                </button>
                                <button type="button" onClick={() => setFormData({ ...formData, bookingType: 'free_time' })} className={cn("flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2", formData.bookingType === 'free_time' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>
                                    Tempo Livre <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[8px] rounded-sm">Flexível</span>
                                </button>
                            </div>

                            <p className="text-xs text-muted-foreground mb-4">
                                {formData.bookingType === 'fixed_slots' ? 'Os horários disponíveis serão gerados dinamicamente dividindo a janela de operação pela duração do uso e o intervalo de limpeza.' : 'O hóspede ou admin poderá escolher livremente a hora de início e término, desde que dentro da janela de operação.'}
                            </p>

                            <div className="grid grid-cols-2 gap-4 bg-secondary/20 p-4 border border-border rounded-2xl">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Abre às</label>
                                    <input type="time" required value={formData.operatingHours?.openTime} onChange={e => handleOperatingHoursChange('openTime', e.target.value)} className="w-full bg-background border border-border p-3 rounded-xl text-sm font-mono text-center outline-none focus:border-primary text-foreground" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Fecha às</label>
                                    <input type="time" required value={formData.operatingHours?.closeTime} onChange={e => handleOperatingHoursChange('closeTime', e.target.value)} className="w-full bg-background border border-border p-3 rounded-xl text-sm font-mono text-center outline-none focus:border-primary text-foreground" />
                                </div>
                                {formData.bookingType === 'fixed_slots' && (
                                    <>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Duração do Uso (Minutos)</label>
                                            <input type="number" step="5" min="5" required value={formData.operatingHours?.slotDurationMinutes} onChange={e => handleOperatingHoursChange('slotDurationMinutes', Number(e.target.value))} className="w-full bg-background border border-border p-3 rounded-xl text-sm text-center outline-none focus:border-primary text-foreground font-mono" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Intervalo / Preparação (Minutos)</label>
                                            <input type="number" step="5" min="0" required value={formData.operatingHours?.slotIntervalMinutes} onChange={e => handleOperatingHoursChange('slotIntervalMinutes', Number(e.target.value))} className="w-full bg-background border border-border p-3 rounded-xl text-sm text-center outline-none focus:border-primary text-foreground font-mono" />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-border pb-2">
                                <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest flex items-center gap-2"><Calendar size={14} /> Múltiplas Unidades</h3>
                                <button type="button" onClick={addUnit} className="text-[10px] font-bold uppercase text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md transition-colors"><Plus size={12} /> Adicionar</button>
                            </div>

                            <p className="text-xs text-muted-foreground mb-4">Se esta estrutura possui mais de um espaço físico que pode ser agendado simultaneamente (ex: Sala de Massagem 1, Sala de Massagem 2), adicione-os aqui. Caso contrário, deixe vazio e a estrutura em si será a única &quot;unidade&quot;.</p>

                            {formData.units && formData.units.length > 0 && (
                                <div className="space-y-3">
                                    {formData.units.map(unit => (
                                        <div key={unit.id} className="flex gap-4 items-center bg-secondary/30 p-3 rounded-xl border border-border">
                                            <div className="relative group w-12 h-12 shrink-0 rounded-lg border border-dashed border-border flex items-center justify-center bg-background overflow-hidden hover:border-primary/50 cursor-pointer">
                                                {unit.imageUrl ? (
                                                    <img src={unit.imageUrl} alt={unit.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <ImagePlus className="text-muted-foreground group-hover:text-primary transition-colors" size={14} />
                                                )}
                                                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, unit.id)} className="absolute inset-0 opacity-0 cursor-pointer" disabled={loading} title="Anexar foto" />
                                            </div>
                                            <div className="flex-1">
                                                <input type="text" value={unit.name} onChange={e => updateUnitName(unit.id, e.target.value)} className="w-full bg-transparent border-none p-0 text-sm font-bold text-foreground focus:ring-0 outline-none placeholder:font-normal" placeholder="Nome da Unidade..." />
                                            </div>
                                            <button type="button" onClick={() => removeUnit(unit.id)} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </form>
                </div>

                <footer className="p-4 border-t border-border bg-secondary/30 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 hover:bg-accent rounded-xl text-muted-foreground font-bold text-xs uppercase tracking-wider transition-all">
                        Cancelar
                    </button>
                    <button type="submit" form="structureForm" disabled={loading} className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl text-xs uppercase tracking-wider hover:opacity-90 transition-all flex items-center gap-2">
                        {loading ? "Salvando..." : <><Save size={16} /> Salvar Estrutura</>}
                    </button>
                </footer>

            </div>
        </div>
    );
}
