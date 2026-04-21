// src/app/admin/login/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createClientBrowser } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Staff } from "@/types/aura";

export default function AdminLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) setError(null);
  }, [email, password]);

  /**
   * Redirecionamento inteligente baseado no Cargo (Role-based Routing)
   */
  const getRedirectPath = (role: Staff['role']) => {
    switch (role) {
      case 'super_admin':
        return "/admin/core/properties";
      case 'governance':
      case 'maid': // Camareira vai direto para o seu App Mobile de Governança
        return "/admin/governance";
      case 'houseman':
        return "/admin/houseman";
      case 'maintenance':
      case 'technician':
        return "/admin/maintenance";
      case 'kitchen':
      case 'waiter':
        return "/admin/kitchen";
      case 'admin':
      case 'reception':
      case 'porter':
      default:
        return "/admin/stays";
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClientBrowser();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError || !authData.user) {
        throw new Error(authError?.message || "Credenciais inválidas.");
      }

      const user = authData.user;

      const { data: userData, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .eq('id', user.id)
        .single();

      if (staffError || !userData) {
        throw new Error("Usuário autenticado, mas perfil não encontrado no Aura.");
      }

      const staff = userData as Staff;
      if (!staff.active) {
        throw new Error("Esta conta foi desativada pela administração.");
      }



      toast.success(`Bem-vindo de volta, ${userData.fullName.split(' ')[0]}!`);

      const targetPath = getRedirectPath(userData.role);
      router.push(targetPath);

    } catch (err: any) {
      console.error("[Aura Login Error]", err.code);
      let message = "Falha ao acessar o sistema.";

      if (err.message) {
        if (err.message.includes("Invalid login credentials") || err.message.includes("Credenciais")) {
          message = "Credenciais inválidas.";
        } else {
          message = err.message;
        }
      }

      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-[100dvh] w-full flex flex-col items-center justify-center bg-[#141414] p-4 md:p-6 relative overflow-hidden font-sans text-white">

      {/* Iridescent Background Effect */}
      <div className="absolute top-0 right-0 w-[600px] h-[300px] bg-gradient-to-bl from-[#E6E6FA] via-[#B0E0E6]/20 to-transparent opacity-10 pointer-events-none rounded-full blur-[100px]" />

      <div className="w-full max-w-md z-10 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">

        {/* Card Principal */}
        <div className="bg-[#1c1c1c] border border-white/5 rounded-[32px] shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-8 md:p-10 space-y-8 relative overflow-hidden">

          {/* Linha de Destaque no Topo do Card */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#B0E0E6] via-[#E6E6FA] to-[#E0FFFF]"></div>

          <div className="text-center space-y-3 pb-2">
            <div className="w-32 h-32 mx-auto relative drop-shadow-[0_0_15px_rgba(224,255,255,0.15)] mb-2">
              <Image src="/logo_transp.PNG" alt="Aura Chameleon Logo" fill className="object-contain" priority />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-widest text-[#E0FFFF] uppercase drop-shadow-md">AURA</h1>
            <p className="text-[#E6E6FA]/60 text-[10px] tracking-[0.2em] font-bold uppercase mt-1">Portal de Gestão e Operações</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3 text-red-400 text-sm animate-in zoom-in duration-200">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p className="font-bold uppercase tracking-wide text-xs">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 ml-1">E-mail Corporativo</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[#E0FFFF] transition-colors" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@aura.com"
                  className="w-full bg-[#111] border border-white/10 p-4 pl-12 rounded-2xl text-white outline-none focus:ring-2 focus:ring-[#E0FFFF]/30 focus:border-[#E0FFFF]/50 transition-all placeholder:text-white/20 font-bold text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 ml-1">Senha</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[#E0FFFF] transition-colors" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#111] border border-white/10 p-4 pl-12 pr-12 rounded-2xl text-white outline-none focus:ring-2 focus:ring-[#E0FFFF]/30 focus:border-[#E0FFFF]/50 transition-all placeholder:text-white/20 font-bold text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-[#E0FFFF] transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-6 bg-gradient-to-r from-[#00BFFF]/20 to-[#E0FFFF]/10 border border-[#00BFFF]/30 text-[#E0FFFF] font-black uppercase tracking-[0.2em] text-[11px] rounded-2xl hover:bg-[#00BFFF]/30 hover:shadow-[0_0_20px_rgba(0,191,255,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Acessando The Engine...</> : "Entrar no Sistema"}
            </button>
          </form>
        </div>

        {/* Rodapé Atualizado */}
        <div className="mt-8 text-center opacity-40 hover:opacity-100 transition-opacity">
          <p className="text-[9px] text-[#E0FFFF] uppercase tracking-[0.3em] font-black">
            Powered by Aura Experience
          </p>
        </div>

      </div>
    </main>
  );
}
