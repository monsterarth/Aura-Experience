import type { Metadata } from "next";
import React from "react";
import {
  ArrowRight,
  Activity,
  BedDouble,
  Wrench,
  UtensilsCrossed,
  Smartphone,
  Cpu,
  Users,
  BarChart3,
  Palette,
  Zap,
  Check,
  Shield,
  Globe,
  Building2,
  CalendarDays,
  Bell,
  QrCode,
  ChevronRight,
  Coffee,
  Star,
  Sparkles,
  MapPin,
  MessageSquare,
  Clock,
  TrendingUp,
  Layers,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Aura — Plataforma Operacional para Pousadas e Hotéis Boutique",
  description:
    "Software completo para gestão de pousadas e hotéis boutique: governança, manutenção, portal do hóspede e IA generativa em tempo real.",
};

/* ─── data ────────────────────────────────────────────────────── */

const stats = [
  { value: "13+", label: "Módulos Ativos" },
  { value: "5", label: "Apps Mobile" },
  { value: "100%", label: "White Label" },
  { value: "Real-time", label: "Supabase Live" },
];

const modules = [
  {
    icon: BedDouble,
    title: "Reservas & Estadias",
    description:
      "Mapa interativo de acomodações, check-in e check-out digital, timeline de estadias e histórico completo de cada hóspede.",
    tags: ["Mapa de Cabanas", "Check-in/out", "Timeline"],
  },
  {
    icon: Users,
    title: "Governança & Camareiras",
    description:
      "Tarefas de faxina em tempo real, controle de DND, manutenção de bloqueios e relatórios de produtividade da equipe.",
    tags: ["Faxinas", "DND", "Relatórios"],
  },
  {
    icon: Wrench,
    title: "Manutenção & Técnica",
    description:
      "Abertura e acompanhamento de chamados por urgência, histórico de intervenções e checklists de inspeção.",
    tags: ["Chamados", "Urgência", "Histórico"],
  },
  {
    icon: Coffee,
    title: "Restaurante & Garçom",
    description:
      "Controle de café da manhã, cardápio digital com QR Code, pedidos por mesa e fluxo de atendimento integrado.",
    tags: ["Café da Manhã", "Cardápio", "Pedidos"],
  },
  {
    icon: Smartphone,
    title: "Portal do Hóspede",
    description:
      "Check-in online, concierge digital, eventos, solicitações e comunicação direta — sem instalação de app.",
    tags: ["QR Code", "PT/EN/ES", "Concierge"],
  },
  {
    icon: Cpu,
    title: "IA Generativa",
    description:
      "Insights operacionais, automações inteligentes e análise de padrões com Google Gemini no núcleo.",
    tags: ["Gemini AI", "Automação", "Insights"],
  },
];

const valueProps = [
  {
    icon: Zap,
    title: "Implantação Rápida",
    desc: "Configurado e operacional em dias, sem necessidade de código.",
  },
  {
    icon: Palette,
    title: "100% White Label",
    desc: "Interface adaptada às cores, tipografia e identidade visual da sua marca.",
  },
  {
    icon: Globe,
    title: "Multilíngue",
    desc: "Português, Inglês e Espanhol integrados nativamente no portal.",
  },
  {
    icon: QrCode,
    title: "Acesso Sem App",
    desc: "Hóspedes acessam via QR Code ou link direto — sem instalação.",
  },
  {
    icon: Shield,
    title: "Segurança Enterprise",
    desc: "Auth robusta, Row Level Security e dados isolados por propriedade.",
  },
  {
    icon: Activity,
    title: "Sincronização ao Vivo",
    desc: "Todas as equipes sincronizadas via Supabase Realtime, 24/7.",
  },
];

/* ─── page ────────────────────────────────────────────────────── */

export default function AuraLandingPage() {
  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans selection:bg-[#00BFFF]/30 overflow-x-hidden">
      {/* ══════════════════════════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════════════════════════ */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 max-w-7xl mx-auto border-b border-white/5 backdrop-blur-md bg-[#141414]/80">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 drop-shadow-[0_0_12px_rgba(224,255,255,0.3)]">
            <Image
              src="/logo_transp.PNG"
              alt="Aura Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-xl font-black uppercase tracking-widest text-[#E0FFFF]">
              Aura
            </span>
            <span className="text-[8px] font-bold text-[#E6E6FA]/50 uppercase tracking-[0.25em] font-mono">
              Software
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-light text-gray-400">
          <a href="#modulos" className="hover:text-[#E0FFFF] transition-colors">
            Módulos
          </a>
          <a href="#operacao" className="hover:text-[#E0FFFF] transition-colors">
            Operação
          </a>
          <a href="#hospede" className="hover:text-[#E0FFFF] transition-colors">
            Portal do Hóspede
          </a>
          <a href="#valores" className="hover:text-[#E0FFFF] transition-colors">
            Por que Aura
          </a>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="mailto:contato@aura.software"
            className="hidden sm:block text-sm font-medium px-4 py-2 rounded-full text-[#00BFFF] hover:text-white transition-colors"
          >
            Agendar Demo
          </a>
          <Link
            href="/admin/login"
            className="text-sm font-medium px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-[#E0FFFF]"
          >
            Acesso Restrito
          </Link>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════ */}
      <section className="relative pt-28 pb-32 px-6 max-w-7xl mx-auto">
        {/* dot grid background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#00BFFF] rounded-full blur-[180px] opacity-10 pointer-events-none" />

        <div className="relative flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-8">
            <Activity size={12} className="animate-pulse" />
            <span>Sistema Ativo e em Produção</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight mb-6 leading-[0.95]">
            A plataforma operacional
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] via-[#E0FFFF] to-[#B0E0E6]">
              completa para pousadas.
            </span>
          </h1>

          <p className="max-w-2xl text-lg md:text-xl text-gray-400 font-light mb-10 leading-relaxed">
            Do check-in ao check-out, da equipe de faxina ao concierge digital
            — tudo integrado, em tempo real, com inteligência artificial no
            núcleo.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="mailto:contato@aura.software"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#00BFFF] hover:bg-[#009acd] text-white font-semibold transition-all shadow-[0_0_30px_rgba(0,191,255,0.35)] text-sm"
            >
              Agendar uma Demonstração
              <ArrowRight size={16} />
            </a>
            <a
              href="#modulos"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[#E0FFFF] font-medium transition-all text-sm"
            >
              Ver todos os módulos
              <ChevronRight size={16} />
            </a>
          </div>
        </div>

        {/* ── HERO DASHBOARD MOCK ── */}
        <div className="relative mt-20 max-w-5xl mx-auto">
          <div className="absolute -inset-4 bg-gradient-to-b from-[#00BFFF]/5 to-transparent rounded-3xl pointer-events-none" />
          <div className="rounded-2xl border border-white/10 bg-[#1a1a1a] overflow-hidden shadow-2xl shadow-black/50">
            {/* window bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#1f1f1f]">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-4 text-xs text-gray-500 font-mono">
                aura.software / admin / dashboard
              </span>
            </div>

            <div className="grid grid-cols-4 min-h-[340px]">
              {/* sidebar mock */}
              <div className="col-span-1 border-r border-white/5 bg-[#161616] p-4 hidden md:block">
                <div className="space-y-1">
                  {[
                    { icon: Building2, label: "Dashboard", active: true },
                    { icon: BedDouble, label: "Reservas" },
                    { icon: Users, label: "Governança" },
                    { icon: Wrench, label: "Manutenção" },
                    { icon: Coffee, label: "Restaurante" },
                    { icon: CalendarDays, label: "Eventos" },
                    { icon: BarChart3, label: "Analytics" },
                  ].map(({ icon: Icon, label, active }) => (
                    <div
                      key={label}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                        active
                          ? "bg-[#00BFFF]/15 text-[#00BFFF]"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      <Icon size={13} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* main area mock */}
              <div className="col-span-3 md:col-span-3 col-span-4 p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Ocupação Hoje", value: "12/18", sub: "67%", color: "#00BFFF" },
                    { label: "Check-outs", value: "4", sub: "pendentes", color: "#a78bfa" },
                    { label: "Tarefas Abertas", value: "7", sub: "governança", color: "#34d399" },
                  ].map(({ label, value, sub, color }) => (
                    <div
                      key={label}
                      className="rounded-xl bg-[#222] border border-white/5 p-3"
                    >
                      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
                      <p className="text-2xl font-bold" style={{ color }}>
                        {value}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* reservation map mini mock */}
                <div className="rounded-xl bg-[#1e1e1e] border border-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-300">
                      Mapa de Acomodações
                    </span>
                    <span className="text-[10px] text-gray-600 font-mono">
                      hoje, 24 mai
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[
                      { n: "01", status: "ocupado", color: "#3b82f6" },
                      { n: "02", status: "ocupado", color: "#3b82f6" },
                      { n: "03", status: "livre", color: "#374151" },
                      { n: "04", status: "faxina", color: "#a78bfa" },
                      { n: "05", status: "ocupado", color: "#3b82f6" },
                      { n: "06", status: "checkout", color: "#f59e0b" },
                      { n: "07", status: "ocupado", color: "#3b82f6" },
                      { n: "08", status: "livre", color: "#374151" },
                      { n: "09", status: "bloqueio", color: "#ef4444" },
                      { n: "10", status: "ocupado", color: "#3b82f6" },
                      { n: "11", status: "faxina", color: "#a78bfa" },
                      { n: "12", status: "checkin", color: "#10b981" },
                    ].map(({ n, color }) => (
                      <div
                        key={n}
                        className="aspect-square rounded-md flex items-center justify-center text-[9px] font-bold"
                        style={{
                          backgroundColor: color + "25",
                          borderColor: color + "60",
                          border: "1px solid",
                          color,
                        }}
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-3 flex-wrap">
                    {[
                      { label: "Ocupado", color: "#3b82f6" },
                      { label: "Livre", color: "#374151" },
                      { label: "Faxina", color: "#a78bfa" },
                      { label: "Check-out", color: "#f59e0b" },
                      { label: "Bloqueio", color: "#ef4444" },
                      { label: "Check-in", color: "#10b981" },
                    ].map(({ label, color }) => (
                      <div
                        key={label}
                        className="flex items-center gap-1"
                      >
                        <div
                          className="w-2 h-2 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                        <span
                          className="text-[9px] text-gray-500"
                        >
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#141414] to-transparent pointer-events-none rounded-b-2xl" />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          STATS STRIP
      ══════════════════════════════════════════════════════════ */}
      <section className="border-y border-white/5 bg-[#141414]/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/5">
          {stats.map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center py-4 md:py-0">
              <span className="text-3xl md:text-4xl font-black text-[#00BFFF] tracking-tight">
                {value}
              </span>
              <span className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wider">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          MÓDULOS
      ══════════════════════════════════════════════════════════ */}
      <section id="modulos" className="py-28 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/8 text-gray-400 text-xs font-medium mb-5">
            <Layers size={12} />
            <span>Cobertura Total da Operação</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
            Cada operação,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#E0FFFF]">
              um toque.
            </span>
          </h2>
          <p className="max-w-xl mx-auto text-gray-400 font-light text-lg">
            Módulos dedicados para cada time — totalmente integrados entre si e
            sincronizados em tempo real.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map(({ icon: Icon, title, description, tags }) => (
            <div
              key={title}
              className="group p-7 rounded-2xl bg-[#1a1a1a] border border-white/5 hover:border-[#00BFFF]/30 transition-all duration-300 hover:bg-[#1e1e1e]"
            >
              <div className="w-11 h-11 rounded-xl bg-[#00BFFF]/10 border border-[#00BFFF]/20 flex items-center justify-center mb-5 text-[#00BFFF] group-hover:bg-[#00BFFF]/20 transition-colors">
                <Icon size={20} />
              </div>
              <h3 className="text-lg font-bold mb-2 text-white">{title}</h3>
              <p className="text-gray-400 font-light leading-relaxed text-sm mb-5">
                {description}
              </p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-white/5 border border-white/8 text-gray-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          OPERATIONS SECTION — Governança
      ══════════════════════════════════════════════════════════ */}
      <section id="operacao" className="py-24 px-6 bg-black/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          {/* text */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#a78bfa]/10 border border-[#a78bfa]/20 text-[#a78bfa] text-xs font-medium mb-6">
              <Users size={12} />
              <span>Governança & Camareiras</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-5 leading-tight">
              Construído para a forma como{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a78bfa] to-[#E0FFFF]">
                pousadas operam.
              </span>
            </h2>
            <p className="text-gray-400 font-light leading-relaxed mb-8 text-lg">
              Cada camareira tem um app dedicado com suas tarefas do dia. A
              governanta acompanha o andamento em tempo real, atribui faxinas,
              controla DND e gera relatórios de produtividade — tudo do
              smartphone.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Tarefas atribuídas automaticamente conforme check-out",
                "Hóspede registra DND pelo portal — equipe recebe alerta",
                "Histórico completo de cada acomodação por data",
                "Relatório diário de faxinas gerado automaticamente",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-300">
                  <Check size={15} className="text-[#a78bfa] mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="mailto:contato@aura.software"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#a78bfa] hover:text-white transition-colors"
            >
              Ver módulo completo <ChevronRight size={14} />
            </a>
          </div>

          {/* mock — maid app */}
          <div className="relative flex justify-center md:justify-end">
            <div className="w-72 rounded-3xl border border-white/10 bg-[#1a1a1a] overflow-hidden shadow-2xl shadow-[#a78bfa]/10">
              {/* phone top bar */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#a78bfa]/20 flex items-center justify-center">
                    <Users size={13} className="text-[#a78bfa]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Camareira</p>
                    <p className="text-[9px] text-gray-500">3 tarefas pendentes</p>
                  </div>
                </div>
                <Bell size={14} className="text-gray-500" />
              </div>

              <div className="p-4 space-y-3">
                {[
                  {
                    cabin: "Cabana 07",
                    type: "Saída Completa",
                    priority: "Alta",
                    pColor: "#ef4444",
                    status: "Pendente",
                  },
                  {
                    cabin: "Cabana 12",
                    type: "Arrumação Rápida",
                    priority: "Normal",
                    pColor: "#f59e0b",
                    status: "Em andamento",
                  },
                  {
                    cabin: "Cabana 03",
                    type: "Conferência",
                    priority: "Baixa",
                    pColor: "#10b981",
                    status: "Pendente",
                  },
                ].map(({ cabin, type, priority, pColor, status }) => (
                  <div
                    key={cabin}
                    className="rounded-xl bg-[#222] border border-white/5 p-3.5"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">{cabin}</span>
                      <span
                        className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: pColor,
                          backgroundColor: pColor + "20",
                        }}
                      >
                        {priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-2.5">{type}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-gray-600">{status}</span>
                      <button className="text-[9px] font-semibold px-2.5 py-1 rounded-lg bg-[#a78bfa]/15 text-[#a78bfa] border border-[#a78bfa]/20">
                        Iniciar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 pt-0">
                <div className="rounded-xl bg-[#00BFFF]/5 border border-[#00BFFF]/15 p-3 flex items-center gap-2.5">
                  <Bell size={12} className="text-[#00BFFF]" />
                  <p className="text-[10px] text-gray-400">
                    <span className="text-[#00BFFF] font-semibold">Cabana 09</span> —
                    Hóspede sinalizou DND
                  </p>
                </div>
              </div>
            </div>
            {/* glow behind phone */}
            <div className="absolute inset-0 bg-[#a78bfa] blur-[80px] opacity-5 pointer-events-none rounded-full" />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          GUEST PORTAL
      ══════════════════════════════════════════════════════════ */}
      <section id="hospede" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* mock — guest portal phone */}
          <div className="relative flex justify-center md:justify-start order-2 md:order-1">
            <div className="w-64 rounded-3xl border border-white/10 bg-[#1a1a1a] overflow-hidden shadow-2xl shadow-[#10b981]/10">
              {/* header */}
              <div className="bg-gradient-to-br from-[#10b981]/20 to-transparent px-5 pt-6 pb-5 border-b border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <Star size={12} className="text-[#f59e0b]" fill="#f59e0b" />
                  <span className="text-[10px] text-gray-400 font-medium">
                    Pousada da Rosa
                  </span>
                </div>
                <p className="text-base font-bold text-white">Olá, João! 👋</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Cabana 07 • Check-out: 27 mai
                </p>
              </div>

              <div className="p-4 space-y-2">
                {/* quick actions */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { icon: MessageSquare, label: "Concierge", color: "#00BFFF" },
                    { icon: CalendarDays, label: "Eventos", color: "#a78bfa" },
                    { icon: Wrench, label: "Manutenção", color: "#f59e0b" },
                  ].map(({ icon: Icon, label, color }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-white/5 border border-white/5"
                    >
                      <Icon size={14} style={{ color }} />
                      <span className="text-[8px] text-gray-400 font-medium">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* info cards */}
                <div className="rounded-xl bg-[#222] border border-white/5 p-3">
                  <p className="text-[9px] text-gray-500 mb-2 uppercase tracking-wider font-semibold">
                    Serviços do Hotel
                  </p>
                  {[
                    { icon: Coffee, label: "Café 07h–10h", sub: "Área gourmet" },
                    { icon: MapPin, label: "Piscina", sub: "Aberta 24h" },
                  ].map(({ icon: Icon, label, sub }) => (
                    <div
                      key={label}
                      className="flex items-center gap-2 py-1.5"
                    >
                      <Icon size={11} className="text-gray-500" />
                      <div>
                        <p className="text-[10px] text-white font-medium leading-none">
                          {label}
                        </p>
                        <p className="text-[9px] text-gray-600">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* language badges */}
                <div className="flex gap-2">
                  {["PT", "EN", "ES"].map((lang) => (
                    <span
                      key={lang}
                      className="text-[9px] font-bold px-2 py-0.5 rounded bg-white/5 text-gray-500 border border-white/5"
                    >
                      {lang}
                    </span>
                  ))}
                  <span className="text-[9px] text-gray-600 ml-1 self-center">
                    multilíngue
                  </span>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 bg-[#10b981] blur-[80px] opacity-5 pointer-events-none rounded-full" />
          </div>

          {/* text */}
          <div className="order-1 md:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] text-xs font-medium mb-6">
              <QrCode size={12} />
              <span>Portal do Hóspede</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-5 leading-tight">
              A experiência do hóspede{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#E0FFFF]">
                reimaginada.
              </span>
            </h2>
            <p className="text-gray-400 font-light leading-relaxed mb-8 text-lg">
              O hóspede escaneia o QR Code e acessa um portal personalizado com
              a identidade da pousada — sem baixar app. Concierge, eventos,
              solicitações e check-in antecipado em PT, EN e ES.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Check-in digital com preenchimento de dados antes da chegada",
                "Concierge e solicitações via chat integrado",
                "Eventos e atividades da propriedade em tempo real",
                "Feedback instantâneo durante e após a estadia",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-300">
                  <Check size={15} className="text-[#10b981] mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="mailto:contato@aura.software"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#10b981] hover:text-white transition-colors"
            >
              Ver portal ao vivo <ChevronRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          ANALYTICS SECTION
      ══════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-black/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          {/* text */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] text-xs font-medium mb-6">
              <BarChart3 size={12} />
              <span>Analytics & Insights</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-5 leading-tight">
              Decisões baseadas em{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f59e0b] to-[#E0FFFF]">
                dados reais.
              </span>
            </h2>
            <p className="text-gray-400 font-light leading-relaxed mb-8 text-lg">
              Dashboards em tempo real de ocupação, receita, performance de
              equipe e satisfação dos hóspedes. Identifique padrões, preveja
              demanda e tome decisões com confiança.
            </p>
            <ul className="space-y-3">
              {[
                "Taxa de ocupação e receita por período",
                "Performance por módulo: manutenção, faxinas, restaurante",
                "Satisfação do hóspede com NPS integrado",
                "Relatórios exportáveis e histórico completo",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-300">
                  <TrendingUp size={15} className="text-[#f59e0b] mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* mock analytics */}
          <div className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">
                Visão Geral — Maio 2026
              </span>
              <span className="text-[10px] text-gray-600 font-mono">atualizado agora</span>
            </div>

            {/* bar chart mock */}
            <div>
              <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">
                Ocupação (%)
              </p>
              <div className="flex items-end gap-1.5 h-20">
                {[55, 72, 68, 85, 90, 78, 67, 88, 92, 75, 83, 95].map(
                  (pct, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${pct}%`,
                        backgroundColor:
                          pct > 85
                            ? "#00BFFF"
                            : pct > 70
                            ? "#00BFFF80"
                            : "#00BFFF30",
                      }}
                    />
                  )
                )}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-gray-600">01 mai</span>
                <span className="text-[9px] text-gray-600">24 mai</span>
              </div>
            </div>

            {/* metrics row */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5">
              {[
                { label: "Avg. NPS", value: "4.7", icon: Star, color: "#f59e0b" },
                { label: "Taxa Ocup.", value: "79%", icon: TrendingUp, color: "#10b981" },
                { label: "Chamados", value: "12", icon: Wrench, color: "#a78bfa" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="text-center">
                  <div
                    className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center"
                    style={{ backgroundColor: color + "20" }}
                  >
                    <Icon size={14} style={{ color }} />
                  </div>
                  <p className="text-base font-bold" style={{ color }}>
                    {value}
                  </p>
                  <p className="text-[9px] text-gray-600">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          AI SECTION
      ══════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="relative rounded-3xl border border-white/8 bg-gradient-to-br from-[#1a1a2e] via-[#1a1a1a] to-[#141414] p-10 md:p-16 overflow-hidden">
          {/* background glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#00BFFF] blur-[150px] opacity-5 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#a78bfa] blur-[120px] opacity-5 pointer-events-none" />

          <div className="relative max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-6">
              <Sparkles size={12} />
              <span>Google Gemini — IA Integrada</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-5">
              Inteligência Artificial{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#a78bfa]">
                no núcleo.
              </span>
            </h2>
            <p className="text-gray-400 font-light leading-relaxed text-lg mb-8">
              Não é um chatbot genérico. A IA da Aura conhece sua propriedade,
              seus hóspedes e seus padrões operacionais — e age sobre eles de
              forma proativa e contextual.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  icon: Clock,
                  title: "Automações Temporais",
                  desc: "Tarefas de rotina geradas automaticamente conforme horários e eventos da pousada.",
                },
                {
                  icon: MessageSquare,
                  title: "Mensagens Personalizadas",
                  desc: "Comunicações com hóspedes redigidas por IA, no idioma e tom certo.",
                },
                {
                  icon: BarChart3,
                  title: "Insights de Padrão",
                  desc: "Análise de recorrência em chamados de manutenção e solicitações de hóspedes.",
                },
                {
                  icon: Zap,
                  title: "Alertas Inteligentes",
                  desc: "Notificações proativas baseadas em contexto operacional, não apenas em triggers manuais.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex gap-4 p-4 rounded-xl bg-white/3 border border-white/5"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#00BFFF]/10 flex items-center justify-center shrink-0 text-[#00BFFF]">
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">{title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          WHITE LABEL SECTION
      ══════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-black/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
          {/* color palette mock */}
          <div className="md:w-1/2 flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 space-y-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Tema da Propriedade
              </p>
              <div className="flex gap-3">
                {[
                  { bg: "#8B0000", label: "Primary" },
                  { bg: "#D4AF37", label: "Accent" },
                  { bg: "#FFF8DC", label: "Light" },
                  { bg: "#1a0a05", label: "BG" },
                ].map(({ bg, label }) => (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <div
                      className="w-12 h-12 rounded-xl border border-white/10 shadow-md"
                      style={{ backgroundColor: bg }}
                    />
                    <span className="text-[9px] text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-[#222] p-3 border border-white/5">
                <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wider">
                  Preview — Navbar
                </p>
                <div
                  className="rounded-lg p-3 flex items-center justify-between"
                  style={{ backgroundColor: "#1a0a05" }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded"
                      style={{ backgroundColor: "#8B0000" }}
                    />
                    <span
                      className="text-[10px] font-black tracking-widest"
                      style={{ color: "#FFF8DC" }}
                    >
                      FAZENDA
                    </span>
                  </div>
                  <div
                    className="px-2 py-0.5 rounded text-[9px] font-semibold"
                    style={{ backgroundColor: "#D4AF37", color: "#1a0a05" }}
                  >
                    Check-in
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Globe size={12} />
                <span>
                  Fontes, cores e texturas configuram-se a partir do painel admin
                </span>
              </div>
            </div>
          </div>

          {/* text */}
          <div className="md:w-1/2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/8 text-gray-400 text-xs font-medium mb-6">
              <Palette size={12} />
              <span>White Label Nativo</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-5 leading-tight">
              Se molda{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] to-[#E0FFFF]">
                à sua identidade.
              </span>
            </h2>
            <p className="text-gray-400 font-light leading-relaxed mb-8 text-lg">
              Cada pousada tem sua própria paleta, tipografia e textura iridescente.
              O sistema aplica o tema programaticamente em todo o portal do hóspede
              e nas interfaces da equipe.
            </p>
            <ul className="space-y-3">
              {[
                "Cores primárias, de destaque e de fundo por propriedade",
                "Tipografia e texturas personalizadas",
                "Logo e nome da marca em todos os pontos de contato",
                "Hóspede não vê 'Aura' — vê a sua marca",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-300">
                  <Check size={15} className="text-[#D4AF37] mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          VALUE PROPS
      ══════════════════════════════════════════════════════════ */}
      <section id="valores" className="py-28 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
            Por que{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] to-[#E0FFFF]">
              Aura?
            </span>
          </h2>
          <p className="max-w-xl mx-auto text-gray-400 font-light text-lg">
            Uma plataforma construída do zero para o contexto de pousadas e hotéis
            boutique brasileiros.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {valueProps.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group p-6 rounded-2xl bg-[#1a1a1a] border border-white/5 hover:border-[#00BFFF]/20 transition-all hover:bg-[#1e1e1e]"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-[#E0FFFF] group-hover:text-[#00BFFF] group-hover:bg-[#00BFFF]/10 transition-colors">
                <Icon size={18} />
              </div>
              <h3 className="text-base font-bold mb-2 text-white">{title}</h3>
              <p className="text-sm text-gray-500 font-light leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════════════ */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="absolute inset-0 bg-[#00BFFF] blur-[200px] opacity-5 pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-8">
              <Sparkles size={12} />
              <span>Pronto para transformar sua operação?</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-6">
              Torne a experiência{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00BFFF] via-[#E0FFFF] to-[#B0E0E6]">
                inesquecível.
              </span>
            </h2>
            <p className="text-gray-400 font-light text-lg mb-10 max-w-2xl mx-auto">
              Entre em contato para uma demonstração personalizada com os módulos
              mais relevantes para a sua propriedade.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:contato@aura.software"
                className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-[#00BFFF] hover:bg-[#009acd] text-white font-semibold transition-all shadow-[0_0_40px_rgba(0,191,255,0.3)] text-sm"
              >
                Agendar Demonstração
                <ArrowRight size={16} />
              </a>
              <Link
                href="/admin/login"
                className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[#E0FFFF] font-medium transition-all text-sm"
              >
                Acesso Restrito
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-10">
            {/* brand */}
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8 drop-shadow-[0_0_8px_rgba(224,255,255,0.2)]">
                <Image
                  src="/logo_transp.PNG"
                  alt="Aura Logo"
                  fill
                  className="object-contain"
                />
              </div>
              <div>
                <span className="text-lg font-black uppercase tracking-widest text-[#E0FFFF]">
                  Aura
                </span>
                <span className="block text-[8px] font-bold text-[#E6E6FA]/40 uppercase tracking-[0.25em] font-mono">
                  Software
                </span>
              </div>
            </div>

            {/* links */}
            <div className="flex flex-wrap gap-8 text-sm text-gray-500">
              <div>
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                  Produto
                </p>
                <div className="space-y-2">
                  <a href="#modulos" className="block hover:text-gray-300 transition-colors">
                    Módulos
                  </a>
                  <a href="#hospede" className="block hover:text-gray-300 transition-colors">
                    Portal do Hóspede
                  </a>
                  <a href="#valores" className="block hover:text-gray-300 transition-colors">
                    Por que Aura
                  </a>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                  Empresa
                </p>
                <div className="space-y-2">
                  <a
                    href="mailto:contato@aura.software"
                    className="block hover:text-gray-300 transition-colors"
                  >
                    Contato
                  </a>
                  <a
                    href="mailto:contato@aura.software"
                    className="block hover:text-gray-300 transition-colors"
                  >
                    Demonstração
                  </a>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                  Acesso
                </p>
                <div className="space-y-2">
                  <Link
                    href="/admin/login"
                    className="block hover:text-gray-300 transition-colors"
                  >
                    Admin
                  </Link>
                  <Link
                    href="/governanta"
                    className="block hover:text-gray-300 transition-colors"
                  >
                    Governanta
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
            <p>© {new Date().getFullYear()} Aura Software. Todos os direitos reservados.</p>
            <p className="font-light">
              Construído para continuidade, integração e visão.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
