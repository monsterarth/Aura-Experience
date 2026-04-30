"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Staff } from "@/types/aura";
import { StaffService } from "@/services/staff-service";
import {
  Moon, Sun, PanelLeftClose, PanelLeft,
  Loader2, Lock, Eye, EyeOff, Check, ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Props {
  userData: Staff;
  onRefresh: () => Promise<void>;
}

function ToggleSwitch({ active, loading }: { active: boolean; loading: boolean }) {
  return (
    <div
      className="relative flex items-center w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200"
      style={{ background: active ? "linear-gradient(135deg,#9b6dff,#4ec9d4)" : "var(--border)" }}
    >
      {loading ? (
        <Loader2 size={14} className="absolute text-white animate-spin transition-all duration-200" style={{ left: active ? 22 : 3 }} />
      ) : (
        <div className="absolute w-[18px] h-[18px] rounded-full bg-white shadow transition-all duration-200" style={{ left: active ? 23 : 3 }} />
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

export function SettingsView({ userData, onRefresh }: Props) {
  const router = useRouter();

  // Theme / sidebar prefs
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingSidebar, setSavingSidebar] = useState(false);
  const isLight = userData.uiTheme === "light";
  const sidebarCollapsed = userData.sidebarDefaultCollapsed ?? false;

  // Password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const toggleTheme = async () => {
    const newTheme = isLight ? "dark" : "light";
    setSavingTheme(true);
    try {
      await StaffService.updateStaff(userData.id, { uiTheme: newTheme });
      document.cookie = `aura-ui-theme=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
      await onRefresh();
      router.refresh();
    } catch {
      toast.error("Erro ao salvar preferência de tema.");
    } finally {
      setSavingTheme(false);
    }
  };

  const toggleSidebar = async () => {
    const newVal = !sidebarCollapsed;
    setSavingSidebar(true);
    try {
      await StaffService.updateStaff(userData.id, { sidebarDefaultCollapsed: newVal });
      localStorage.setItem("sidebar_collapsed", String(newVal));
      await onRefresh();
    } catch {
      toast.error("Erro ao salvar preferência de sidebar.");
    } finally {
      setSavingSidebar(false);
    }
  };

  const changePassword = async () => {
    if (!currentPw) { toast.error("Informe a senha atual."); return; }
    if (newPw.length < 6) { toast.error("A nova senha precisa ter pelo menos 6 caracteres."); return; }
    if (newPw !== confirmPw) { toast.error("As senhas não coincidem."); return; }

    setSavingPw(true);
    try {
      await StaffService.changePassword(userData.id, newPw, currentPw);
      toast.success("Senha alterada com sucesso!");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao alterar senha.");
    } finally {
      setSavingPw(false);
    }
  };

  const pwStrength = newPw.length === 0 ? null : newPw.length < 6 ? "fraca" : newPw.length < 10 ? "boa" : "forte";
  const pwStrengthColor = pwStrength === "fraca" ? "bg-red-500" : pwStrength === "boa" ? "bg-amber-400" : "bg-emerald-500";
  const pwStrengthWidth = pwStrength === "fraca" ? "w-1/3" : pwStrength === "boa" ? "w-2/3" : "w-full";

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/perfil"
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          Meu Perfil
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[13px] font-semibold text-foreground">Configurações</span>
      </div>

      {/* ── Segurança ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck size={16} className="text-purple-400 flex-shrink-0" />
          <span className="text-[13px] font-extrabold text-foreground uppercase tracking-wider">Segurança</span>
        </div>

        <SectionTitle>Alterar Senha</SectionTitle>

        <div className="space-y-3">
          {/* Senha atual */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Senha atual</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-muted border border-border rounded-xl pl-9 pr-10 py-2.5 text-[13px] text-foreground outline-none focus:border-purple-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Nova senha */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Nova senha</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-muted border border-border rounded-xl pl-9 pr-10 py-2.5 text-[13px] text-foreground outline-none focus:border-purple-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {/* Força da senha */}
            {pwStrength && (
              <div className="mt-2">
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${pwStrengthColor} ${pwStrengthWidth}`} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 capitalize">Senha {pwStrength}</p>
              </div>
            )}
          </div>

          {/* Confirmar */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Confirmar nova senha</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") changePassword(); }}
                placeholder="Repita a nova senha"
                className={`w-full bg-muted border rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-foreground outline-none transition-colors ${confirmPw && confirmPw !== newPw ? "border-red-500/50" : "border-border focus:border-purple-500/50"}`}
              />
              {confirmPw && confirmPw === newPw && (
                <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
              )}
            </div>
          </div>

          <button
            onClick={changePassword}
            disabled={savingPw || !currentPw || !newPw || !confirmPw}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40 mt-1"
            style={{ background: "linear-gradient(135deg,#9b6dff,#4ec9d4)" }}
          >
            {savingPw ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Alterar Senha
          </button>
        </div>
      </div>

      {/* ── Preferências ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <Sun size={16} className="text-amber-400 flex-shrink-0" />
          <span className="text-[13px] font-extrabold text-foreground uppercase tracking-wider">Preferências</span>
        </div>

        <div className="space-y-2">
          {/* Tema */}
          <button
            onClick={toggleTheme}
            disabled={savingTheme}
            className="flex items-center justify-between w-full px-4 py-3 bg-muted border border-border rounded-xl cursor-pointer gap-3 text-left hover:opacity-80 disabled:opacity-60 transition-opacity"
          >
            <div className="flex items-center gap-3">
              {isLight
                ? <Sun size={18} className="text-purple-400 flex-shrink-0" />
                : <Moon size={18} className="text-purple-400 flex-shrink-0" />
              }
              <div>
                <p className="text-[13px] font-bold text-foreground leading-tight">
                  {isLight ? "Modo Claro" : "Modo Escuro"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isLight ? "Interface em tons claros e aconchegantes" : "Interface em tons escuros (padrão)"}
                </p>
              </div>
            </div>
            <ToggleSwitch active={isLight} loading={savingTheme} />
          </button>

          {/* Sidebar */}
          <button
            onClick={toggleSidebar}
            disabled={savingSidebar}
            className="flex items-center justify-between w-full px-4 py-3 bg-muted border border-border rounded-xl cursor-pointer gap-3 text-left hover:opacity-80 disabled:opacity-60 transition-opacity"
          >
            <div className="flex items-center gap-3">
              {sidebarCollapsed
                ? <PanelLeftClose size={18} className="text-cyan-400 flex-shrink-0" />
                : <PanelLeft size={18} className="text-cyan-400 flex-shrink-0" />
              }
              <div>
                <p className="text-[13px] font-bold text-foreground leading-tight">
                  Sidebar recolhida por padrão
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {sidebarCollapsed
                    ? "Sidebar inicia recolhida em novos dispositivos"
                    : "Sidebar inicia expandida em novos dispositivos"
                  }
                </p>
              </div>
            </div>
            <ToggleSwitch active={sidebarCollapsed} loading={savingSidebar} />
          </button>
        </div>
      </div>
    </div>
  );
}
