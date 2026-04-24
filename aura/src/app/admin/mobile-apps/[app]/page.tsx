"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, RotateCcw, Key } from "lucide-react";
import { useRef, useState, Suspense } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

const APP_META: Record<string, { label: string; path: string; color: string }> = {
  governanta: { label: "Governança",        path: "/governanta",   color: "#c084fc" },
  maid:       { label: "Camareira",         path: "/maid",         color: "#4ec9d4" },
  manutencao: { label: "Manutenção",        path: "/maintenance",  color: "#f59e0b" },
  houseman:   { label: "Mensageiro",        path: "/houseman",     color: "#fb923c" },
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-white/40">
        <p>App não encontrado.</p>
        <Link href="/admin/mobile-apps" className="text-sm underline">Voltar</Link>
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  let iframeSrc: string;
  let externalHref: string;

  if (appId === "hospede") {
    const code = searchParams.get("code");
    if (!code) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-white/40">
          <Key size={32} style={{ color: "#2dd4bf", opacity: 0.5 }} />
          <p>Código de acesso não informado.</p>
          <Link href="/admin/mobile-apps" className="text-sm underline text-teal-400">Voltar e inserir código</Link>
        </div>
      );
    }
    iframeSrc = `${origin}/check-in/${code}`;
    externalHref = `/check-in/${code}`;
  } else {
    iframeSrc = `${origin}${meta.path}`;
    externalHref = meta.path;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/admin/mobile-apps")}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft size={15} />
          Apps Mobile
        </button>
        <span className="text-white/20">/</span>
        <span className="text-sm font-semibold text-white">{meta.label}</span>
        {appId === "hospede" && searchParams.get("code") && (
          <>
            <span className="text-white/20">/</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ background: "rgba(45,212,191,0.1)", color: "#2dd4bf", border: "1px solid rgba(45,212,191,0.2)" }}>
              {searchParams.get("code")}
            </span>
          </>
        )}
        <a
          href={externalHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}33` }}
        >
          <ExternalLink size={11} />
          Abrir em tela cheia
        </a>
      </div>

      {/* Phone preview */}
      <div className="flex justify-center pt-2">
        <PhoneMockup src={iframeSrc} color={meta.color} />
      </div>
    </div>
  );
}

function AppPreviewWithSuspense({ appId }: { appId: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh] text-white/30 text-sm">Carregando…</div>}>
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
    <RoleGuard allowedRoles={["super_admin", "admin", "hr"]}>
      <AppPreviewWithSuspense appId={app} />
    </RoleGuard>
  );
}
