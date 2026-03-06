// src/app/check-in/login/page.tsx
"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { Loader2, ArrowRight, Key } from "lucide-react";
import { toast } from "sonner";

function GuestLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code");

  const [accessCode, setAccessCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(!!codeFromUrl);
  const hasAutoSubmitted = useRef(false);

  const executeLogin = async (code: string) => {
    if (code.length < 5) {
      toast.error("Código inválido (mínimo 5 caracteres)");
      setAutoLoading(false);
      return;
    }

    setLoading(true);
    try {
      const stays = await StayService.getStaysByAccessCode(code);

      if (!stays || stays.length === 0) {
        toast.error("Código não encontrado ou estadia inválida.");
        setLoading(false);
        setAutoLoading(false);
        return;
      }

      const stay = stays[0];

      toast.success(`Bem-vindo, ${stay.guestId ? "Hóspede" : "Visitante"}!`);
      // Sempre levar para o terminal central do hóspede
      router.push(`/check-in/${stay.accessCode}`);

    } catch (error) {
      console.error(error);
      toast.error("Erro ao acessar sistema.");
      setLoading(false);
      setAutoLoading(false);
    }
  };

  // Auto-login quando o código vem na URL (?code=XXXXX)
  useEffect(() => {
    if (codeFromUrl && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      const code = codeFromUrl.toUpperCase();
      setAccessCode(code);
      executeLogin(code);
    }
  }, [codeFromUrl]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin(accessCode);
  };

  // Tela de loading quando está fazendo auto-login via URL
  if (autoLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 md:p-6 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-slate-50 relative overflow-hidden font-sans">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-100 z-0"></div>
        <div className="z-10 flex flex-col items-center gap-6 animate-in fade-in duration-700">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Acessando sua reserva...</p>
        </div>
      </div>
    );
  }

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

export default function GuestLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    }>
      <GuestLoginContent />
    </Suspense>
  );
}
