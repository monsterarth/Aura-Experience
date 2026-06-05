import { Structure } from "@/types/aura";

// Estrutura enriquecida com dados do mapa (vinda de /api/guest/resort-map)
export type MapArea = Structure & {
    rating: number;
    reviewCount: number;
    currentOccupancy: number;
};

// Cabana simplificada para exibição no mapa (sem dados sensíveis)
export interface MapCabin {
    id: string;
    number: string;
    name: string;
    mapPin: { lat: number; lng: number; pixelX?: number; pixelY?: number } | null;
    isOwnCabin: boolean;
}

export type MapLang = "pt" | "en" | "es";
