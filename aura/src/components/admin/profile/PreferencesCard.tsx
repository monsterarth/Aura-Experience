"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Staff } from "@/types/aura";
import { StaffService } from "@/services/staff-service";
import { Moon, Sun, PanelLeftClose, PanelLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userData: Staff;
  onRefresh: () => Promise<void>;
}

function ToggleSwitch({ active, loading }: { active: boolean; loading: boolean }) {
  return (
    <div
      className="relative flex items-center w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200"
      style={{
        background: active
          ? "linear-gradient(135deg,#9b6dff,#4ec9d4)"
          : "var(--border)",
      }}
    >
      {loading ? (
        <Loader2
          size={14}
          className="absolute text-white animate-spin transition-all duration-200"
          style={{ left: active ? 22 : 3 }}
        />
      ) : (
        <div
          className="absolute w-[18px] h-[18px] rounded-full bg-white shadow transition-all duration-200"
          style={{ left: active ? 23 : 3 }}
        />
      )}
    </div>
  );
}

export function PreferencesCard({ userData, onRefresh }: Props) {
  const router = useRouter();
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingSidebar, setSavingSidebar] = useState(false);

  const isLight = userData.uiTheme === "light";
  const sidebarCollapsed = userData.sidebarDefaultCollapsed ?? false;

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

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-[13px] font-extrabold text-foreground uppercase tracking-wider mb-4">
        Preferências
      </p>

      <div className="space-y-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          disabled={savingTheme}
          className="flex items-center justify-between w-full px-4 py-3 bg-muted border border-border rounded-xl cursor-pointer gap-3 text-left transition-opacity hover:opacity-80 disabled:opacity-60"
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

        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          disabled={savingSidebar}
          className="flex items-center justify-between w-full px-4 py-3 bg-muted border border-border rounded-xl cursor-pointer gap-3 text-left transition-opacity hover:opacity-80 disabled:opacity-60"
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
  );
}
