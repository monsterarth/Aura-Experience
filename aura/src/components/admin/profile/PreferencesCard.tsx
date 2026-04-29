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
      // Set cookie for SSR anti-flash on next page load
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

  const T = { g1: "#9b6dff", g2: "#4ec9d4", grad: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)" };

  const ToggleSwitch = ({ active, loading }: { active: boolean; loading: boolean }) => (
    <div style={{
      width: 44, height: 24, borderRadius: 999,
      background: active ? T.grad : "var(--border)",
      position: "relative", cursor: "pointer",
      transition: "background .2s",
      flexShrink: 0,
      display: "flex", alignItems: "center", padding: "0 3px",
    }}>
      {loading ? (
        <Loader2 size={14} style={{ position: "absolute", left: active ? 22 : 3, color: "#fff", animation: "spin 1s linear infinite", transition: "left .2s" }} />
      ) : (
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          left: active ? 23 : 3,
          transition: "left .2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }} />
      )}
    </div>
  );

  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "20px",
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 16 }}>
        Preferências
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        disabled={savingTheme}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "12px 14px",
          background: "var(--muted)", border: "1px solid var(--border)",
          borderRadius: 12, cursor: "pointer", marginBottom: 8,
          gap: 12, fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isLight
            ? <Sun size={18} style={{ color: T.g1, flexShrink: 0 }} />
            : <Moon size={18} style={{ color: T.g1, flexShrink: 0 }} />
          }
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
              {isLight ? "Modo Claro" : "Modo Escuro"}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
              {isLight ? "Interface em tons claros e aconchegantes" : "Interface em tons escuros (padrão)"}
            </div>
          </div>
        </div>
        <ToggleSwitch active={isLight} loading={savingTheme} />
      </button>

      {/* Sidebar default state toggle */}
      <button
        onClick={toggleSidebar}
        disabled={savingSidebar}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "12px 14px",
          background: "var(--muted)", border: "1px solid var(--border)",
          borderRadius: 12, cursor: "pointer",
          gap: 12, fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {sidebarCollapsed
            ? <PanelLeftClose size={18} style={{ color: T.g2, flexShrink: 0 }} />
            : <PanelLeft size={18} style={{ color: T.g2, flexShrink: 0 }} />
          }
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
              Sidebar recolhida por padrão
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
              {sidebarCollapsed ? "Sidebar inicia recolhida em novos dispositivos" : "Sidebar inicia expandida em novos dispositivos"}
            </div>
          </div>
        </div>
        <ToggleSwitch active={sidebarCollapsed} loading={savingSidebar} />
      </button>
    </div>
  );
}
