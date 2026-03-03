import React, { useState, useEffect } from "react";
import { X, Save, Copy, Key, Loader2, Camera } from "lucide-react";
import { Staff, UserRole } from "@/types/aura";
import { StaffService } from "@/services/staff-service";
import { toast } from "sonner";
import { ImageUpload } from "./ImageUpload";

interface StaffEditModalProps {
    staff: Staff;
    onClose: () => void;
    onSave: () => void;
}

const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Administrador",
    reception: "Recepção",
    governance: "Governanta (Gestão)",
    maid: "Camareira (Mobile)",
    maintenance: "Manutenção (Gestão)",
    technician: "Técnico (Mobile)",
    kitchen: "Cozinha (Gestão)",
    waiter: "Garçom (Mobile)",
    porter: "Porteiro (Mobile)",
    marketing: "Marketing"
};

export function StaffEditModal({ staff, onClose, onSave }: StaffEditModalProps) {
    const [formData, setFormData] = useState<Partial<Staff>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setFormData({
            fullName: staff.fullName,
            role: staff.role,
            active: staff.active,
            phone: staff.phone || "",
            birthDate: staff.birthDate || "",
            bio: staff.bio || "",
            profilePictureUrl: staff.profilePictureUrl || ""
        });
    }, [staff]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await StaffService.updateStaff(staff.id, formData);
            toast.success("Perfil atualizado com sucesso!");
            onSave();
        } catch (error: any) {
            toast.error(error.message || "Erro ao atualizar perfil.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
                    <h2 className="text-xl font-bold">Editar Perfil</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-6">

                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Esquerda: Foto */}
                        <div className="flex flex-col items-center space-y-3 w-full md:w-1/3">
                            <label className="text-xs font-bold uppercase text-muted-foreground self-start">Foto de Perfil</label>
                            <div className="w-full aspect-square relative rounded-2xl overflow-hidden border-2 border-dashed border-border group hover:border-primary/50 transition-colors">
                                <ImageUpload
                                    onUploadSuccess={(url: string) => setFormData(prev => ({ ...prev, profilePictureUrl: url }))}
                                    value={formData.profilePictureUrl || undefined}
                                />
                            </div>
                        </div>

                        {/* Direita: Dados Principais */}
                        <div className="w-full md:w-2/3 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Nome Completo</label>
                                <input
                                    required
                                    value={formData.fullName || ""}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    className="w-full p-2.5 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase text-muted-foreground">Telemóvel / Telefone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone || ""}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="Ex: 554899999999"
                                        className="w-full p-2.5 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase text-muted-foreground">Nascimento</label>
                                    <input
                                        type="date"
                                        value={formData.birthDate || ""}
                                        onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                                        className="w-full p-2.5 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Ocupação / Cargo</label>
                                <select
                                    value={formData.role || ""}
                                    onChange={e => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))}
                                    className="w-full p-2.5 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <optgroup label="Administrativo e Recepção">
                                        <option value="super_admin">Super Admin</option>
                                        <option value="admin">Administrador</option>
                                        <option value="reception">Recepção</option>
                                        <option value="marketing">Marketing</option>
                                    </optgroup>
                                    <optgroup label="Governança">
                                        <option value="governance">Governanta (Gestão)</option>
                                        <option value="maid">Camareira (Mobile)</option>
                                    </optgroup>
                                    <optgroup label="Manutenção">
                                        <option value="maintenance">Manutenção (Gestão)</option>
                                        <option value="technician">Técnico (Mobile)</option>
                                    </optgroup>
                                    <optgroup label="A&B / Portaria">
                                        <option value="kitchen">Cozinha/Salão (Gestão)</option>
                                        <option value="waiter">Garçom (Mobile)</option>
                                        <option value="porter">Porteiro (Mobile)</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Biografia / Notas Interiores</label>
                        <textarea
                            value={formData.bio || ""}
                            onChange={e => setFormData({ ...formData, bio: e.target.value })}
                            placeholder="Escreva algo sobre este funcionário..."
                            className="w-full p-3 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none resize-none min-h-[100px]"
                        />
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-border mt-4">
                        <input
                            type="checkbox"
                            id="activeCheckbox"
                            checked={formData.active || false}
                            onChange={e => setFormData({ ...formData, active: e.target.checked })}
                            className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-offset-background"
                        />
                        <label htmlFor="activeCheckbox" className="text-sm font-semibold select-none cursor-pointer">
                            Conta Ativa no Aura
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 font-bold hover:bg-muted rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-xl flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-colors"
                        >
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                            Guardar Alterações
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
