"use client";

import { PageShell, PageHeader, PageSkeleton, EmptyState, Pill } from "@/components/aura";

import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, RotateCcw, Key, Smartphone } from "lucide-react";
import { useRef, useState, Suspense } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";

const APP_META: Record<string, { label: string; path: string; color: string }> = {
  diretoria:  { label: "Diretoria",          path: "/director",     color: "#9b6dff" },
  governanta: { label: "Governança",        path: "/governanta",   color: "#c084fc" },
  maid:       { label: "Camareira",         path: "/maid",         color: "#4ec9d4" },
  manutencao:         { label: "Manutenção — Técnico",      path: "/maintenance",     color: "#f59e0b" },
  "manutencao-ops":   { label: "Manutenção — Coordenador", path: "/maintenance-ops", color: "#fb923c" },
  houseman:           { label: "Mensageiro",               path: "/houseman",        color: "#fb923c" },
  garcom:     { label: "Garçom",            path: "/waiter",       color: "#60a5fa" },
  hospede:    { label: "Portal do Hóspede", path: "/check-in",     color: "#2dd4bf" },
};

function PhoneMockup({ src, color }: { src: string; color: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Phone shell */}
      <div
        className="relative"
        style={{
          width: 375,
          background: "#0a0a0a",
          borderRadius: 46,
          padding: "14px 12px",
          boxShadow: `0 0 0 2px #222, 0 0 0 4px #333, 0 32px 64px rgba(0,0,0,0.6), 0 0 80px ${color}22`,
          border: `1px solid #333`,
        }}
      >
        {/* Notch */}
        <div
          style={{
            width: 120, height: 28, borderRadius: 999,
            background: "#0a0a0a",
            margin: "0 auto 10px",
            border: "1px solid #222",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1a1a1a", border: "1px solid #2a2a2a" }} />
          <div style={{ width: 40, height: 4, borderRadius: 999, background: "#1a1a1a" }} />
        </div>

        {/* Screen */}
        <div
          style={{
            borderRadius: 32,
            overflow: "hidden",
            height: 720,
            background: "#000",
            position: "relative",
          }}
        >
          <iframe
            key={key}
            ref={iframeRef}
            src={src}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            title="Mobile app preview"
          />
        </div>

        {/* Home bar */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
          <div style={{ width: 120, height: 4, borderRadius: 999, background: "#333" }} />
        </div>
      </div>

      {/* Controls */}
      <button
        onClick={() => setKey(k => k + 1)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <RotateCcw size={13} />
        Recarregar
      </button>
    </div>
  );
}

function AppPreviewContent({ appId }: { appId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meta = APP_META[appId];

  if (!meta) {
    return (
      <PageShell><EmptyState icon={Smartphone} title="App não encontrado" action={{ label: "Voltar", href: "/admin/mobile-apps" }} /></PageShell>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  let iframeSrc: string;
  let externalHref: string;

  if (appId === "hospede") {
    const code = searchParams.get("code");
    if (!code) {
      return (
        <PageShell><EmptyState icon={Key} title="Código de acesso não informado" action={{ label: "Voltar e inserir código", href: "/admin/mobile-apps" }} /></PageShell>
      );
    }
    iframeSrc = `${origin}/check-in/${code}`;
    externalHref = `/check-in/${code}`;
  } else {
    iframeSrc = `${origin}${meta.path}`;
    externalHref = meta.path;
  }

  return (
    <PageShell>
      <PageHeader
        back={{ onClick: () => router.push("/admin/mobile-apps"), label: "Apps Mobile" }}
        title={meta.label}
        badge={appId === "hospede" && searchParams.get("code") ? <Pill tone="green" label={searchParams.get("code") ?? ""} /> : undefined}
        actions={(
          <a href={externalHref} target="_blank" rel="noopener noreferrer" className="ak-btn ak-press" data-variant="secondary" data-size="md" style={{ textDecoration: "none" }}>
            <span className="ak-btn__content"><span className="ak-btn__icon"><ExternalLink size={14} /></span><span className="ak-btn__label">Abrir em tela cheia</span></span>
          </a>
        )}
      />

      {/* Phone preview */}
      <div className="flex justify-center pt-2">
        <PhoneMockup src={iframeSrc} color={meta.color} />
      </div>
    </PageShell>
  );
}

function AppPreviewWithSuspense({ appId }: { appId: string }) {
  return (
    <Suspense fallback={<PageShell><PageSkeleton kpis={0} rows={4} /></PageShell>}>
      <AppPreviewContent appId={appId} />
    </Suspense>
  );
}

export default function AppPreviewPage({ params }: { params: { app: string } }) {
  const { app } = params;
  const { impersonating } = useAuth();

  if (impersonating) {
    return <AppPreviewWithSuspense appId={app} />;
  }

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager"]}>
      <AppPreviewWithSuspense appId={app} />
    </RoleGuard>
  );
}
