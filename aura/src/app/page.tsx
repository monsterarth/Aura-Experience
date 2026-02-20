// src/app/page.tsx
import Link from "next/link";
import { ShieldCheck, Key, ArrowRight, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-foreground overflow-hidden relative selection:bg-primary/30">
      
      {/* Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none opacity-50" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none opacity-30" />

      <div className="container mx-auto px-6 py-12 relative z-10 flex flex-col items-center justify-center min-h-screen space-y-16">
        
        {/* Header / Logo */}
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center justify-center p-4 bg-white/5 border border-white/10 rounded-3xl mb-4 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
             <Zap className="text-primary w-8 h-8" fill="currentColor" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter bg-gradient-to-br from-white via-white/80 to-white/40 bg-clip-text text-transparent">
            Aura Experience
          </h1>
          <p className="text-lg md:text-xl text-foreground/40 max-w-2xl mx-auto font-medium">
            O sistema operacional definitivo para hospitalidade boutique. 
            <br className="hidden md:block"/> Gestão inteligente, check-in sem atrito e automação total.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          
          {/* Card Hóspede */}
          <Link href="/check-in/login" className="group relative overflow-hidden bg-[#0F0F0F] border border-white/5 p-8 rounded-[32px] hover:border-primary/40 hover:bg-card transition-all duration-300">
             <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Key size={120} />
             </div>
             <div className="relative z-10 space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                    <Key size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-foreground">Sou Hóspede</h2>
                    <p className="text-foreground/40 text-sm mt-1">Tenho um código de reserva e quero acessar minha estadia.</p>
                </div>
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest pt-4 group-hover:translate-x-2 transition-transform">
                    Acessar Portal <ArrowRight size={14} />
                </div>
             </div>
          </Link>

          {/* Card Staff */}
          <Link href="/admin/login" className="group relative overflow-hidden bg-[#0F0F0F] border border-white/5 p-8 rounded-[32px] hover:border-blue-500/40 hover:bg-card transition-all duration-300">
             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <ShieldCheck size={120} />
             </div>
             <div className="relative z-10 space-y-4">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <ShieldCheck size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-foreground">Sou Staff</h2>
                    <p className="text-foreground/40 text-sm mt-1">Acesso restrito para administradores e equipe operacional.</p>
                </div>
                <div className="flex items-center gap-2 text-blue-500 font-bold text-xs uppercase tracking-widest pt-4 group-hover:translate-x-2 transition-transform">
                    Área Administrativa <ArrowRight size={14} />
                </div>
             </div>
          </Link>

        </div>

        {/* Footer */}
        <div className="text-center space-y-2 animate-in fade-in duration-1000 delay-500">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-foreground/20">
                Ready for Governance &bull; FNRH 2026 Compliant
            </p>
            <div className="h-1 w-20 bg-gradient-to-r from-transparent via-white/10 to-transparent mx-auto"></div>
        </div>

      </div>
    </main>
  );
}