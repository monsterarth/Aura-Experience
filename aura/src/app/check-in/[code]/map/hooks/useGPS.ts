"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface GpsPosition {
    lat: number;
    lng: number;
    accuracy: number;
}

export type GpsStatus =
    | "idle"         // permissão nunca solicitada nesta sessão
    | "requesting"   // aguardando posição após permissão concedida
    | "active"       // posição disponível
    | "denied"       // browser bloqueou (permissão negada anteriormente)
    | "unavailable"; // API não existe no browser

interface UseGPSResult {
    pos: GpsPosition | null;
    status: GpsStatus;
    request: () => void;
}

export function useGPS(): UseGPSResult {
    const [pos, setPos] = useState<GpsPosition | null>(null);
    const [status, setStatus] = useState<GpsStatus>("idle");
    const watchId = useRef<number | null>(null);
    const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Verifica o estado da permissão assim que o hook monta.
    // - denied  → mostra instruções imediatamente, sem precisar tocar no botão
    // - granted → inicia rastreamento automaticamente (usuário já aprovou antes)
    // - prompt  → aguarda o toque do botão
    useEffect(() => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setStatus("unavailable");
            return;
        }
        if (!navigator.permissions) return; // browser antigo — aguarda botão

        navigator.permissions
            .query({ name: "geolocation" })
            .then((result) => {
                if (result.state === "denied") {
                    setStatus("denied");
                } else if (result.state === "granted") {
                    startWatch(); // já autorizado, começa direto
                }
                // "prompt" → aguarda botão
                result.onchange = () => {
                    if (result.state === "denied") setStatus("denied");
                    else if (result.state === "granted") startWatch();
                };
            })
            .catch(() => {/* browser não suporta query de geolocation */});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const startWatch = useCallback(() => {
        if (watchId.current != null) return;
        setStatus("requesting");

        watchId.current = navigator.geolocation.watchPosition(
            ({ coords }) => {
                setStatus("active");
                setPos({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
                if (staleTimer.current) clearTimeout(staleTimer.current);
                staleTimer.current = setTimeout(() => {
                    setPos(null);
                    setStatus("idle");
                    if (watchId.current != null) {
                        navigator.geolocation.clearWatch(watchId.current);
                        watchId.current = null;
                    }
                }, 30000);
            },
            (err) => {
                setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "idle");
                if (watchId.current != null) {
                    navigator.geolocation.clearWatch(watchId.current);
                    watchId.current = null;
                }
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }, []);

    const request = useCallback(() => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setStatus("unavailable");
            return;
        }
        if (status === "denied") return; // já negado — mostra instruções, não tenta de novo
        startWatch();
    }, [status, startWatch]);

    return { pos, status, request };
}
