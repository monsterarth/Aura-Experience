// src/app/p/[code]/page.tsx
//
// A plaqueta. URL pública e PERMANENTE de um item de patrimônio — o QR gravado
// no metal aponta para cá e nunca vai apontar para outro lugar.
//
// Server component de propósito: uma ida ao servidor e a página já vem pintada.
// O idioma "client page → API route" do admin existe para validar sessão, o que
// aqui não se aplica. Sem sessão, sem waterfall, funciona no 3G da mata.
//
// O que a página mostra é exatamente AssetPublicView — nada de custo, fornecedor,
// nota fiscal, depreciação ou número de série. Ver asset-public-service.ts.
import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck, MapPin, Package } from "lucide-react";
import { AssetPublicService } from "@/services/asset-public-service";
import { AssetStatus } from "@/types/aura";
import ReportForm from "./ReportForm";
import StaffShortcut from "./StaffShortcut";

export const dynamic = "force-dynamic";

/** A URL de uma plaqueta jamais deve entrar num índice de busca. */
export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const ficha = await AssetPublicService.getPublicFicha(params.code);
  return {
    title: ficha ? `${ficha.name} · ${ficha.property.name}` : "Patrimônio",
    robots: { index: false, follow: false },
  };
}

const STATUS_LABEL: Record<AssetStatus, string> = {
  active: "Em operação",
  maintenance: "Em manutenção",
  inactive: "Inativo",
  disposed: "Baixado",
  written_off: "Baixa contábil",
};

export default async function AssetPublicPage({ params }: { params: { code: string } }) {
  const ficha = await AssetPublicService.getPublicFicha(params.code);
  // Código inválido e ativo inexistente dão a mesma resposta: um palpite não
  // pode distinguir "não existe" de "existe mas some".
  if (!ficha) notFound();

  const c = ficha.property.theme?.colors;
  const style = {
    "--bg": c?.background ?? "#FAF8F5",
    "--surface": c?.surface ?? "#FFFFFF",
    "--fg": c?.textMain ?? "#2B2620",
    "--muted": c?.textMuted ?? "#8A8178",
    "--brand": c?.primary ?? "#2B2620",
    "--on-brand": c?.onPrimary ?? "#FFFFFF",
    "--line": "rgba(0,0,0,0.10)",
  } as React.CSSProperties;

  const place = ficha.cabinName ?? ficha.locationName;

  return (
    <main style={style} className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--fg)]">
      <div className="mx-auto w-full max-w-md space-y-5">

        <header className="text-center">
          {ficha.property.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ficha.property.logoUrl} alt={ficha.property.name} className="mx-auto h-12 object-contain" />
          ) : (
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--muted)]">{ficha.property.name}</p>
          )}
        </header>

        <section className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
          {ficha.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ficha.imageUrl} alt={ficha.name} className="h-52 w-full object-cover" />
          )}
          <div className="space-y-3 p-5">
            <div>
              <h1 className="text-2xl font-bold leading-tight">{ficha.name}</h1>
              {(ficha.brand || ficha.model) && (
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {[ficha.brand, ficha.model].filter(Boolean).join(" ")}
                </p>
              )}
            </div>

            <dl className="space-y-2 text-sm">
              {ficha.assetTag && (
                <div className="flex items-center gap-2">
                  <Package size={15} className="shrink-0 text-[var(--muted)]" />
                  <dt className="sr-only">Nº de patrimônio</dt>
                  <dd><span className="font-mono font-semibold">#{ficha.assetTag}</span>
                    {ficha.categoryName && <span className="text-[var(--muted)]"> · {ficha.categoryName}</span>}
                  </dd>
                </div>
              )}
              {place && (
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="shrink-0 text-[var(--muted)]" />
                  <dt className="sr-only">Local</dt>
                  <dd>{place}</dd>
                </div>
              )}
              {ficha.warrantyStatus !== "none" && (
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="shrink-0 text-[var(--muted)]" />
                  <dt className="sr-only">Garantia</dt>
                  <dd>
                    {ficha.warrantyStatus === "expired"
                      ? <span className="text-[var(--muted)]">Garantia vencida</span>
                      : <>Em garantia até {new Date(ficha.warrantyUntil as string).toLocaleDateString("pt-BR")}</>}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex items-center justify-between border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
              <span>{STATUS_LABEL[ficha.status]}</span>
              <span className="font-mono tracking-widest">{ficha.publicCode}</span>
            </div>
          </div>
        </section>

        <ReportForm code={ficha.publicCode} assetName={ficha.name} />

        <StaffShortcut assetId={ficha.id} />

        <p className="pt-2 text-center text-xs text-[var(--muted)]">
          {ficha.property.name} · sistema Aura
        </p>
      </div>
    </main>
  );
}
