"use client";

import { useEffect, useState } from "react";

/* Tempo atual via Open-Meteo (gratuito, sem chave, CORS liberado).
   Recebe lat/lng do centro do mapa da propriedade; sem coords → no-op. */
export function useWeather(lat?: number, lng?: number) {
    const [tempC, setTempC] = useState<number | null>(null);
    const [code, setCode] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) return;
        let alive = true;
        setLoading(true);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`;
        fetch(url)
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (!alive || !j?.current) return;
                setTempC(typeof j.current.temperature_2m === "number" ? j.current.temperature_2m : null);
                setCode(typeof j.current.weather_code === "number" ? j.current.weather_code : null);
            })
            .catch(() => { /* sem tempo → chip some */ })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [lat, lng]);

    return { tempC, code, loading };
}

/* Código WMO → ícone do set do portal (sun/cloud/droplet/bolt). */
export function weatherIcon(code: number | null): string {
    if (code == null) return "cloud";
    if (code === 0) return "sun";          // céu limpo
    if (code <= 48) return "cloud";        // nublado/névoa
    if (code <= 67) return "droplet";      // garoa/chuva
    if (code <= 77) return "cloud";        // neve (sem ícone próprio)
    if (code <= 82) return "droplet";      // pancadas de chuva
    if (code <= 86) return "cloud";        // pancadas de neve
    return "bolt";                         // 95-99 trovoada
}
