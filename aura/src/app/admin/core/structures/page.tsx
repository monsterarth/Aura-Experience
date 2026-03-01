"use client";

import React, { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Clock, MapPin, Eye, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { StructureService } from "@/services/structure-service";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { Structure } from "@/types/aura";
import { StructureEditModal } from "./components/StructureEditModal";

export default function StructuresPage() {
    const { currentProperty } = useProperty();
    const { userData } = useAuth();

    const [structures, setStructures] = useState<Structure[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStructure, setEditingStructure] = useState<Structure | null>(null);

    useEffect(() => {
        if (currentProperty) loadStructures();
    }, [currentProperty]);

    const loadStructures = async () => {
        if (!currentProperty) return;
        setLoading(true);
        try {
            const data = await StructureService.getStructures(currentProperty.id);
            setStructures(data);
        } catch (error) {
            toast.error("Erro ao carregar estruturas.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (structure: Structure) => {
        if (!currentProperty || !userData) return;
        if (!confirm(`Tem certeza que deseja excluir "${structure.name}"?`)) return;

        try {
            await StructureService.deleteStructure(
                currentProperty.id,
                structure.id,
                userData.id,
                userData.fullName
            );
            toast.success("Estrutura excluída!");
            loadStructures();
        } catch (error) {
            toast.error("Erro ao excluir estrutura.");
        }
    };

    const handleEdit = (structure: Structure) => {
        setEditingStructure(structure);
        setIsModalOpen(true);
    };

    const formatVisibility = (v: string) => {
        if (v === 'admin_only') return 'Apenas Recepção';
        if (v === 'guest_request') return 'Hóspede Solicita';
        return 'Hóspede Reserva (Auto)';
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Estruturas Adicionais</h1>
                    <p className="text-muted-foreground mt-1">Gerencie quadras, spas, saunas e salas de massagem da propriedade.</p>
                </div>
                <button
                    onClick={() => { setEditingStructure(null); setIsModalOpen(true); }}
                    className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:opacity-90 transition-all flex items-center gap-2 shadow-sm"
                >
                    <Plus size={16} /> Nova Estrutura
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-muted-foreground text-sm font-medium animate-pulse">
                    Carregando estruturas...
                </div>
            ) : structures.length === 0 ? (
                <div className="text-center py-20 bg-secondary/30 rounded-3xl border border-dashed border-border flex flex-col items-center justify-center">
                    <div className="h-16 w-16 bg-background rounded-full flex items-center justify-center shadow-sm mb-4 border border-border">
                        <MapPin className="text-muted-foreground/50 h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Nenhuma estrutura cadastrada</h3>
                    <p className="text-muted-foreground text-sm max-w-sm mb-6">
                        Adicione spas, quadras ou áreas comuns que precisam de agendamento por horários.
                    </p>
                    <button
                        onClick={() => { setEditingStructure(null); setIsModalOpen(true); }}
                        className="bg-primary/10 text-primary px-6 py-2.5 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-primary/20 transition-all flex items-center gap-2"
                    >
                        <Plus size={16} /> Criar Primeira Estrutura
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {structures.map(structure => (
                        <div key={structure.id} className="bg-card border border-border rounded-3xl p-6 hover:shadow-lg transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                                        <MapPin className="text-primary h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-foreground leading-tight">{structure.name}</h3>
                                        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 uppercase mt-1">
                                            {formatVisibility(structure.visibility)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 mb-6 bg-secondary/50 p-4 rounded-2xl border border-border">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground flex items-center gap-2 text-xs font-bold uppercase"><Clock size={14} /> Horários</span>
                                    <span className="font-mono font-bold text-foreground">
                                        {structure.operatingHours.openTime} às {structure.operatingHours.closeTime}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground flex items-center gap-2 text-xs font-bold uppercase"><CheckCircle2 size={14} /> Slots</span>
                                    <span className="font-mono font-bold text-foreground">
                                        {structure.operatingHours.slotDurationMinutes} min
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground flex items-center gap-2 text-xs font-bold uppercase"><Eye size={14} /> Capacid.</span>
                                    <span className="font-black text-foreground">
                                        {structure.capacity} {structure.capacity === 1 ? 'pessoa' : 'pessoas'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                                <button
                                    onClick={() => handleEdit(structure)}
                                    className="p-2 text-muted-foreground hover:bg-accent hover:text-foreground rounded-xl transition-colors"
                                    title="Editar Estrutura"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(structure)}
                                    className="p-2 text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                                    title="Excluir Estrutura"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <StructureEditModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    structure={editingStructure}
                    onSaved={loadStructures}
                />
            )}
        </div>
    );
}
