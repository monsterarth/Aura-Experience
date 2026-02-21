// src/app/admin/staff/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { StaffService } from "@/services/staff-service";
import { Staff, UserRole } from "@/types/aura";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { 
  Users, 
  Plus, 
  Mail, 
  User, 
  ShieldCheck, 
  Loader2, 
  Key,
  Copy
} from "lucide-react";
import { toast } from "sonner";

// Mapa para exibir os cargos de forma amigável na tabela
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

export default function StaffManagementPage() {
  const { userData } = useAuth();
  const { property } = useProperty();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreatedModal, setShowCreatedModal] = useState<{pw: string, email: string} | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    role: "reception" as UserRole,
  });

  const loadStaff = useCallback(async () => {
    try {
      const pId = userData?.propertyId || property?.id;
      if (!pId) return;
      const data = await StaffService.getStaffByProperty(pId);
      setStaffList(data);
    } catch (error) {
      toast.error("Erro ao carregar equipa.");
    } finally {
      setLoading(false);
    }
  }, [userData?.propertyId, property?.id]);

  useEffect(() => {
    if (userData?.propertyId || property?.id) {
      loadStaff();
    }
  }, [userData, property, loadStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData || !property) return;
    
    setIsCreating(true);
    try {
      const result = await StaffService.createStaffMember({
        ...formData,
        propertyId: property.id,
        actorId: userData.id,
        actorName: userData.fullName
      });

      toast.success("Membro da equipa criado!");
      setShowCreatedModal({ pw: result.password, email: formData.email });
      setFormData({ fullName: "", email: "", role: "reception" });
      loadStaff();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["super_admin", "admin"]}>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
              <Users className="text-primary" /> Equipa Aura
            </h1>
            <p className="text-muted-foreground">Gira os acessos e permissões da propriedade.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário lateral */}
          <aside className="bg-card border border-border p-6 rounded-2xl shadow-sm h-fit space-y-6">
            <h2 className="font-bold flex items-center gap-2 text-lg">
              <Plus size={20} className="text-primary" /> Adicionar Funcionário
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 text-muted-foreground" size={18} />
                  <input 
                    required
                    value={formData.fullName}
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                    placeholder="Ex: Ana Souza"
                    className="w-full pl-10 p-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">E-mail de Acesso</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 text-muted-foreground" size={18} />
                  <input 
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="ana@aura.com"
                    className="w-full pl-10 p-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Cargo / Permissão</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                  className="w-full p-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <optgroup label="Administrativo e Recepção">
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

              <button 
                disabled={isCreating}
                className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="animate-spin" /> : "Criar Utilizador"}
              </button>
            </form>
          </aside>

          {/* Lista de Membros */}
          <main className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-4 text-xs font-bold uppercase text-muted-foreground">Membro</th>
                  <th className="p-4 text-xs font-bold uppercase text-muted-foreground">Cargo</th>
                  <th className="p-4 text-xs font-bold uppercase text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={3} className="p-12 text-center"><Loader2 className="animate-spin mx-auto" /></td></tr>
                ) : staffList.length === 0 ? (
                  <tr><td colSpan={3} className="p-12 text-center text-muted-foreground">Nenhum funcionário registado.</td></tr>
                ) : (
                  staffList.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="font-bold">{m.fullName}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold uppercase rounded-md">
                          {roleLabels[m.role] || m.role}
                        </span>
                      </td>
                      <td className="p-4">
                        {m.active ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs font-bold">
                            <ShieldCheck size={14} /> Ativo
                          </span>
                        ) : (
                          <span className="text-destructive text-xs font-bold">Inativo</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </main>
        </div>

        {/* Modal de Sucesso com Password Provisória */}
        {showCreatedModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-card border border-border p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-6 animate-in zoom-in duration-200">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                  <Key size={32} />
                </div>
                <h3 className="text-2xl font-bold">Conta Criada!</h3>
                <p className="text-sm text-muted-foreground">Copie as credenciais abaixo e envie ao funcionário. Esta senha não será mostrada novamente.</p>
              </div>

              <div className="bg-muted p-4 rounded-xl space-y-3 font-mono text-sm">
                <div>
                  <span className="text-xs font-bold block text-muted-foreground uppercase">E-mail</span>
                  <div className="flex justify-between">
                    <span>{showCreatedModal.email}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-border">
                  <span className="text-xs font-bold block text-muted-foreground uppercase">Senha Provisória</span>
                  <div className="flex justify-between items-center text-primary font-bold">
                    <span>{showCreatedModal.pw}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`Email: ${showCreatedModal.email}\nSenha: ${showCreatedModal.pw}`);
                        toast.success("Copiado!");
                      }}
                      className="p-2 hover:bg-primary/10 rounded-lg"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowCreatedModal(null)}
                className="w-full py-3 bg-foreground text-background font-bold rounded-xl"
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}