import { Structure } from "@/types/aura";

// Estrutura enriquecida com dados do mapa (vinda de /api/guest/resort-map)
export type MapArea = Structure & {
    rating: number;          // média de avaliações (0 se nenhuma)
    reviewCount: number;
    currentOccupancy: number; // pessoas com reserva ativa agora
};

export type MapLang = "pt" | "en" | "es";
