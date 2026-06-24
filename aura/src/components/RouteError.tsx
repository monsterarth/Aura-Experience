"use client";

import { useEffect } from "react";

// Componente de fallback compartilhado pelos error.tsx de cada segmento (apps de campo, admin e
// portal do hóspede). Converte uma exceção de render — que em produção mostraria a tela crua
// "Application error: a client-side exception has occurred" — numa tela recuperável (Tentar de
// novo / Recarregar / opcional voltar). Mostra a mensagem do erro: um print já diz o que quebrou.
export default function RouteError({
  error,
  reset,
  variant = "dark",
  homeHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  variant?: "dark" | "guest";
  homeHref?: string;
}) {
  useEffect(() => {
    console.error("[RouteError]", error);
  }, [error]);

  const guest = variant === "guest";
  const c = guest
    ? { bg: "#f6f5f2", fg: "#1a1a1a", muted: "rgba(0,0,0,0.5)", card: "#ffffff", border: "rgba(0,0,0,0.1)", accent: "#1a1a1a" }
    : { bg: "#0a0a0a", fg: "#eef0f8", muted: "rgba(238,240,248,0.5)", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", accent: "#7c3aed" };

  return (
    <div style={{ minHeight: "100dvh", background: c.bg, color: c.fg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 28, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", textAlign: "center" }}>
      <div style={{ fontSize: 40, lineHeight: 1 }}>⚠️</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>Algo deu errado</div>
      <div style={{ fontSize: 13, color: c.muted, maxWidth: 320, lineHeight: 1.5 }}>
        Encontramos um problema ao carregar esta tela. Tente novamente.
      </div>

      {/* Mensagem técnica visível — um print pelo celular já mostra a causa para o suporte. */}
      <div style={{ width: "100%", maxWidth: 360, background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: "10px 12px", fontSize: 11, color: c.muted, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-word", maxHeight: 120, overflowY: "auto" }}>
        {error?.message || "Erro desconhecido"}{error?.digest ? ` · ${error.digest}` : ""}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 360, marginTop: 4 }}>
        <button onClick={() => reset()} style={{ width: "100%", padding: 14, background: c.accent, color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800 }}>
          Tentar novamente
        </button>
        <button onClick={() => { if (typeof window !== "undefined") window.location.reload(); }} style={{ width: "100%", padding: 12, background: "transparent", color: c.fg, border: `1px solid ${c.border}`, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
          Recarregar
        </button>
        {homeHref && (
          <button onClick={() => { if (typeof window !== "undefined") window.location.href = homeHref; }} style={{ width: "100%", padding: 12, background: "transparent", color: c.muted, border: "none", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>
            {homeHref === "/admin/login" ? "Ir para o login" : "Início"}
          </button>
        )}
      </div>
    </div>
  );
}
