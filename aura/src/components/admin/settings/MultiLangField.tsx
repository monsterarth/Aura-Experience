"use client";

// src/components/admin/settings/MultiLangField.tsx
// Editor de texto trilíngue (PT/EN/ES) para o que o HÓSPEDE lê: políticas, avisos,
// mensagens de check-in. O portal é obrigatoriamente trilíngue, então um texto novo
// em branco no EN/ES é uma lacuna visível para o hóspede — daí o aviso de idiomas
// pendentes em vez de deixar passar calado.
import React, { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiLangObj } from "@/types/aura";

const LANGS = ["pt", "en", "es"] as const;
type Lang = (typeof LANGS)[number];

interface Props {
  label: string;
  desc?: string;
  value: MultiLangObj;
  onChange: (v: MultiLangObj) => void;
  /** `input` para uma linha (título, aviso curto); `textarea` para texto longo. */
  as?: "textarea" | "input";
  rows?: number;
  placeholder?: string;
}

export function MultiLangField({ label, desc, value, onChange, as = "textarea", rows = 3, placeholder }: Props) {
  const [lang, setLang] = useState<Lang>("pt");
  const missing = LANGS.filter((l) => !value?.[l]?.trim());
  const hasAny = LANGS.some((l) => value?.[l]?.trim());

  const common = {
    value: value?.[lang] || "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...value, [lang]: e.target.value }),
    placeholder: placeholder ?? `Digite o texto em ${lang.toUpperCase()}...`,
    className:
      "w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground text-sm",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
            <Globe size={12} /> {label}
          </label>
          {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
        </div>
        <div className="flex bg-background rounded-lg p-1 border border-border shadow-sm shrink-0">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all relative",
                lang === l ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
              {/* Ponto = idioma sem texto. Só aparece se ALGUM idioma já tem conteúdo:
                  num campo totalmente vazio três alertas não informam nada. */}
              {hasAny && missing.includes(l) && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {as === "input" ? (
        <input {...common} />
      ) : (
        <textarea {...common} rows={rows} className={cn(common.className, "resize-none custom-scrollbar")} />
      )}

      {hasAny && missing.length > 0 && (
        <p className="text-[10px] text-amber-500">
          Sem texto em {missing.map((l) => l.toUpperCase()).join(" e ")} — o hóspede nesses idiomas verá o campo vazio.
        </p>
      )}
    </div>
  );
}
