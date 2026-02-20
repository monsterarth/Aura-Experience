// src/app/check-in/login/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { Loader2, ArrowRight, Key } from "lucide-react";
import { toast } from "sonner";

export default function GuestLoginPage() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.length < 5) return toast.error("Código inválido (mínimo 5 caracteres)");

    setLoading(true);
    try {
      // 1. Buscar estadia pelo código (pode retornar uma lista se for grupo, mas aqui simplificamos para 1)
      const stays = await StayService.getGroupStays(accessCode);
      
      if (!stays || stays.length === 0) {
        toast.error("Código não encontrado ou estadia inválida.");
        setLoading(false);
        return;
      }

      // 2. Lógica de Redirecionamento
      // Se for um grupo, idealmente redirecionaríamos para uma página de seleção,
      // mas aqui vamos pegar a primeira para simplificar o MVP
      const stay = stays[0];

      toast.success(`Bem-vindo, ${stay.guestId ? "Hóspede" : "Visitante"}!`);

      // Se já fez check-in físico ou pré-checkin completo -> Portal
      // Se está pendente -> Formulário
      if (stay.status === 'active' || stay.status === 'pre_checkin_done') {
         router.push(`/check-in/${stay.accessCode}`); // Rota do Portal (Dashboard)
      } else {
         router.push(`/check-in/form/${stay.id}`); // Rota do Formulário FNRH
      }

    } catch (error) {
      console.error(error);
      toast.error("Erro ao acessar sistema.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-black text-foreground relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-black to-black opacity-50 z-0"></div>
        
        <div className="z-10 w-full max-w-sm space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)] mb-6">
                    <Key className="text-primary" size={32} />
                </div>
                <h1 className="text-3xl font-black tracking-tighter">Aura Guest</h1>
                <p className="text-foreground/40 text-sm">Digite seu código de acesso para entrar.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
                <input 
                    autoFocus
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                    placeholder="Ex: X9Y2Z"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-center text-2xl font-black tracking-[0.5em] uppercase outline-none focus:border-primary/50 focus:bg-white/10 transition-all placeholder:tracking-normal placeholder:normal-case placeholder:text-sm placeholder:font-medium"
                    maxLength={5}
                />
                
                <button 
                    type="submit" 
                    disabled={loading || accessCode.length < 5}
                    className="w-full bg-primary hover:bg-primary/90 text-black font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(var(--primary),0.3)]"
                >
                    {loading ? <Loader2 className="animate-spin" /> : <>Entrar <ArrowRight size={20} /></>}
                </button>
            </form>

            <p className="text-center text-[10px] text-foreground/20 uppercase tracking-widest font-bold">
                Powered by Synapse Engine
            </p>
        </div>
    </div>
  );
}