// src/app/admin/login/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { roleHome } from "@/lib/role-routes";

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Enquanto verifica se já existe sessão — evita piscar o formulário para quem já está logado.
  const [checking, setChecking] = useState(true);

  // Já logado? Sai do login direto para a tela do cargo. Complementa o guard do
  // middleware (que só age em request nova ao servidor); aqui cobre já estar na
  // página, e é a rede que pega um login cuja navegação não completou.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!cancelled && res.ok) {
          const data = await res.json().catch(() => null);
          window.location.replace(roleHome(data?.staff?.role));
          return;
        }
      } catch { /* sem sessão → mostra o formulário */ }
      if (!cancelled) setChecking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (error) setError(null);
  }, [email, password]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Login server-side: rate limit por IP + log de tentativa + sessão via cookie.
      // (Antes o signInWithPassword rodava aqui no browser, sem trava nem registro.)
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Falha ao acessar o sistema.");
      }

      toast.success(`Bem-vindo de volta, ${String(data.fullName || '').split(' ')[0]}!`);

      // Navegação DURA (não router.push): o browser refaz a request com os cookies de
      // sessão recém-postos e o middleware libera o destino. Elimina a corrida do
      // refresh()+push que às vezes prendia o usuário no login. replace() tira o login
      // do histórico (o "voltar" não retorna ao formulário).
      window.location.replace(roleHome(data.role));

    } catch (err: any) {
      const message = err?.message || "Falha ao acessar o sistema.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <main className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background p-4 md:p-6 relative overflow-hidden font-sans text-foreground">

      {/* Iridescent Background Effect */}
      <div className="absolute top-0 right-0 w-[600px] h-[300px] bg-gradient-to-bl from-primary via-primary/20 to-transparent opacity-10 pointer-events-none rounded-full blur-[100px]" />

      <div className="w-full max-w-md z-10 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">

        {/* Card Principal */}
        <div className="bg-card border border-border rounded-[32px] shadow-xl p-8 md:p-10 space-y-8 relative overflow-hidden">

          {/* Linha de Destaque no Topo do Card */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-primary to-primary"></div>

          <div className="text-center space-y-3 pb-2">
            <div className="w-32 h-32 mx-auto relative  mb-2">
              <Image src="/logo_transp.PNG" alt="Aura Chameleon Logo" fill className="object-contain" priority />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-widest text-primary uppercase ">AURA</h1>
            <p className="text-primary/60 text-[10px] tracking-[0.2em] font-bold uppercase mt-1">Portal de Gestão e Operações</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3 text-red-400 text-sm animate-in zoom-in duration-200">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p className="font-bold uppercase tracking-wide text-xs">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">E-mail Corporativo</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@aura.com"
                  className="w-full bg-background border border-border p-4 pl-12 rounded-2xl text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-muted-foreground/60 font-bold text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Senha</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-background border border-border p-4 pl-12 pr-12 rounded-2xl text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-muted-foreground/60 font-bold text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="ak-btn ak-press w-full mt-6" data-variant="primary" data-size="lg"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Acessando The Engine...</> : "Entrar no Sistema"}
            </button>
          </form>
        </div>

        {/* Rodapé Atualizado */}
        <div className="mt-8 text-center opacity-40 hover:opacity-100 transition-opacity">
          <p className="text-[9px] text-primary uppercase tracking-[0.3em] font-black">
            Powered by Aura Experience
          </p>
        </div>

      </div>
    </main>
  );
}
