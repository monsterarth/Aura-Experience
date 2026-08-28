"use client";

// App da guarita — quatro abas: painel do turno, registrar entrada, pátio e
// fechamento. Ver docs/GUARITA.md.
import React, { useState } from "react";
import { Toaster } from "sonner";
import { T } from "./_components/guarita-ui";
import { useGuarita } from "./_components/useGuarita";
import { PainelTab } from "./_components/PainelTab";
import { RegistroTab } from "./_components/RegistroTab";
import { PatioTab } from "./_components/PatioTab";
import { TurnoTab } from "./_components/TurnoTab";

type Tab = "painel" | "registro" | "patio" | "turno";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "painel", label: "Painel",
    icon: <path d="M4 5h7v6H4zM13 5h7v4h-7zM4 13h7v6H4zM13 11h7v8h-7z" />,
  },
  {
    id: "registro", label: "Registrar",
    icon: <path d="M5 11l1.6-4.2A2 2 0 018.5 5.5h7a2 2 0 011.9 1.3L19 11M5 11h14v6H5zM7 17v1.5M17 17v1.5" />,
  },
  {
    id: "patio", label: "Pátio",
    icon: <path d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    id: "turno", label: "Turno",
    icon: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3.2 2" />,
  },
];

export default function PorterPage() {
  const g = useGuarita();
  const [tab, setTab] = useState<Tab>("painel");

  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const initial = (g.userData?.fullName ?? "G").charAt(0).toUpperCase();

  return (
    <div style={{
      minHeight: "100dvh", background: T.bg, color: T.text,
      fontFamily: "var(--font-dm-sans), 'DM Sans', ui-sans-serif, system-ui, sans-serif",
      display: "flex", flexDirection: "column",
      paddingBottom: "calc(66px + env(safe-area-inset-bottom, 0px))",
    }}>
      <Toaster position="top-center" theme="dark" richColors />

      {/* Cabeçalho */}
      <header style={{
        padding: "18px 16px 14px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        position: "sticky", top: 0, background: T.bg, zIndex: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Guarita</div>
          <div style={{ fontSize: 12, color: T.muted, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {today}{g.userData?.fullName ? ` · ${g.userData.fullName.split(" ")[0]}` : ""}
          </div>
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: "50%", background: T.grad, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 15, color: "#0b0d14",
        }}>{initial}</div>
      </header>

      {/* Conteúdo */}
      <main style={{ flex: 1, paddingTop: 16 }}>
        {g.loading ? (
          <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 14 }}>Carregando…</div>
        ) : g.disabled ? (
          // Módulo não contratado. Sem isto a tela abriria com o pátio vazio e
          // o turno zerado — indistinguível de um dia parado.
          <div style={{ padding: "48px 28px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={T.muted2} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" />
            </svg>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Guarita desligada</div>
            <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, maxWidth: 280 }}>
              Esta pousada não tem o módulo de estacionamento ativo. Fale com a gerência — liga em
              Configurações → Módulos.
            </div>
          </div>
        ) : tab === "painel" ? (
          <PainelTab g={g} onRegister={() => setTab("registro")} />
        ) : tab === "registro" ? (
          <RegistroTab g={g} onDone={() => setTab("painel")} />
        ) : tab === "patio" ? (
          <PatioTab g={g} />
        ) : (
          <TurnoTab g={g} />
        )}
      </main>

      {/* Navegação */}
      <nav style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20,
        height: "calc(66px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        borderTop: `1px solid ${T.border}`, background: "#0a0d16",
        display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", alignItems: "center",
      }}>
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
              color: on ? T.g1 : T.muted,
            }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
              <span style={{ fontSize: 10, fontWeight: 700 }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
