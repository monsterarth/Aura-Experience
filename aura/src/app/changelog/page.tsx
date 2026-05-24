import type { Metadata } from "next";
import React from "react";
import { ArrowLeft, Sparkles, Zap, Wrench, TrendingUp } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getPublishedChangelogs } from "@/services/changelog-service";
import type { ChangelogEntryType } from "@/types/aura";

export const metadata: Metadata = {
  title: "Changelog — Aura Software",
  description: "Histórico de versões e atualizações da plataforma Aura.",
};

export const dynamic = "force-dynamic";

/* ─── entry type config ────────────────────────────────────────── */

const entryConfig: Record<ChangelogEntryType, {
  label: string; icon: React.ElementType; color: string; bg: string; border: string;
}> = {
  feature:     { label: "Novo",     icon: Sparkles,   color: "#00BFFF", bg: "rgba(0,191,255,0.08)",   border: "rgba(0,191,255,0.2)"  },
  improvement: { label: "Melhoria", icon: TrendingUp, color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)" },
  fix:         { label: "Correção", icon: Wrench,     color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)" },
};

/* ─── page ─────────────────────────────────────────────────────── */

export default async function ChangelogPage() {
  const releases = await getPublishedChangelogs();

  return (
    <div className="min-h-screen bg-[#141414] text-white font-sans selection:bg-[#00BFFF]/30">

      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 max-w-4xl mx-auto border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 drop-shadow-[0_0_8px_rgba(224,255,255,0.2)]">
            <Image src="/logo_transp.PNG" alt="Aura Logo" fill className="object-contain" />
          </div>
          <span className="text-lg font-black uppercase tracking-widest text-[#E0FFFF]">Aura</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar ao site
        </Link>
      </nav>

      {/* Header */}
      <header className="py-16 px-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF] text-xs font-medium mb-6">
          <Zap size={12} />
          <span>Plataforma em constante evolução</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
          Changelog
        </h1>
        <p className="text-gray-400 font-light text-lg max-w-xl">
          Histórico de versões, novas funcionalidades, melhorias e correções da plataforma Aura.
        </p>
      </header>

      {/* Legend */}
      <div className="px-6 max-w-4xl mx-auto mb-12">
        <div className="flex flex-wrap gap-3">
          {(Object.entries(entryConfig) as [ChangelogEntryType, typeof entryConfig[ChangelogEntryType]][]).map(
            ([, { label, icon: Icon, color, bg, border }]) => (
              <div
                key={label}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
                style={{ backgroundColor: bg, borderColor: border, color }}
              >
                <Icon size={11} />
                {label}
              </div>
            )
          )}
        </div>
      </div>

      {/* Timeline */}
      <main className="px-6 max-w-4xl mx-auto pb-24">
        {releases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#1a1a1a] px-8 py-16 text-center">
            <p className="text-sm text-gray-500">Nenhuma versão publicada ainda.</p>
          </div>
        ) : (
          <div className="relative">
            {/* vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/5 hidden md:block" />

            <div className="space-y-12">
              {releases.map((release, ri) => {
                const isLatest = ri === 0;
                return (
                  <div key={release.id} className="relative md:pl-10">
                    {/* timeline dot */}
                    <div
                      className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 hidden md:block"
                      style={{
                        borderColor: "#00BFFF",
                        backgroundColor: isLatest ? "#00BFFF" : "#141414",
                      }}
                    />

                    {/* release header */}
                    <div className="flex flex-wrap items-center gap-3 mb-5">
                      <span className="text-xl font-black text-white tracking-tight font-mono">
                        {release.version}
                      </span>
                      <span className="text-lg font-light text-gray-300">{release.label}</span>
                      {release.highlight && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#00BFFF]/15 text-[#00BFFF] border border-[#00BFFF]/30 uppercase tracking-wider">
                          {release.highlight}
                        </span>
                      )}
                      <span className="text-sm text-gray-600 font-mono ml-auto">
                        {new Date(release.date + "T12:00:00").toLocaleDateString("pt-BR", {
                          day: "2-digit", month: "long", year: "numeric",
                        })}
                      </span>
                    </div>

                    {/* entries */}
                    {(release.entries ?? []).length > 0 && (
                      <div className="rounded-2xl border border-white/5 bg-[#1a1a1a] divide-y divide-white/5 overflow-hidden">
                        {(release.entries ?? []).map(entry => {
                          const cfg = entryConfig[entry.type];
                          const Icon = cfg.icon;
                          return (
                            <div key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
                              <div
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 mt-0.5"
                                style={{ backgroundColor: cfg.bg, borderColor: cfg.border, color: cfg.color }}
                              >
                                <Icon size={9} />
                                {cfg.label}
                              </div>
                              <p className="text-sm text-gray-300 font-light leading-relaxed">
                                {entry.text}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 text-center text-xs text-gray-600">
        <p>
          © {new Date().getFullYear()} Aura Software —{" "}
          <Link href="/" className="hover:text-gray-400 transition-colors">
            Voltar ao site
          </Link>
        </p>
      </footer>
    </div>
  );
}
