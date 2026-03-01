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
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 md:p-6 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-slate-50 relative overflow-hidden font-sans">
      {/* Background Effects Suaves */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-100 z-0"></div>
      
      <div className="z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
        {/* Card Principal */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-xl dark:shadow-2xl p-8 md:p-10 space-y-8 relative overflow-hidden">
          
          {/* Linha de Destaque no Topo do Card */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary to-blue-500"></div>

          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto border border-primary/20 shadow-inner mb-6">
              <Key className="text-primary w-8 h-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">Aura Guest</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base font-medium">Digite seu código de acesso para entrar.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <input 
                autoFocus
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="Ex: X9Y2Z"
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-2xl p-5 text-center text-3xl font-black tracking-[0.4em] uppercase outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:tracking-normal placeholder:normal-case placeholder:text-base placeholder:font-medium placeholder:text-slate-400 dark:placeholder:text-zinc-600 text-slate-900 dark:text-white"
                maxLength={5}
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading || accessCode.length < 5}
              className="w-full bg-primary hover:bg-primary/90 text-white dark:text-zinc-950 font-bold uppercase tracking-wide py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Acessar Portal <ArrowRight className="w-5 h-5" /></>}
            </button>
          </form>
        </div>

        {/* Rodapé Atualizado */}
        <div className="mt-8 text-center opacity-60 hover:opacity-100 transition-opacity">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
            Powered by Aura Experience
          </p>
        </div>
      </div>
    </div>
  );
}
