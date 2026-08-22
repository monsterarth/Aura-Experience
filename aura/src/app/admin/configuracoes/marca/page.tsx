"use client";

import { SkeletonList } from "@/components/aura";

// src/app/admin/configuracoes/marca/page.tsx
// Identidade visual: nome, slogan, logos, paleta e arredondamento.
// Tudo aqui o hóspede enxerga no portal — daí o preview ao lado.
import React from "react";
import { useProperty } from "@/context/PropertyContext";
import { usePropertySection } from "../_lib/usePropertySection";
import { SaveBar } from "../_components/SaveBar";
import { PhonePreview } from "../_components/PhonePreview";
import { SectionCard } from "@/components/ui/SectionCard";
import { ColorInput } from "@/components/admin/settings/ColorInput";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { PropertyTheme } from "@/types/aura";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Palette, Layout, Type } from "lucide-react";

const RADII = ["0rem", "0.25rem", "0.5rem", "1rem", "9999px"] as const;

interface Draft {
  name: string;
  slogan: string;
  logoUrl: string;
  logoFullUrl: string;
  theme: PropertyTheme;
}

export default function MarcaPage() {
  const { currentProperty } = useProperty();
  const { draft, patch, dirty, saving, reset, save } = usePropertySection<Draft>((p) => ({
    name: p.name ?? "",
    slogan: (p.settings as { slogan?: string })?.slogan ?? "",
    logoUrl: p.logoUrl ?? "",
    logoFullUrl: (p.settings as { logoFullUrl?: string })?.logoFullUrl ?? "",
    theme: p.theme,
  }));

  if (!draft || !currentProperty) {
    return <SkeletonList rows={4} avatar={false} />;
  }

  const setColor = (key: keyof PropertyTheme["colors"], v: string) =>
    patch({ theme: { ...draft.theme, colors: { ...draft.theme.colors, [key]: v } } });

  const onSave = () => save((d) => ({
    patch: { slogan: d.slogan, logoFullUrl: d.logoFullUrl },
    columns: { name: d.name, logoUrl: d.logoUrl, theme: d.theme },
  }));

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 space-y-4">
        <SectionCard title="Identidade da marca" icon={ImageIcon}>
          <div>
            <label className="field-label">Nome da propriedade</label>
            <input className="field-input w-full" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Slogan</label>
            <input
              className="field-input w-full"
              placeholder="Sua experiência em contato com a natureza…"
              value={draft.slogan}
              onChange={(e) => patch({ slogan: e.target.value })}
            />
          </div>

          <div>
            <label className="field-label">Logo simplificada</label>
            <div className="flex gap-4 items-start">
              {/* Caixa quadrada: a marca simplificada costuma ser quadrada. */}
              <div className="h-24 w-24 shrink-0 rounded-xl overflow-hidden border border-border bg-background">
                <ImageUpload value={draft.logoUrl} onUploadSuccess={(url) => patch({ logoUrl: url })} path="logos" fit="contain" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Só a marca/símbolo. Usada no app, no portal, no centro do QR e em espaços pequenos.
                  PNG com fundo transparente é o ideal.
                </p>
                <input
                  className="field-input w-full font-mono text-xs"
                  placeholder="ou cole uma URL…"
                  value={draft.logoUrl}
                  onChange={(e) => patch({ logoUrl: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="field-label">Logo completa (marca + nome)</label>
            <div className="flex gap-4 items-start">
              {/* Caixa larga: aqui o nome vem escrito ao lado da marca. */}
              <div className="h-24 w-40 shrink-0 rounded-xl overflow-hidden border border-border bg-background">
                <ImageUpload value={draft.logoFullUrl} onUploadSuccess={(url) => patch({ logoFullUrl: url })} path="logos" fit="contain" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Para peças onde o símbolo sozinho não identifica — etiqueta de patrimônio grande,
                  cabeçalho impresso. Vazio: usa a simplificada.
                </p>
                <input
                  className="field-input w-full font-mono text-xs"
                  placeholder="ou cole uma URL…"
                  value={draft.logoFullUrl}
                  onChange={(e) => patch({ logoFullUrl: e.target.value })}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Cores do sistema" icon={Palette}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ColorInput label="Cor primária" desc="Botões principais, destaques e ícones." value={draft.theme.colors.primary} onChange={(v) => setColor("primary", v)} />
            <ColorInput label="Texto na primária" desc="Cor do texto DENTRO do botão primário." value={draft.theme.colors.onPrimary} onChange={(v) => setColor("onPrimary", v)} />
            <ColorInput label="Cor secundária" desc="Elementos de apoio, fundos alternativos." value={draft.theme.colors.secondary} onChange={(v) => setColor("secondary", v)} />
            <ColorInput label="Detalhes (accent)" desc="Bordas sutis, linhas divisórias." value={draft.theme.colors.accent} onChange={(v) => setColor("accent", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Superfícies e fundo" icon={Layout}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ColorInput label="Fundo da página" desc="A cor de fundo geral da aplicação." value={draft.theme.colors.background} onChange={(v) => setColor("background", v)} />
            <ColorInput label="Superfície (cards)" desc="Fundo de cartões, modais e painéis." value={draft.theme.colors.surface} onChange={(v) => setColor("surface", v)} />
            <ColorInput label="Texto principal" desc="Títulos e corpo de texto padrão." value={draft.theme.colors.textMain} onChange={(v) => setColor("textMain", v)} />
            <ColorInput label="Texto secundário" desc="Legendas e textos menos importantes." value={draft.theme.colors.textMuted} onChange={(v) => setColor("textMuted", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Forma" icon={Type} description="O arredondamento vale para botões, cards e campos do portal.">
          <div className="flex gap-3">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => patch({ theme: { ...draft.theme, shape: { ...draft.theme.shape, radius: r } } })}
                aria-label={`Arredondamento ${r}`}
                className={cn(
                  "w-12 h-12 border border-border bg-background transition-all",
                  draft.theme.shape.radius === r ? "ring-2 ring-primary ring-offset-2 ring-offset-card border-transparent bg-primary/10" : "hover:bg-accent",
                )}
                style={{ borderRadius: r }}
              />
            ))}
          </div>
        </SectionCard>

        <SaveBar
          dirty={dirty} saving={saving} onSave={onSave} onReset={reset}
          warning="As cores valem no portal do hóspede assim que você salvar."
        />
      </div>

      <div className="lg:col-span-5 hidden lg:block">
        <div className="sticky top-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Prévia do portal</p>
          <PhonePreview theme={draft.theme} name={draft.name} slogan={draft.slogan} logoUrl={draft.logoUrl} />
        </div>
      </div>
    </div>
  );
}
