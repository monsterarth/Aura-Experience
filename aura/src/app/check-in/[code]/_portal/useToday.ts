"use client";

import { useEffect, useState } from "react";

export interface TodayItem {
    id: string;
    kind: "breakfast" | "booking" | "event" | "concierge" | "checkout" | "dnd";
    icon: string;
    tone: string;
    urgent?: boolean;
    sortKey: number;
    data: Record<string, unknown>;
}

/** Busca a agenda do dia (/api/guest/today). Falha → lista vazia (seção some). */
export function useToday(stayId: string, propertyId: string, accessCode: string) {
    const [items, setItems] = useState<TodayItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const qs = new URLSearchParams({ stayId, propertyId, accessCode, date });
        fetch(`/api/guest/today?${qs.toString()}`)
            .then(r => (r.ok ? r.json() : { items: [] }))
            .then(j => { if (alive) setItems(Array.isArray(j?.items) ? j.items : []); })
            .catch(() => { if (alive) setItems([]); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [stayId, propertyId, accessCode]);

    return { items, loading };
}
