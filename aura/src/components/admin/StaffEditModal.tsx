import React, { useState, useEffect } from "react";
import {
  X, Save, Loader2, Mail, Lock, Trash2, Eye, EyeOff,
  User, AlertTriangle, ShieldCheck
} from "lucide-react";
import { Staff, UserRole } from "@/types/aura";
import { StaffService } from "@/services/staff-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ImageUpload } from "./ImageUpload";

interface StaffEditModalProps {
  staff: Staff;
  onClose: () => void;
  onSave: () => void;
}

type Tab = "profile" | "security" | "delete";

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
  houseman: "Houseman (Mobile)",
  marketing: "Marketing"
};

export function StaffEditModal({ staff, onClose, onSave }: StaffEditModalProps) {
  const { userData } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");

  // --- Profile tab ---
  const [formData, setFormData] = useState<Partial<Staff>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  // --- Security tab ---
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // --- Delete tab ---
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isSelf = userData?.id === staff.id;
  const canDelete =
    userData?.role === "super_admin" ||
    (userData?.role === "admin" && staff.role !== "super_admin");

  // Quem pode alterar o cargo de outra pessoa?
  // - super_admin pode tudo
  // - admin pode alterar roles abaixo de admin (não pode promover a admin/super_admin)
  // - ninguém pode alterar o próprio role
  const canEditRole =
    !isSelf &&
    (userData?.role === "super_admin" ||
      (userData?.role === "admin" && staff.role !== "super_admin"));

  useEffect(() => {
    setFormData({
      fullName: staff.fullName,
      role: staff.role,
      active: staff.active,
      phone: staff.phone || "",
      birthDate: staff.birthDate || "",
      bio: staff.bio || "",
      profilePictureUrl: staff.profilePictureUrl || "",
    });
  }, [staff]);

  // ── Profile save ─────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await StaffService.updateStaff(staff.id, formData);
      toast.success("Perfil atualizado com sucesso!");
      onSave();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Email change ──────────────────────────────────────────────
  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmail !== confirmEmail) {
      toast.error("Os e-mails não coincidem.");
      return;
    }
    setSavingEmail(true);
    try {
      const result = await StaffService.changeEmail(staff.id, newEmail);
      toast.success(result.message || "E-mail de confirmação enviado!");
      setNewEmail("");
      setConfirmEmail("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingEmail(false);
    }
  };

  // ── Password change ───────────────────────────────────────────
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("As novas senhas não coincidem.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setSavingPassword(true);
    try {
      await StaffService.changePassword(
        staff.id,
        newPassword,
        isSelf ? currentPassword : undefined
      );
      toast.success("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (deleteConfirm !== staff.fullName) {
      toast.error("O nome digitado não corresponde.");
      return;
    }
    setDeleting(true);
    try {
      await StaffService.deleteStaff(staff.id);
      toast.success(`${staff.fullName} foi removido do sistema.`);
      onSave();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Perfil", icon: <User size={15} /> },
    { id: "security", label: "Segurança", icon: <Lock size={15} /> },
    ...(canDelete ? [{ id: "delete" as Tab, label: "Excluir", icon: <Trash2 size={15} /> }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            {staff.profilePictureUrl ? (
              <img src={staff.profilePictureUrl} alt={staff.fullName} className="w-9 h-9 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {staff.fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-base font-bold leading-tight">{staff.fullName}</h2>
              <p className="text-xs text-muted-foreground">{roleLabels[staff.role] || staff.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? t.id === "delete"
                    ? "border-destructive text-destructive"
                    : "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto custom-scrollbar flex-1">

          {/* ── TAB: Perfil ── */}
          {tab === "profile" && (
            <form onSubmit={handleSaveProfile} className="p-6 space-y-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex flex-col items-center space-y-3 w-full md:w-1/3">
                  <label className="text-xs font-bold uppercase text-muted-foreground self-start">Foto de Perfil</label>
                  <div className="w-full aspect-square relative rounded-2xl overflow-hidden border-2 border-dashed border-border group hover:border-primary/50 transition-colors">
                    <ImageUpload
                      onUploadSuccess={(url: string) => setFormData(prev => ({ ...prev, profilePictureUrl: url }))}
                      value={formData.profilePictureUrl || undefined}
                    />
                  </div>
                </div>

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
                      <label className="text-xs font-bold uppercase text-muted-foreground">Telemóvel</label>
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
                    <label className="text-xs font-bold uppercase text-muted-foreground">Cargo / Permissão</label>
                    {canEditRole ? (
                      <select
                        value={formData.role || ""}
                        onChange={e => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))}
                        className="w-full p-2.5 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {userData?.role === "super_admin" && (
                          <optgroup label="Administrativo e Recepção">
                            <option value="super_admin">Super Admin</option>
                            <option value="admin">Administrador</option>
                          </optgroup>
                        )}
                        <optgroup label="Recepção e Marketing">
                          <option value="hr">Gerente / RH</option>
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
                    ) : (
                      <div className="w-full p-2.5 bg-muted border rounded-lg text-muted-foreground text-sm select-none">
                        {roleLabels[formData.role || ""] || formData.role}
                        {isSelf && (
                          <span className="ml-2 text-xs opacity-60">(não pode alterar o próprio cargo)</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Biografia / Notas</label>
                <textarea
                  value={formData.bio || ""}
                  onChange={e => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Escreva algo sobre este funcionário..."
                  className="w-full p-3 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none resize-none min-h-[80px]"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border">
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

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={onClose} disabled={savingProfile} className="px-4 py-2 font-bold hover:bg-muted rounded-xl transition-colors">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-xl flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {savingProfile ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                  Guardar Alterações
                </button>
              </div>
            </form>
          )}

          {/* ── TAB: Segurança ── */}
          {tab === "security" && (
            <div className="p-6 space-y-8">

              {/* Alterar E-mail */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail size={18} className="text-primary" />
                  <h3 className="font-bold text-base">Alterar E-mail</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Será enviado um e-mail de confirmação para o endereço actual antes da alteração ser efectuada.
                </p>
                <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                  E-mail actual: <span className="font-semibold text-foreground">{staff.email}</span>
                </div>
                <form onSubmit={handleChangeEmail} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Novo E-mail</label>
                    <input
                      required
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="novo@email.com"
                      className="w-full p-2.5 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Confirmar Novo E-mail</label>
                    <input
                      required
                      type="email"
                      value={confirmEmail}
                      onChange={e => setConfirmEmail(e.target.value)}
                      placeholder="novo@email.com"
                      className="w-full p-2.5 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingEmail}
                    className="px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    {savingEmail ? <Loader2 className="animate-spin w-4 h-4" /> : <Mail size={16} />}
                    Enviar Confirmação
                  </button>
                </form>
              </section>

              <div className="border-t border-border" />

              {/* Alterar Senha */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Lock size={18} className="text-primary" />
                  <h3 className="font-bold text-base">Alterar Senha</h3>
                </div>
                {isSelf && (
                  <p className="text-sm text-muted-foreground">
                    Por ser a sua própria conta, é necessário confirmar a senha actual.
                  </p>
                )}
                <form onSubmit={handleChangePassword} className="space-y-3">
                  {isSelf && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase text-muted-foreground">Senha Actual</label>
                      <div className="relative">
                        <input
                          required
                          type={showCurrentPw ? "text" : "password"}
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pr-10 p-2.5 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <button type="button" onClick={() => setShowCurrentPw(p => !p)} className="absolute right-3 top-2.5 text-muted-foreground">
                          {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Nova Senha</label>
                    <div className="relative">
                      <input
                        required
                        type={showNewPw ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className="w-full pr-10 p-2.5 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <button type="button" onClick={() => setShowNewPw(p => !p)} className="absolute right-3 top-2.5 text-muted-foreground">
                        {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Confirmar Nova Senha</label>
                    <div className="relative">
                      <input
                        required
                        type={showConfirmPw ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        className="w-full pr-10 p-2.5 bg-background border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <button type="button" onClick={() => setShowConfirmPw(p => !p)} className="absolute right-3 top-2.5 text-muted-foreground">
                        {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  {newPassword && confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle size={12} /> As senhas não coincidem
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    {savingPassword ? <Loader2 className="animate-spin w-4 h-4" /> : <ShieldCheck size={16} />}
                    Alterar Senha
                  </button>
                </form>
              </section>
            </div>
          )}

          {/* ── TAB: Excluir ── */}
          {tab === "delete" && canDelete && (
            <div className="p-6 space-y-6">
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex gap-3">
                <AlertTriangle className="text-destructive shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="font-bold text-destructive">Acção irreversível</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ao excluir este utilizador, o acesso ao sistema será revogado permanentemente. Todos os dados de sessão serão eliminados.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm">Para confirmar, escreva o nome completo do funcionário:</p>
                <p className="font-mono font-bold text-sm bg-muted px-3 py-2 rounded-lg">{staff.fullName}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Confirmar Nome</label>
                <input
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder={staff.fullName}
                  className="w-full p-2.5 bg-background border border-destructive/30 rounded-lg focus:ring-2 focus:ring-destructive/20 outline-none"
                />
              </div>

              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirm !== staff.fullName}
                className="w-full py-3 bg-destructive text-destructive-foreground font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {deleting ? <Loader2 className="animate-spin w-5 h-5" /> : <Trash2 size={18} />}
                Excluir Utilizador Permanentemente
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
