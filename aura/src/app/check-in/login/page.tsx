// src/app/check-in/login/page.tsx
"use client";

import React, { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Loader2, Key, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function GuestLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 5) return toast.error("O código deve ter 5 dígitos.");

    setLoading(true);
    try {
      // Busca a estadia pelo Access Code
      const staysRef = collection(db, "stays");
      const q = query(
        staysRef, 
        where("accessCode", "==", code.toUpperCase()), 
        where("status", "==", "pending"),
        limit(1)
      );
      
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast.error("Código inválido ou check-in já realizado.");
        setLoading(false);
        return;
      }

      const stayData = querySnapshot.docs[0].data();
      
      toast.success("Reserva localizada! Bem-vindo.");
      
      // Redireciona para o formulário de pré-check-in passando o ID da estadia
      router.push(`/check-in/form/${querySnapshot.docs[0].id}`);

    } catch (error) {
      console.error(error);
      toast.error("Erro ao validar código. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] p-6 relative overflow-hidden">
      {/* Background Decorativo Aura */}
      <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md space-y-12 z-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
        
        {/* Header Branding */}
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 rounded-[24px] bg-primary/10 border border-primary/20 text-primary mb-2 shadow-[0_0_30px_rgba(var(--primary),0.1)]">
            <ShieldCheck size={48} strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase">Aura Portal</h1>
          <p className="text-muted-foreground font-medium text-lg italic">Sua experiência digital começa aqui.</p>
        </div>

        {/* Input Card */}
        <div className="bg-[#141414] border border-white/5 p-10 rounded-[40px] shadow-2xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-white font-bold text-xl">Acesso à Hospedagem</h2>
            <p className="text-white/40 text-sm">Digite o código enviado pela nossa equipe.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="relative group">
              <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={24} />
              <input 
                type="text"
                maxLength={5}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="EX: A7B9C"
                className="w-full bg-black/40 border border-white/10 p-6 pl-14 rounded-3xl text-3xl font-black text-white tracking-[0.3em] outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-white/5 uppercase"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 5}
              className="w-full py-5 bg-primary text-primary-foreground font-black text-xl rounded-3xl hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" /> Verificando...
                </>
              ) : (
                <>
                  Acessar Pré-checkin <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>

        <footer className="text-center">
          <p className="text-[10px] text-white/20 uppercase tracking-[0.3em] font-bold">
            Powered by Aura Experience Engine &bull; Security Node 2026
          </p>
        </footer>
      </div>
    </main>
  );
}