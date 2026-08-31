import { MapLang } from "../types";
import { pickColumn, type ColumnLang } from "@/lib/multilang";

// Wrappers finos sobre @/lib/multilang — a regra (tradução vazia cai no PT) mora lá.
// Mantidos porque seis telas do mapa já importam estes nomes.

type Named = { name: string; name_en?: string; name_es?: string };
type Described = { description?: string; description_en?: string; description_es?: string };

export function localizedName(a: Named, lang: MapLang): string {
    return pickColumn(a, "name", lang as ColumnLang);
}

export function localizedDescription(a: Described, lang: MapLang): string {
    return pickColumn(a, "description", lang as ColumnLang);
}
