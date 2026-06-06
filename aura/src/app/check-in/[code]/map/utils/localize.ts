import { MapLang } from "../types";

// Resolve campos traduzidos inline (name/name_en/name_es) por idioma,
// caindo no valor padrão (PT) quando a tradução não existe.

type Named = { name: string; name_en?: string; name_es?: string };
type Described = { description?: string; description_en?: string; description_es?: string };

export function localizedName(a: Named, lang: MapLang): string {
    if (lang === "en" && a.name_en) return a.name_en;
    if (lang === "es" && a.name_es) return a.name_es;
    return a.name;
}

export function localizedDescription(a: Described, lang: MapLang): string {
    if (lang === "en" && a.description_en) return a.description_en;
    if (lang === "es" && a.description_es) return a.description_es;
    return a.description ?? "";
}
