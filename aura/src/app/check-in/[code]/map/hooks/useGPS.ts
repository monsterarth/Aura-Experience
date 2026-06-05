"use client";

import { useState, useEffect, useRef } from "react";

export interface GpsPosition {
    lat: number;
    lng: number;
    accuracy: number; // metros
}

interface UseGPSResult {
    pos: GpsPosition | null;
    error: string | null;
}

// Encapsula navigator.geolocation.watchPosition com tratamento de erros:
// - permissão negada / indisponível → expõe `error`, mas mantém o mapa funcional
// - timeout → silencioso (sem ponto azul)
// - sinal perdido → mantém última posição por até 30s, depois limpa
export function useGPS(): UseGPSResult {
    const [pos, setPos] = useState<GpsPosition | null>(null);
    const [error, setError] = useState<string | null>(null);
    const watchId = useRef<number | null>(null);
    const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setError("GPS indisponível");
            return;
        }

        watchId.current = navigator.geolocation.watchPosition(
            ({ coords }) => {
                setError(null);
                setPos({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
                // reinicia o timer de "posição obsoleta"
                if (staleTimer.current) clearTimeout(staleTimer.current);
                staleTimer.current = setTimeout(() => setPos(null), 30000);
            },
            (err) => {
                // PERMISSION_DENIED = 1 → mostra aviso; demais erros (timeout/posição) ficam silenciosos
                if (err.code === err.PERMISSION_DENIED) setError("GPS desativado");
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );

        return () => {
            if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
            if (staleTimer.current) clearTimeout(staleTimer.current);
        };
    }, []);

    return { pos, error };
}
