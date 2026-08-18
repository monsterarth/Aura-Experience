// src/app/casamento/page.tsx
// Tela do código de 6 dígitos — molde do /check-in/login: server action com
// rate-limit por IP + delay no erro, auto-submit quando o código vem na URL
// (?code=123456, o formato do QR/link do convite).
"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { validateWeddingCode } from "@/app/actions/wedding-site-actions";
import { Loader2, ArrowRight, Heart } from "lucide-react";
// Toaster local: o global vive no layout do admin — aqui é página pública.
import { toast, Toaster } from "sonner";

function WeddingCodeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code");

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(!!codeFromUrl);
  const hasAutoSubmitted = useRef(false);

  const executeLogin = async (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, 6);
    if (clean.length !== 6) {
      toast.error("O código tem 6 números — confira no convite.");
      setAutoLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { code: valid } = await validateWeddingCode(clean);
      router.push(`/casamento/${valid}`);
    } catch (error) {
      if (error instanceof Error && error.message === "RATE_LIMITED") {
        toast.error("Muitas tentativas. Aguarde 15 minutos e tente novamente.");
      } else {
        toast.error("Código não encontrado — confira no convite.");
      }
      setLoading(false);
      setAutoLoading(false);
    }
  };

  useEffect(() => {
    if (codeFromUrl && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      const clean = codeFromUrl.replace(/\D/g, "").slice(0, 6);
      setCode(clean);
      executeLogin(clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  if (autoLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-stone-100 text-stone-900">
        <Loader2 className="w-12 h-12 text-rose-400 animate-spin" />
        <p className="mt-6 text-stone-500 text-sm font-medium">Abrindo o site do casamento…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 md:p-6 bg-stone-100 text-stone-900 relative overflow-hidden font-sans">
      <Toaster richColors position="top-center" />
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-rose-200/40 via-transparent to-transparent z-0" />

      <div className="z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
        <div className="bg-white border border-stone-200 rounded-3xl shadow-xl p-8 md:p-10 space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-rose-300 to-amber-300" />

          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto border border-rose-100 shadow-inner mb-6">
              <Heart className="text-rose-400 w-8 h-8" fill="currentColor" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ fontFamily: "Georgia, serif", fontWeight: 500 }}>
              Convidados
            </h1>
            <p className="text-stone-500 text-sm md:text-base font-medium">
              Digite o código de 6 números que veio no convite.
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); executeLogin(code); }} className="space-y-6">
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-full bg-stone-50 border border-stone-300 rounded-2xl p-5 text-center text-3xl font-black tracking-[0.35em] outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100 transition-all placeholder:tracking-[0.25em] placeholder:text-stone-300"
              maxLength={6}
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-rose-400 hover:bg-rose-500 text-white font-bold uppercase tracking-wide py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-rose-200 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Entrar <ArrowRight className="w-5 h-5" /></>}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center opacity-60 hover:opacity-100 transition-opacity">
          <p className="text-[11px] text-stone-500 uppercase tracking-widest font-bold">
            Powered by Aura Experience
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WeddingCodePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-stone-100">
        <Loader2 className="w-10 h-10 text-rose-400 animate-spin" />
      </div>
    }>
      <WeddingCodeContent />
    </Suspense>
  );
}
