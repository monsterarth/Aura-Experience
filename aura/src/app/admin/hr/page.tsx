"use client";

import { Users, Calendar, Cake, Palmtree, ArrowRight } from "lucide-react";
import Link from "next/link";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";

const STATS = [
  {
    label: "Equipe ativa",
    value: "—",
    icon: Users,
    color: "#9b6dff",
    description: "funcionários no turno",
  },
  {
    label: "Escalas esta semana",
    value: "—",
    icon: Calendar,
    color: "#4ec9d4",
    description: "turnos programados",
  },
  {
    label: "Aniversários",
    value: "—",
    icon: Cake,
    color: "#f472b6",
    description: "este mês",
  },
  {
    label: "Férias pendentes",
    value: "—",
    icon: Palmtree,
    color: "#fb923c",
    description: "aguardando aprovação",
  },
];

function HRDashboardContent() {
  const { userData } = useAuth();

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard RH</h1>
        <p className="text-white/50 text-sm mt-1">
          Visão geral da equipe · {userData?.fullName ?? ""}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl p-5 flex flex-col gap-3"
              style={{ background: "var(--card, #1c1c1c)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${stat.color}22` }}
              >
                <Icon size={18} style={{ color: stat.color }} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-white/50 mt-0.5">{stat.label}</div>
                <div className="text-xs text-white/30">{stat.description}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Coming soon banner */}
      <div
        className="rounded-xl p-6 flex flex-col items-center gap-3 text-center"
        style={{ background: "var(--card, #1c1c1c)", border: "1px solid rgba(155,109,255,0.2)" }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#9b6dff22,#4ec9d422)" }}
        >
          <Users size={22} style={{ color: "#9b6dff" }} />
        </div>
        <div>
          <p className="text-white font-medium">Dashboard RH em construção</p>
          <p className="text-white/40 text-sm mt-1">
            Métricas completas de equipe estarão disponíveis em breve.
          </p>
        </div>
        <div className="flex gap-3 mt-2">
          <Link
            href="/admin/staff"
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg text-white/80 hover:text-white transition-colors"
            style={{ background: "rgba(155,109,255,0.15)", border: "1px solid rgba(155,109,255,0.3)" }}
          >
            Gerenciar equipe <ArrowRight size={14} />
          </Link>
          <Link
            href="/admin/escalas"
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg text-white/80 hover:text-white transition-colors"
            style={{ background: "rgba(78,201,212,0.12)", border: "1px solid rgba(78,201,212,0.25)" }}
          >
            Ver escalas <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function HRDashboardPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "hr"]}>
      <HRDashboardContent />
    </RoleGuard>
  );
}
