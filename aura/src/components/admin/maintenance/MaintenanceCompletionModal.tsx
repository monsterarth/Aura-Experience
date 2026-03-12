import React, { useState, useRef } from "react";
import { X, Save, Camera, CheckSquare, XSquare, UploadCloud, MessageSquare, Trash2 } from "lucide-react";
import { MaintenanceTask, Cabin, Structure } from "@/types/aura";
import { MaintenanceService } from "@/services/maintenance-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface MaintenanceCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    task: MaintenanceTask | null;
    cabins: Record<string, Cabin>;
    structures: Record<string, Structure>;
}

export function MaintenanceCompletionModal({ isOpen, onClose, propertyId, task, cabins, structures }: MaintenanceCompletionModalProps) {
    const { userData } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [resolved, setResolved] = useState(true);
    const [needsCleaning, setNeedsCleaning] = useState(false);
    const [notes, setNotes] = useState("");
    const [photoUrl, setPhotoUrl] = useState("");

    if (!isOpen || !task) return null;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const response = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
                method: 'POST',
                body: file,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || 'Upload failed');
            }

            const data = await response.json();
            setPhotoUrl(data.url);
            toast.success("Foto anexada com sucesso!");

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error("Upload error:", error);
            toast.error("Falha ao subir imagem. " + (error instanceof Error ? error.message : ''));
        } finally {
            setUploading(false);
        }
    };

    const handleComplete = async () => {
        setLoading(true);
        try {
            await MaintenanceService.finishTask(propertyId, task.id, {
                resolved,
                needsCleaning,
                notes,
                photoUrl
            }, userData?.id || "admin", userData?.fullName || "Admin");

            toast.success(resolved ? "Mantenção concluída com sucesso!" : "Manutenção despachada para conferência.");
            onClose();
        } catch (e) {
            toast.error("Erro ao finalizar manutenção.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
            <div className="bg-background w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-border bg-card">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                            <CheckSquare size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-none">Relatório Técnico</h3>
                            <p className="text-xs text-muted-foreground font-medium mt-1">{task.title}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"><X size={20} /></button>
                </div>

                <div className="p-6 space-y-6">
                    {/* FOTO REPORTADA (CRIADA NO APP BUG / HÓSPEDE / MANUTENÇÃO) */}
                    {task.imageUrl && (
                        <div>
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest block mb-2">Foto / Evidência Original</label>
                            <div className="relative h-40 w-full rounded-2xl overflow-hidden border border-border">
                                <Image src={task.imageUrl} alt="Evidência do Problema" fill className="object-cover" />
                            </div>
                        </div>
                    )}

                    {/* FOTO COMPROBATÓRIA DA RESOLUÇÃO */}
                    <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest block mb-2">{task.imageUrl ? "Foto da Resolução (Opcional)" : "Foto / Comprovante (Opcional)"}</label>
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                        />
                        {photoUrl ? (
                            <div className="relative h-40 w-full rounded-2xl overflow-hidden group border border-border">
                                <Image src={photoUrl} alt="Comprovante" fill className="object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button onClick={() => setPhotoUrl("")} className="bg-red-500 text-white p-2 rounded-full absolute top-2 right-2"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="w-full h-24 border-2 border-dashed border-border hover:border-primary/50 rounded-2xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                            >
                                {uploading ? <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div> : <Camera size={24} />}
                                <span className="text-xs font-bold uppercase tracking-widest">{uploading ? 'Carregando...' : 'Tirar Foto'}</span>
                            </button>
                        )}
                    </div>

                    {/* PERGUNTAS DE RESOLUÇÃO */}
                    <div className="space-y-4 pt-4 border-t border-border">
                        <div className="flex items-center justify-between p-4 bg-secondary/30 border border-border rounded-2xl">
                            <div>
                                <p className="text-sm font-bold text-foreground">O problema foi solucionado?</p>
                                <p className="text-[10px] text-muted-foreground">Se não, será enviado para conferência.</p>
                            </div>
                            <div className="flex gap-2 bg-background p-1 rounded-xl shadow-sm border border-border">
                                <button onClick={() => setResolved(true)} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all", resolved ? "bg-green-500 text-white" : "text-muted-foreground hover:bg-secondary")}>Sim</button>
                                <button onClick={() => setResolved(false)} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all", !resolved ? "bg-red-500 text-white" : "text-muted-foreground hover:bg-secondary")}>Não</button>
                            </div>
                        </div>

                        {(task.cabinId || task.structureId) && (
                            <div className="flex items-center justify-between p-4 bg-secondary/30 border border-border rounded-2xl">
                                <div>
                                    <p className="text-sm font-bold text-foreground">Sujou o espaço?</p>
                                    <p className="text-[10px] text-muted-foreground">Bloqueia e envia para governança limpar.</p>
                                </div>
                                <div className="flex gap-2 bg-background p-1 rounded-xl shadow-sm border border-border">
                                    <button onClick={() => setNeedsCleaning(true)} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all", needsCleaning ? "bg-orange-500 text-white" : "text-muted-foreground hover:bg-secondary")}>Sim</button>
                                    <button onClick={() => setNeedsCleaning(false)} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all", !needsCleaning ? "bg-blue-500 text-white" : "text-muted-foreground hover:bg-secondary")}>Não</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* OBSERVAÇÕES */}
                    <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest block mb-2 flex items-center gap-1"><MessageSquare size={12} /> Comentários (Opcional)</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Peças substituídas, observações extras..."
                            rows={3}
                            className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-primary resize-none"
                        />
                    </div>
                </div>

                <div className="p-4 bg-card/50 border-t border-border flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold uppercase tracking-widest text-xs bg-secondary text-foreground hover:bg-muted transition-colors">Cancelar</button>
                    <button onClick={handleComplete} disabled={loading} className="flex-1 py-3 rounded-xl font-bold uppercase tracking-widest text-xs bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
                        {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Confirmar Envio'}
                    </button>
                </div>
            </div>
        </div>
    );
}
