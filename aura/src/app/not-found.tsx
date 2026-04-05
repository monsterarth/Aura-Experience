import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#222222] text-white flex flex-col items-center justify-center px-6 py-12 text-center relative overflow-hidden">
      {/* Luz ambiente de fundo - Amarelo */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-yellow-400 rounded-full blur-[250px] opacity-10 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-6xl mx-auto">
        
        {/* Imagem Hero no Topo */}
        <div className="relative w-full max-w-5xl aspect-video md:aspect-[21/9] mb-12 rounded-3xl border border-white/10 shadow-[0_0_60px_rgba(250,204,21,0.08)] overflow-hidden">
          <Image
            src="/camaleao.png"
            alt="404 - Camaleão Aura"
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Textos Abaixo da Imagem */}
        <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
          Eita, a aura não sabe onde você queria chegar...
        </h1>
        <p className="text-gray-400 font-light mb-10 text-base md:text-xl max-w-2xl mx-auto">
          A página que você está procurando não existe ou pode ter sido movida para outro lugar.
        </p>

        {/* Botão Único de Retorno */}
        <Link
          href="/"
          className="flex items-center justify-center gap-3 px-10 py-5 rounded-2xl bg-[#00BFFF] hover:bg-[#009acd] text-white font-medium text-lg transition-all shadow-[0_0_20px_rgba(0,191,255,0.25)] hover:shadow-[0_0_30px_rgba(0,191,255,0.4)] hover:-translate-y-1"
        >
          <ArrowLeft size={22} className="opacity-80" />
          Retornar
        </Link>
        
      </div>
    </div>
  );
}
