import type { Metadata } from "next";
import React from 'react';
import { ArrowRight, MonitorSmartphone, Cpu, Activity, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: "Aura — Gestão Inteligente para Pousadas",
};

export default function AuraLandingPage() {
  return (
    <div className="min-h-screen bg-[#222222] text-white font-sans selection:bg-[#00BFFF]/30">

      {/* Navbar Minimalista */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex flex-col items-start leading-none tracking-tight">
          <span className="text-2xl font-bold uppercase tracking-widest text-white">Aura</span>
          <span className="text-xs font-light text-gray-400 uppercase tracking-[0.3em] border-t border-white/20 pt-1 mt-1">Software</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm font-light text-gray-300">
          <Link href="#features" className="hover:text-[#E0FFFF] transition-colors">Funcionalidades</Link>
        </div>
        <Link
          href="/admin/login"
          className="text-sm font-medium px-5 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-[#E0FFFF]"
        >
          Acesso Restrito
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-40 px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        {/* Glow de fundo LED */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#00BFFF] rounded-full blur-[150px] opacity-20 pointer-events-none"></div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[#00BFFF] text-xs font-medium mb-8">
          <Activity size={14} className="animate-pulse" />
          <span>Sistema Ativo e Atualizado</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold uppercase tracking-tight mb-6 leading-tight">
          A evolução digital <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E0FFFF] via-[#E6E6FA] to-[#B0E0E6]">
            da sua operação.
          </span>
        </h1>

        <p className="max-w-2xl text-lg md:text-xl text-gray-400 font-light mb-10">
          Inteligente, adaptável e de alto desempenho. O software que se molda à sua marca através de arquitetura flexível e inteligência artificial generativa.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <a
            href="mailto:contato@aura.software"
            className="flex items-center justify-center gap-2 px-8 py-4 rounded-lg bg-[#00BFFF] hover:bg-[#009acd] text-white font-medium transition-all shadow-[0_0_20px_rgba(0,191,255,0.3)]"
          >
            Agendar Demonstração
            <ArrowRight size={18} />
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-8 bg-black/20 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-2xl bg-[#222222] border border-white/5 hover:border-[#00BFFF]/50 transition-colors group">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-6 text-[#E0FFFF] group-hover:text-[#00BFFF] transition-colors">
                <MonitorSmartphone size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3">Adaptação White Label</h3>
              <p className="text-gray-400 font-light leading-relaxed">
                A interface ajusta as suas cores, texturas iridescentes e tipografia programaticamente para refletir a identidade única do seu negócio.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-2xl bg-[#222222] border border-white/5 hover:border-[#00BFFF]/50 transition-colors group">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-6 text-[#E0FFFF] group-hover:text-[#00BFFF] transition-colors">
                <Cpu size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3">IA Generativa Integrada</h3>
              <p className="text-gray-400 font-light leading-relaxed">
                Potenciado pelo ecossistema Google Gemini, automatizamos tarefas complexas e entregamos insights contextuais em tempo real.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-2xl bg-[#222222] border border-white/5 hover:border-[#00BFFF]/50 transition-colors group">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-6 text-[#E0FFFF] group-hover:text-[#00BFFF] transition-colors">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3">Estabilidade e Geometria</h3>
              <p className="text-gray-400 font-light leading-relaxed">
                Arquitetura escalável construída em Next.js e Supabase. Uma fundação tão sólida e perfeita quanto a Espiral de Fibonacci.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Minimalista */}
      <footer className="py-8 text-center text-sm font-light text-gray-500">
        <p>© {new Date().getFullYear()} Aura Software. Construído para continuidade, integração e visão.</p>
      </footer>
    </div>
  );
}