// Mock fiel do app da camareira (/maid): mesma identidade T do app real —
// fundo azul-escuro, pills de tipo/chave, chips de checklist, observação em
// âmbar e o botão Iniciar no gradiente roxo→teal com glow. Só CSS hover.
import React from "react";
import { ArrowRight, Bell, Info, Key, Moon, X } from "lucide-react";

export function MaidAppMock() {
  return (
    <div className="w-72 rounded-[28px] border border-white/10 bg-[#0d1020] overflow-hidden shadow-2xl shadow-[#9b6dff]/10">
      {/* header: saudação + anel de progresso (como no app real) */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#9b6dff] to-[#4ec9d4] flex items-center justify-center text-[11px] font-black text-white">
            M
          </div>
          <div>
            <p className="text-[13px] font-extrabold text-[#eef0f8] leading-none">
              Olá, Maria
            </p>
            <p className="text-[9px] text-[#eef0f8]/40 mt-1">5 faxinas hoje</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Bell size={14} className="text-[#eef0f8]/40" />
          {/* progress ring 2/5 */}
          <div className="relative w-11 h-11">
            <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
              <defs>
                <linearGradient id="maid-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#9b6dff" />
                  <stop offset="100%" stopColor="#4ec9d4" />
                </linearGradient>
              </defs>
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
              <circle
                cx="22" cy="22" r="18" fill="none"
                stroke="url(#maid-ring)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18 * 0.4} ${2 * Math.PI * 18}`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-[#eef0f8]">
              2/5
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* tarefa expandida — o card real */}
        <div className="rounded-2xl bg-[#111827] border border-white/[0.07] hover:border-white/[0.16] p-4 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[15px] font-black text-[#eef0f8] tracking-tight">
              Chalé Ipê
            </span>
            <span className="text-[8.5px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-[#c084fc]/10 text-[#c084fc] border border-[#c084fc]/25">
              Saída Completa
            </span>
          </div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#2dd4bf]/10 text-[#2dd4bf] border border-[#2dd4bf]/25">
              <Key size={9} /> Chave: Recepção
            </span>
            <span className="text-[9px] text-[#eef0f8]/35">Check-in às 15h</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2.5">
            {["Enxoval", "Banheiro", "Frigobar"].map((c) => (
              <span
                key={c}
                className="text-[9px] px-2 py-[3px] rounded-md bg-white/[0.08] text-[#eef0f8]/50 border border-white/[0.07]"
              >
                {c}
              </span>
            ))}
            <span className="text-[9px] px-2 py-[3px] rounded-md bg-white/[0.08] text-[#eef0f8]/50 border border-white/[0.07]">
              +4 itens
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/25 px-2.5 py-2 mb-3">
            <Info size={11} className="text-[#f59e0b] mt-[1px] shrink-0" />
            <span className="text-[9.5px] font-semibold text-[#f59e0b] leading-snug">
              Hóspede pediu toalhas extras
            </span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/25 text-[#f59e0b] text-[10px] font-extrabold uppercase tracking-wide">
              <X size={11} /> Pular
            </button>
            <button className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-[10.5px] font-extrabold uppercase tracking-wide bg-gradient-to-br from-[#9b6dff] to-[#4ec9d4] shadow-[0_4px_20px_rgba(155,109,255,0.35)] transition-transform duration-150 hover:-translate-y-[1px]">
              Iniciar <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* tarefa condensada */}
        <div className="rounded-2xl bg-[#111827] border border-white/[0.07] hover:border-white/[0.16] p-3.5 flex items-center justify-between transition-colors">
          <div>
            <p className="text-[12.5px] font-extrabold text-[#eef0f8]">Chalé Lavanda</p>
            <p className="text-[9px] text-[#eef0f8]/40 mt-0.5">Arrumação Rápida</p>
          </div>
          <span className="text-[8.5px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full bg-[#60a5fa]/10 text-[#60a5fa] border border-[#60a5fa]/25">
            Pendente
          </span>
        </div>

        {/* alerta DND em tempo real */}
        <div className="rounded-xl bg-[#4ec9d4]/[0.07] border border-[#4ec9d4]/25 p-3 flex items-center gap-2.5">
          <Moon size={13} className="text-[#4ec9d4] shrink-0" />
          <p className="text-[9.5px] text-[#eef0f8]/60 leading-snug">
            <span className="text-[#4ec9d4] font-bold">Chalé Girassol</span> — hóspede
            ativou o Não Perturbe agora
          </p>
        </div>
      </div>
    </div>
  );
}
