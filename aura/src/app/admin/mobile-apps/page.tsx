"use client";

import { useRouter } from "next/navigation";
import { Smartphone, ExternalLink } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";

const APPS = [
  { id: "governanta", label: "Governança",  description: "Gestão de quartos, tarefas e equipe de governança",  color: "#c084fc", path: "/governanta" },
  { id: "maid",       label: "Camareira",   description: "App da camareira — checklist de limpeza e arrumação", color: "#4ec9d4", path: "/maid" },
  { id: "manutencao", label: "Manutenção",  description: "Ordens de serviço e kanban de manutenção",           color: "#f59e0b", path: "/maintenance" },
  { id: "houseman",   label: "Mensageiro",  description: "Tarefas de áreas comuns e apoio operacional",         color: "#fb923c", path: "/houseman" },
  { id: "garcom",     label: "Garçom",      description: "Pedidos de mesa, café salão e comandas",              color: "#60a5fa", path: "/admin/cafe-salao" },
];

function MobileAppsContent() {
  const router = useRouter();

  return (
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
            onClick={() => router.push(`/admin/mobile-apps/${app.id}`)}
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
              <Smartphone size={20} style={{ color: app.color }} />
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
              Abrir preview
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MobileAppsPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "hr"]}>
      <MobileAppsContent />
    </RoleGuard>
  );
}
