import type { Metadata } from "next";
import React from "react";
import { ArrowLeft, Sparkles, Zap, Wrench, TrendingUp } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Changelog — Aura Software",
  description: "Histórico de versões e atualizações da plataforma Aura.",
};

/* ─── types ────────────────────────────────────────────────────── */

type EntryType = "feature" | "improvement" | "fix";

interface Entry {
  type: EntryType;
  text: string;
}

interface Release {
  version: string;
  date: string;
  label: string;
  highlight?: string; // optional badge text
  entries: Entry[];
}

/* ─── data ─────────────────────────────────────────────────────── */

const releases: Release[] = [
  {
    version: "v2.5",
    date: "22 de maio de 2026",
    label: "Portal Multilíngue & Eventos",
    highlight: "Mais recente",
    entries: [
      { type: "feature",     text: "Portal do hóspede disponível em Português, Inglês e Espanhol" },
      { type: "feature",     text: "Detecção automática do idioma pelo código de país do dispositivo" },
      { type: "feature",     text: "Módulo de Eventos visível no portal com filtro por data" },
      { type: "improvement", text: "Performance de carregamento do portal melhorada em ~40%" },
      { type: "improvement", text: "Tipografia e espaçamentos do portal revisados para mobile" },
    ],
  },
  {
    version: "v2.4",
    date: "15 de maio de 2026",
    label: "Módulo de Eventos",
    entries: [
      { type: "feature",     text: "Criação e gestão de eventos internos e externos no painel admin" },
      { type: "feature",     text: "Calendário unificado com reservas, estadias e eventos" },
      { type: "feature",     text: "Status de evento: rascunho → publicado → cancelado" },
      { type: "feature",     text: "Campo de visibilidade: todos os hóspedes, internos ou privado" },
      { type: "improvement", text: "Sidebar do admin reorganizada com nova seção de Comunicação" },
    ],
  },
  {
    version: "v2.3",
    date: "8 de maio de 2026",
    label: "App Garçom & Restaurante",
    entries: [
      { type: "feature",     text: "App mobile dedicado para garçons com pedidos por mesa" },
      { type: "feature",     text: "Cardápio digital com QR Code para hóspedes" },
      { type: "feature",     text: "Controle de café da manhã com lista de confirmados por dia" },
      { type: "fix",         text: "Correção no fluxo de pedidos com múltiplos itens simultâneos" },
      { type: "improvement", text: "Impressão de comanda térmica em 80mm via CSS print" },
    ],
  },
  {
    version: "v2.2",
    date: "1 de maio de 2026",
    label: "Calendário Unificado",
    entries: [
      { type: "feature",     text: "Calendário unificado com reservas, bloqueios e estruturas" },
      { type: "improvement", text: "Navegação por semana, mês e dia no calendário" },
      { type: "fix",         text: "Correção em sobreposição de datas no mapa de acomodações" },
      { type: "fix",         text: "Timezone corrigido em reservas criadas após meia-noite" },
    ],
  },
  {
    version: "v2.1",
    date: "24 de abril de 2026",
    label: "Check-in Digital",
    entries: [
      { type: "feature",     text: "Check-in antecipado via portal do hóspede sem necessidade de app" },
      { type: "feature",     text: "Formulário de dados preenchível antes da chegada" },
      { type: "feature",     text: "QR Code único por reserva gerado automaticamente" },
      { type: "improvement", text: "Design do portal adaptado a temas dark/light por propriedade" },
    ],
  },
  {
    version: "v2.0",
    date: "10 de abril de 2026",
    label: "Governança em Tempo Real",
    entries: [
      { type: "feature",     text: "App mobile para governanta com visão geral de todas as tarefas" },
      { type: "feature",     text: "App mobile para camareiras com lista de faxinas do dia" },
      { type: "feature",     text: "Alertas de DND em tempo real via Supabase Realtime" },
      { type: "feature",     text: "Relatório diário automático de produtividade da equipe" },
      { type: "improvement", text: "RoleGuard revisado para incluir admin/manager em apps mobile" },
    ],
  },
  {
    version: "v1.9",
    date: "28 de março de 2026",
    label: "App Manutenção & Técnica",
    entries: [
      { type: "feature",     text: "App mobile para equipe de manutenção com chamados por urgência" },
      { type: "feature",     text: "Histórico completo de intervenções por acomodação" },
      { type: "improvement", text: "Notificações push para chamados de alta prioridade" },
      { type: "fix",         text: "Correção no status de chamados reabertos após conclusão" },
    ],
  },
  {
    version: "v1.8",
    date: "15 de março de 2026",
    label: "IA Generativa com Google Gemini",
    entries: [
      { type: "feature",     text: "Integração com Google Gemini para automações operacionais" },
      { type: "feature",     text: "Insights de padrão em chamados de manutenção recorrentes" },
      { type: "feature",     text: "Rascunho de mensagens para hóspedes gerado por IA" },
      { type: "improvement", text: "Crons de automação diária integrados ao pipeline de IA" },
    ],
  },
];

/* ─── entry config ─────────────────────────────────────────────── */

const entryConfig: Record<EntryType, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  feature:     { label: "Novo",     icon: Sparkles,    color: "#00BFFF", bg: "rgba(0,191,255,0.08)",   border: "rgba(0,191,255,0.2)" },
  improvement: { label: "Melhoria", icon: TrendingUp,  color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)" },
  fix:         { label: "Correção", icon: Wrench,      color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)" },
};

/* ─── page ─────────────────────────────────────────────────────── */

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans selection:bg-[#00BFFF]/30">

      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 max-w-4xl mx-auto border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 drop-shadow-[0_0_8px_rgba(224,255,255,0.2)]">
            <Image src="/logo_transp.PNG" alt="Aura Logo" fill className="object-contain" />
          </div>
          <span className="text-lg font-black uppercase tracking-widest text-[#E0FFFF]">Aura</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar ao site
        </Link>
      </nav>

      {/* Header */}
      <header className="py-16 px-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-6">
          <Zap size={12} />
          <span>Plataforma em constante evolução</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
          Changelog
        </h1>
        <p className="text-gray-400 font-light text-lg max-w-xl">
          Histórico de versões, novas funcionalidades, melhorias e correções da
          plataforma Aura.
        </p>
      </header>

      {/* Legend */}
      <div className="px-6 max-w-4xl mx-auto mb-12">
        <div className="flex flex-wrap gap-3">
          {(Object.entries(entryConfig) as [EntryType, typeof entryConfig[EntryType]][]).map(
            ([, { label, icon: Icon, color, bg, border }]) => (
              <div
                key={label}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
                style={{ backgroundColor: bg, borderColor: border, color }}
              >
                <Icon size={11} />
                {label}
              </div>
            )
          )}
        </div>
      </div>

      {/* Timeline */}
      <main className="px-6 max-w-4xl mx-auto pb-24">
        <div className="relative">
          {/* vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/5 hidden md:block" />

          <div className="space-y-12">
            {releases.map((release, ri) => (
              <div key={release.version} className="relative md:pl-10">
                {/* dot */}
                <div
                  className="absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-[#00BFFF] hidden md:flex items-center justify-center"
                  style={{ backgroundColor: ri === 0 ? "#00BFFF" : "#141414" }}
                />

                {/* release header */}
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <span className="text-xl font-black text-white tracking-tight">
                    {release.version}
                  </span>
                  <span className="text-lg font-light text-gray-300">
                    {release.label}
                  </span>
                  {release.highlight && (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#00BFFF]/15 text-[#00BFFF] border border-[#00BFFF]/30 uppercase tracking-wider">
                      {release.highlight}
                    </span>
                  )}
                  <span className="text-sm text-gray-600 font-mono ml-auto">
                    {release.date}
                  </span>
                </div>

                {/* entries */}
                <div className="rounded-2xl border border-white/5 bg-[#1a1a1a] divide-y divide-white/5 overflow-hidden">
                  {release.entries.map((entry, ei) => {
                    const cfg = entryConfig[entry.type];
                    const Icon = cfg.icon;
                    return (
                      <div key={ei} className="flex items-start gap-3 px-5 py-3.5">
                        <div
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 mt-0.5"
                          style={{ backgroundColor: cfg.bg, borderColor: cfg.border, color: cfg.color }}
                        >
                          <Icon size={9} />
                          {cfg.label}
                        </div>
                        <p className="text-sm text-gray-300 font-light leading-relaxed">
                          {entry.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 text-center text-xs text-gray-600">
        <p>
          © {new Date().getFullYear()} Aura Software —{" "}
          <Link href="/" className="hover:text-gray-400 transition-colors">
            Voltar ao site
          </Link>
        </p>
      </footer>
    </div>
  );
}
