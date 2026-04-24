"use client";

import { useRouter } from "next/navigation";
import { Smartphone, ExternalLink, UtensilsCrossed, X, ArrowRight, Key } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useRef, useEffect } from "react";

const APPS = [
  { id: "governanta", label: "Governança",       description: "Gestão de quartos, tarefas e equipe de governança",   color: "#c084fc", icon: "staff" },
  { id: "maid",       label: "Camareira",        description: "App da camareira — checklist de limpeza e arrumação",  color: "#4ec9d4", icon: "staff" },
  { id: "manutencao", label: "Manutenção",       description: "Ordens de serviço e kanban de manutenção",            color: "#f59e0b", icon: "staff" },
  { id: "houseman",   label: "Mensageiro",       description: "Tarefas de áreas comuns e apoio operacional",          color: "#fb923c", icon: "staff" },
  { id: "garcom",     label: "Garçom",           description: "Pedidos de mesa, café salão e comandas",              color: "#60a5fa", icon: "staff" },
  { id: "hospede",    label: "Portal do Hóspede", description: "Visualize o portal do hóspede com um código de reserva", color: "#2dd4bf", icon: "guest" },
];

function GuestCodeModal({ onConfirm, onClose }: { onConfirm: (code: string) => void; onClose: () => void }) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length >= 5) onConfirm(code.trim().toUpperCase());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-6 relative"
        style={{ background: "#1c1c1c", border: "1px solid rgba(45,212,191,0.25)", boxShadow: "0 32px 64px rgba(0,0,0,0.5)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(45,212,191,0.12)", border: "1px solid rgba(45,212,191,0.25)" }}>
            <Key size={18} style={{ color: "#2dd4bf" }} />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Portal do Hóspede</div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Digite o código de acesso da reserva</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ex: A3KN7PQ2"
            maxLength={8}
            className="w-full rounded-xl px-4 py-3 text-center text-2xl font-black tracking-[0.3em] uppercase outline-none transition-all placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:normal-case"
            style={{
              background: "#111",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(45,212,191,0.5)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
          />
          <button
            type="submit"
            disabled={code.length < 5}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "rgba(45,212,191,0.15)", color: "#2dd4bf", border: "1px solid rgba(45,212,191,0.3)" }}
          >
            Abrir preview
            <ArrowRight size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

function MobileAppsContent() {
  const router = useRouter();
  const [showGuestModal, setShowGuestModal] = useState(false);

  const handleAppClick = (id: string) => {
    if (id === "hospede") {
      setShowGuestModal(true);
    } else {
      router.push(`/admin/mobile-apps/${id}`);
    }
  };

  const handleGuestConfirm = (code: string) => {
    setShowGuestModal(false);
    router.push(`/admin/mobile-apps/hospede?code=${code}`);
  };

  return (
    <>
      <div className="p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Apps Mobile</h1>
          <p className="text-white/50 text-sm mt-1">
            Visualize e teste os aplicativos móveis da equipe operacional.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {APPS.map((app) => (
            <button
              key={app.id}
              onClick={() => handleAppClick(app.id)}
              className="text-left rounded-xl p-5 flex flex-col gap-4 transition-all hover:scale-[1.02] active:scale-[0.99]"
              style={{
                background: "var(--card, #1c1c1c)",
                border: `1px solid ${app.color}33`,
                cursor: "pointer",
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: `${app.color}18` }}
              >
                {app.icon === "guest"
                  ? <Key size={20} style={{ color: app.color }} />
                  : <Smartphone size={20} style={{ color: app.color }} />}
              </div>
              <div>
                <div className="text-sm font-bold text-white">{app.label}</div>
                <div className="text-xs text-white/40 mt-1 leading-relaxed">{app.description}</div>
              </div>
              <div
                className="flex items-center gap-1 text-xs font-semibold mt-auto"
                style={{ color: app.color }}
              >
                <ExternalLink size={11} />
                {app.id === "hospede" ? "Inserir código" : "Abrir preview"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {showGuestModal && (
        <GuestCodeModal
          onConfirm={handleGuestConfirm}
          onClose={() => setShowGuestModal(false)}
        />
      )}
    </>
  );
}

export default function MobileAppsPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "hr"]}>
      <MobileAppsContent />
    </RoleGuard>
  );
}
