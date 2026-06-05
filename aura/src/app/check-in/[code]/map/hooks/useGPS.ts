"use client";

import { useState, useRef, useCallback } from "react";

export interface GpsPosition {
    lat: number;
    lng: number;
    accuracy: number; // metros
}

export type GpsStatus =
    | "idle"        // nunca solicitado
    | "requesting"  // aguardando permissão / primeira posição
    | "active"      // tem posição
    | "denied"      // usuário negou ou sistema bloqueou
    | "unavailable"; // API não disponível no browser

interface UseGPSResult {
    pos: GpsPosition | null;
    status: GpsStatus;
    request: () => void; // chame ao toque do botão — isso garante que o dialog de permissão apareça
}

// GPS opt-in: só solicita localização quando `request()` é chamado (idealmente
// em resposta a um gesto do usuário). Isso garante que o dialog de permissão
// do browser sempre apareça, evitando a negação silenciosa em iOS/Android.
export function useGPS(): UseGPSResult {
    const [pos, setPos] = useState<GpsPosition | null>(null);
    const [status, setStatus] = useState<GpsStatus>("idle");
    const watchId = useRef<number | null>(null);
    const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const request = useCallback(() => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setStatus("unavailable");
            return;
        }
        if (watchId.current != null) return; // já ativo

        setStatus("requesting");

        watchId.current = navigator.geolocation.watchPosition(
            ({ coords }) => {
                setStatus("active");
                setPos({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
                if (staleTimer.current) clearTimeout(staleTimer.current);
                staleTimer.current = setTimeout(() => {
                    setPos(null);
                    setStatus("idle");
                    watchId.current = null;
                }, 30000);
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                    setStatus("denied");
                } else {
                    // POSITION_UNAVAILABLE ou TIMEOUT → volta a idle silenciosamente
                    setStatus("idle");
                }
                if (watchId.current != null) {
                    navigator.geolocation.clearWatch(watchId.current);
                    watchId.current = null;
                }
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }, []);

    return { pos, status, request };
}
