// src/app/admin/login/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { setCookie } from "cookies-next";
import { Loader2, ShieldCheck, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        throw new Error("Usuário autenticado, mas perfil não encontrado no Aura.");
      }

      const userData = userDoc.data() as Staff;

      if (!userData.active) {
        throw new Error("Esta conta foi desativada pela administração.");
      }

      // Cookie de Sessão
      setCookie('aura-session', 'true', { 
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
        sameSite: 'lax'
      });

      toast.success(`Bem-vindo de volta, ${userData.fullName.split(' ')[0]}!`);

      const targetPath = getRedirectPath(userData.role);
      router.push(targetPath);

    } catch (err: any) {
      console.error("[Aura Login Error]", err.code);
      let message = "Falha ao acessar o sistema.";
      
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-email') {
        message = "Credenciais inválidas.";
      } else if (err.message) {
        message = err.message;
      }
      
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4 md:p-6 relative overflow-hidden font-sans text-slate-900 dark:text-slate-50">
      
      {/* Background Effects Suaves */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-100 z-0 pointer-events-none"></div>

      <div className="w-full max-w-md z-10 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
        
        {/* Card Principal */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-xl dark:shadow-2xl p-8 md:p-10 space-y-8 relative overflow-hidden">
          
          {/* Linha de Destaque no Topo do Card */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary to-blue-500"></div>

          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto border border-primary/20 shadow-inner mb-6">
              <ShieldCheck className="text-primary w-8 h-8" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">Aura Engine</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base font-medium">Portal de Gestão e Operações</p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-4 rounded-xl flex items-start gap-3 text-red-600 dark:text-red-400 text-sm animate-in zoom-in duration-200">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">E-mail Corporativo</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 group-focus-within:text-primary transition-colors" size={20} />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@aura.com"
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 p-4 pl-12 rounded-2xl text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-600 font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Senha</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 group-focus-within:text-primary transition-colors" size={20} />
                <input 
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 p-4 pl-12 pr-12 rounded-2xl text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-600 font-medium"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-primary text-white dark:text-zinc-950 font-bold uppercase tracking-wide rounded-2xl hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Acessando...</> : "Entrar no Sistema"}
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
    </main>
  );
}
