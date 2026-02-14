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
import { cn } from "@/lib/utils";
import { Staff } from "@/types/aura";

export default function AdminLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Limpa erros ao digitar
  useEffect(() => {
    if (error) setError(null);
  }, [email, password]);

  /**
   * Determina para onde enviar o usuário após o login baseado no seu cargo.
   */
  const getRedirectPath = (role: Staff['role']) => {
    switch (role) {
      case 'super_admin':
        return "/admin/core/properties";
      case 'maintenance':
        return "/admin/maintenance";
      case 'governance':
        return "/admin/governance";
      case 'kitchen':
        return "/admin/kitchen";
      case 'marketing':
        return "/admin/marketing";
      case 'admin':
      case 'reception':
      default:
        return "/admin/dashboard";
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Autenticação no Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Busca o Perfil e Cargo no Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        throw new Error("Usuário autenticado, mas perfil não encontrado no Aura.");
      }

      const userData = userDoc.data() as Staff;

      if (!userData.active) {
        throw new Error("Esta conta foi desativada pela administração.");
      }

      // 3. Define o Cookie de Sessão para o Middleware (Expira em 7 dias)
      setCookie('aura-session', 'true', { 
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
        sameSite: 'lax'
      });

      toast.success(`Bem-vindo de volta, ${userData.fullName.split(' ')[0]}!`);

      // 4. Redirecionamento Baseado em Cargo
      const targetPath = getRedirectPath(userData.role);
      router.push(targetPath);

    } catch (err: any) {
      console.error("[Aura Login Error]", err.code);
      let message = "Falha ao acessar o sistema. Verifique suas credenciais.";
      
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        message = "E-mail ou senha incorretos.";
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
    <main className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a] p-4 overflow-hidden relative">
      {/* Efeito Visual de Fundo (Aura Style) */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Logo e Título */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-2">
            <ShieldCheck size={40} strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white">AURA ENGINE</h1>
          <p className="text-muted-foreground font-medium">Portal de Gestão e Operações</p>
        </div>

        {/* Card de Login */}
        <div className="bg-[#141414] border border-white/5 p-8 rounded-[32px] shadow-2xl space-y-6">
          
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl flex items-start gap-3 text-destructive text-sm animate-in zoom-in duration-200">
              <AlertCircle size={18} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">Identificação</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={20} />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-black/40 border border-white/10 p-4 pl-12 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-white/10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">Chave de Acesso</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={20} />
                <input 
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/40 border border-white/10 p-4 pl-12 pr-12 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-white/10"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-primary text-primary-foreground font-black text-lg rounded-2xl hover:shadow-[0_0_20px_rgba(var(--primary),0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" /> Verificando...
                </>
              ) : (
                "Entrar no Sistema"
              )}
            </button>
          </form>

          <div className="text-center">
            <button 
              type="button"
              className="text-xs font-bold text-white/30 hover:text-primary transition-colors uppercase tracking-tighter"
              onClick={() => toast.info("Contacte o seu administrador para recuperar a senha.")}
            >
              Esqueceu sua chave?
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-white/20 uppercase tracking-[0.2em]">
          Powered by Aura Experience Engine &bull; 2026
        </p>
      </div>
    </main>
  );
}