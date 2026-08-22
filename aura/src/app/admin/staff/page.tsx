// src/app/admin/staff/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { StaffEditModal } from "@/components/admin/StaffEditModal";
import { StaffService } from "@/services/staff-service";
import { Staff, UserRole } from "@/types/aura";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { Users, Plus, ShieldCheck, Key, Copy } from "lucide-react";
import { toast } from "sonner";
import { T } from "@/lib/admin-tokens";
import { copyText } from "@/lib/clipboard";
import { PageShell, PageHeader, Card, Field, Input, Select, Button, Pill, DataList, Dialog, type Column } from "@/components/aura";

// Mapa para exibir os cargos de forma amigável na lista
const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  director: "Diretor",
  manager: "Gerente / RH",
  reception: "Recepção",
  governance: "Governanta (Gestão)",
  maid: "Camareira (Mobile)",
  maintenance: "Coordenador de Manutenção",
  technician: "Manutenção (Mobile)",
  kitchen: "Cozinha (Gestão)",
  waiter: "Garçom (Mobile)",
  porter: "Porteiro (Mobile)",
  houseman: "Mensageiro (Mobile)",
  marketing: "Marketing",
  compras: "Compras",
};

export default function StaffManagementPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState<{ pw: string; email: string } | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({ fullName: "", email: "", role: "reception" as UserRole });

  const loadStaff = useCallback(async () => {
    try {
      const pId = property?.id || userData?.propertyId;
      if (!pId) return;
      const data = await StaffService.getStaffByProperty(pId);
      setStaffList(data);
    } catch {
      toast.error("Erro ao carregar equipe.");
    } finally {
      setLoading(false);
    }
  }, [userData?.propertyId, property?.id]);

  useEffect(() => {
    if (userData?.propertyId || property?.id) loadStaff();
  }, [userData, property, loadStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData || !property) return;
    setIsCreating(true);
    try {
      const result = await StaffService.createStaffMember({ ...formData, propertyId: property.id, actorId: userData.id, actorName: userData.fullName });
      toast.success("Membro da equipe criado!");
      setCreated({ pw: result.password, email: formData.email });
      setFormData({ fullName: "", email: "", role: "reception" });
      loadStaff();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const columns: Column<Staff>[] = [
    {
      id: "member", header: "Membro", mobile: "title", priority: 1,
      cell: (m) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {m.profilePictureUrl ? (
            <img src={m.profilePictureUrl} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: `1px solid ${T.border}`, flexShrink: 0 }} />
          ) : (
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: T.gradSoft, color: T.brandText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>{m.fullName.charAt(0).toUpperCase()}</span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fullName}</div>
            <div style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
          </div>
        </div>
      ),
    },
    { id: "role", header: "Cargo", mobile: "meta", priority: 2, cell: (m) => <Pill tone="brand" label={roleLabels[m.role] || m.role} /> },
    { id: "status", header: "Status", mobile: "trailing", priority: 2, cell: (m) => m.active ? <Pill tone="green" icon={ShieldCheck} label="Ativo" /> : <Pill tone="red" label="Inativo" /> },
  ];

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager"]}>
      <PageShell>
        <PageHeader icon={Users} title="Equipe Aura" subtitle="Acessos e permissões da propriedade" />

        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
          <Card header={{ title: "Adicionar funcionário", icon: Plus, tone: "brand" }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Nome completo" required>
                <Input required value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} placeholder="Ex: Ana Souza" autoComplete="off" />
              </Field>
              <Field label="E-mail de acesso" required>
                <Input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="ana@aura.com" autoComplete="off" inputMode="email" />
              </Field>
              <Field label="Cargo / permissão">
                <Select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}>
                  <optgroup label="Administrativo e Recepção">
                    <option value="admin">Administrador</option>
                    <option value="director">Diretor</option>
                    <option value="manager">Gerente / RH</option>
                    <option value="reception">Recepção</option>
                    <option value="marketing">Marketing</option>
                    <option value="compras">Compras (Estoque)</option>
                  </optgroup>
                  <optgroup label="Governança">
                    <option value="governance">Governanta (Gestão)</option>
                    <option value="maid">Camareira (Mobile)</option>
                    <option value="houseman">Mensageiro (Mobile)</option>
                  </optgroup>
                  <optgroup label="Manutenção">
                    <option value="maintenance">Coordenador de Manutenção</option>
                    <option value="technician">Manutenção (Mobile)</option>
                  </optgroup>
                  <optgroup label="A&B / Portaria">
                    <option value="kitchen">Cozinha/Salão (Gestão)</option>
                    <option value="waiter">Garçom (Mobile)</option>
                    <option value="porter">Porteiro (Mobile)</option>
                  </optgroup>
                </Select>
              </Field>
              <Button type="submit" variant="primary" fullWidth loading={isCreating} loadingText="Criando…">Criar usuário</Button>
            </form>
          </Card>

          <DataList<Staff>
            rows={staffList}
            columns={columns}
            rowKey={(m) => m.id}
            onRowClick={(m) => setEditingStaff(m)}
            loading={loading}
            skeletonRows={6}
            empty={<p style={{ textAlign: "center", color: T.muted, padding: "32px 0", margin: 0, fontSize: 13 }}>Nenhum funcionário registrado.</p>}
          />
        </div>

        {/* Senha provisória — só aparece uma vez */}
        <Dialog open={!!created} onClose={() => setCreated(null)} presentation="auto" size="sm" icon={Key} iconTone="green" title="Conta criada!" subtitle="Copie as credenciais abaixo e envie ao funcionário. Esta senha não será mostrada novamente."
          footer={<Button variant="primary" fullWidth onClick={() => setCreated(null)}>Concluir</Button>}>
          {created && (
            <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
              <div>
                <span className="ak-field__label">E-mail</span>
                <div style={{ color: T.text }}>{created.email}</div>
              </div>
              <div style={{ paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                <span className="ak-field__label">Senha provisória</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, color: T.brandText, fontWeight: 800 }}>
                  <span style={{ wordBreak: "break-all" }}>{created.pw}</span>
                  <Button variant="secondary" size="sm" icon={Copy} onClick={async () => { if (await copyText(`Email: ${created.email}\nSenha: ${created.pw}`)) toast.success("Copiado!"); else toast.error("Não foi possível copiar — selecione e use Ctrl+C."); }}>Copiar</Button>
                </div>
              </div>
            </div>
          )}
        </Dialog>

        {editingStaff && (
          <StaffEditModal staff={editingStaff} onClose={() => setEditingStaff(null)} onSave={() => { setEditingStaff(null); loadStaff(); }} />
        )}
      </PageShell>
    </RoleGuard>
  );
}
