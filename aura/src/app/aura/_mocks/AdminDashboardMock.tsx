// Mock fiel do back-office (identidade T: dark glass + gradiente roxo→teal de
// src/lib/admin-tokens.ts). Só markup + hover CSS — nada de estado, roda como
// server component dentro da home institucional.
import React from "react";
import Image from "next/image";
import {
  BarChart3,
  BedDouble,
  Boxes,
  Briefcase,
  Building2,
  Coffee,
  LogIn,
  LogOut,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

const NAV = [
  { icon: Building2, label: "Recepção", active: true },
  { icon: BedDouble, label: "Estadias" },
  { icon: Briefcase, label: "Comercial" },
  { icon: Users, label: "Governança" },
  { icon: Wrench, label: "Manutenção" },
  { icon: Coffee, label: "Café & Salão" },
  { icon: Boxes, label: "Estoque" },
  { icon: BarChart3, label: "Pesquisas" },
];

const KPIS = [
  {
    icon: LogIn,
    label: "Chegadas hoje",
    value: "4/6",
    sub: "2 já acomodadas",
    color: "#2dd4bf",
    bg: "rgba(45,212,191,0.08)",
    border: "rgba(45,212,191,0.22)",
  },
  {
    icon: LogOut,
    label: "Saídas",
    value: "3/4",
    sub: "1 pendente",
    color: "#9b6dff",
    bg: "rgba(155,109,255,0.10)",
    border: "rgba(155,109,255,0.22)",
  },
  {
    icon: Sparkles,
    label: "Faxinas abertas",
    value: "7",
    sub: "3 em andamento",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.22)",
  },
];

const CELLS: { n: string; status: string; color: string }[] = [
  { n: "01", status: "Ocupado", color: "#60a5fa" },
  { n: "02", status: "Ocupado", color: "#60a5fa" },
  { n: "03", status: "Livre", color: "#4b5563" },
  { n: "04", status: "Faxina", color: "#c084fc" },
  { n: "05", status: "Ocupado", color: "#60a5fa" },
  { n: "06", status: "Check-out", color: "#f59e0b" },
  { n: "07", status: "Ocupado", color: "#60a5fa" },
  { n: "08", status: "Livre", color: "#4b5563" },
  { n: "09", status: "Bloqueio", color: "#f87171" },
  { n: "10", status: "Ocupado", color: "#60a5fa" },
  { n: "11", status: "Faxina", color: "#c084fc" },
  { n: "12", status: "Check-in", color: "#2dd4bf" },
];

const LEGEND = [
  { label: "Ocupado", color: "#60a5fa" },
  { label: "Livre", color: "#4b5563" },
  { label: "Faxina", color: "#c084fc" },
  { label: "Check-out", color: "#f59e0b" },
  { label: "Bloqueio", color: "#f87171" },
  { label: "Check-in", color: "#2dd4bf" },
];

export function AdminDashboardMock() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#141414] overflow-hidden shadow-2xl shadow-black/50">
      {/* window bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#1a1a1a]">
        <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        <span className="ml-4 text-xs text-gray-500 font-mono">
          aaura.app.br / admin / reception
        </span>
      </div>

      <div className="grid grid-cols-4 min-h-[360px]">
        {/* sidebar */}
        <div className="col-span-1 border-r border-white/[0.07] bg-[#111111] p-3.5 hidden md:block">
          <div className="flex items-center gap-2 px-2 pb-3 mb-2 border-b border-white/[0.07]">
            <div className="relative w-7 h-7 shrink-0 drop-shadow-[0_0_8px_rgba(224,255,255,0.25)]">
              <Image src="/logo_transp.PNG" alt="Aura" fill className="object-contain" />
            </div>
            <div className="leading-none">
              <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-transparent bg-clip-text bg-gradient-to-r from-[#9b6dff] to-[#4ec9d4]">
                Aura
              </span>
              <span className="block text-[6px] font-bold uppercase tracking-[0.25em] text-[#eef0f8]/30 font-mono mt-0.5">
                Software
              </span>
            </div>
          </div>
          <p className="px-2 mb-1.5 text-[8px] font-extrabold uppercase tracking-[0.18em] text-[#eef0f8]/25">
            Operação
          </p>
          <div className="space-y-0.5">
            {NAV.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[11px] font-medium transition-colors cursor-default ${
                  active
                    ? "text-[#eef0f8] border border-[#9b6dff]/25"
                    : "text-[#eef0f8]/40 border border-transparent hover:bg-white/[0.055] hover:text-[#eef0f8]/75"
                }`}
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg,rgba(155,109,255,0.15) 0%,rgba(78,201,212,0.15) 100%)",
                      }
                    : undefined
                }
              >
                <Icon size={13} style={active ? { color: "#9b6dff" } : undefined} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* main */}
        <div className="col-span-4 md:col-span-3 p-5 space-y-4 bg-[#141414]">
          {/* header */}
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black tracking-tight text-[#eef0f8]">
              Recepção
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-[#eef0f8]/40 font-mono">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2dd4bf] opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#2dd4bf]" />
              </span>
              ao vivo · hoje
            </div>
          </div>

          {/* KPIs — o padrão real: tile de ícone + glow radial + valor 900 */}
          <div className="grid grid-cols-3 gap-3">
            {KPIS.map(({ icon: Icon, label, value, sub, color, bg, border }) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-xl bg-[#1c1c1c] border border-white/[0.07] hover:border-white/[0.16] p-3.5 transition-colors"
              >
                <div
                  className="absolute -top-5 -right-5 w-16 h-16 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${color}22 0%, transparent 70%)` }}
                />
                <div
                  className="w-7 h-7 rounded-[9px] flex items-center justify-center mb-2.5"
                  style={{ background: bg, border: `1px solid ${border}` }}
                >
                  <Icon size={13} style={{ color }} strokeWidth={1.8} />
                </div>
                <p
                  className="text-[22px] font-black leading-none tracking-[-0.5px]"
                  style={{ color }}
                >
                  {value}
                </p>
                <p className="text-[10px] font-bold text-[#eef0f8] mt-1.5">{label}</p>
                <p className="text-[9px] text-[#eef0f8]/40 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* mapa de acomodações */}
          <div className="rounded-xl bg-[#1c1c1c] border border-white/[0.07] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#eef0f8]/80">
                Mapa de Acomodações
              </span>
              <span className="text-[9px] text-[#eef0f8]/35 font-mono">
                atualiza em tempo real
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {CELLS.map(({ n, status, color }) => (
                <div key={n} className="group relative">
                  <div
                    className="aspect-square rounded-md flex items-center justify-center text-[9px] font-bold transition-transform duration-150 group-hover:scale-110 group-hover:z-10 cursor-default"
                    style={{
                      backgroundColor: color + "22",
                      border: `1px solid ${color}55`,
                      color,
                    }}
                  >
                    {n}
                  </div>
                  {/* tooltip — aparece no hover, como no mapa real */}
                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-7 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <div className="whitespace-nowrap rounded-md bg-[#0b0b0f] border border-white/15 px-2 py-1 text-[9px] font-semibold text-[#eef0f8] shadow-lg">
                      Chalé {n} · <span style={{ color }}>{status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-3 flex-wrap">
              {LEGEND.map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-[9px] text-[#eef0f8]/40">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
