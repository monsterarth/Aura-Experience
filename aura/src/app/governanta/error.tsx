"use client";

import { useEffect } from "react";

// Error boundary do segmento /governanta.
// Sem isto, qualquer exceção de render no app da governanta cai no boundary raiz do Next, que
// em produção mostra apenas "Application error: a client-side exception has occurred (see the
// browser console for more information)" — inútil para uma camareira/governanta no celular, que
// não abre console. Aqui mostramos uma tela recuperável (Tentar de novo / Recarregar / Sair) e
// exibimos a mensagem do erro na própria tela: um print do dispositivo já diz o que quebrou.
export default function GovernantaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Governanta] erro de renderização:", error);
  }, [error]);

  return (
    <div
      style={{
        height: "100dvh",
        background: "#080b14",
        color: "#eef0f8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 28,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'DM Sans', sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "rgba(248,113,113,0.1)",
          border: "1px solid rgba(248,113,113,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <div style={{ fontSize: 18, fontWeight: 900 }}>Algo deu errado</div>
      <div style={{ fontSize: 13, color: "rgba(238,240,248,0.55)", maxWidth: 320, lineHeight: 1.5 }}>
        O app encontrou um problema ao carregar. Tente novamente — se persistir, recarregue a página.
      </div>

      {/* Mensagem técnica visível: um print pelo celular já mostra a causa para o suporte. */}
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "10px 12px",
          fontSize: 11,
          color: "rgba(238,240,248,0.5)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          wordBreak: "break-word",
          maxHeight: 120,
          overflowY: "auto",
        }}
      >
        {error?.message || "Erro desconhecido"}
        {error?.digest ? ` · ${error.digest}` : ""}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 360, marginTop: 4 }}>
        <button
          onClick={() => reset()}
          style={{
            width: "100%",
            padding: 15,
            background: "linear-gradient(135deg,#a78bfa 0%,#7c3aed 100%)",
            color: "#fff",
            border: "none",
            borderRadius: 16,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}
        >
          Tentar novamente
        </button>
        <button
          onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
          style={{
            width: "100%",
            padding: 14,
            background: "rgba(255,255,255,0.055)",
            color: "#eef0f8",
            border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: 16,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Recarregar página
        </button>
        <button
          onClick={() => {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 3000);
            fetch("/api/auth/signout", { method: "POST", signal: ctrl.signal })
              .catch(() => {})
              .finally(() => {
                if (typeof window !== "undefined") window.location.href = "/admin/login";
              });
          }}
          style={{
            width: "100%",
            padding: 12,
            background: "transparent",
            color: "rgba(248,113,113,0.85)",
            border: "none",
            borderRadius: 16,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Sair do aplicativo
        </button>
      </div>
    </div>
  );
}
