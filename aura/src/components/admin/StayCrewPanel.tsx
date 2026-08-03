// src/components/admin/StayCrewPanel.tsx
// "Quem cuidou desta cabana": camareiras + governanta que conferiu, para a estadia
// avaliada. Carrega sob demanda (só ao abrir a ficha) via /api/admin/survey-responses/housekeeping.
"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, UserCheck, Users } from "lucide-react";
import type { StayCrewTask } from "@/services/housekeeping-service";

const PHASE_LABEL: Record<string, string> = {
    preparo: "Preparo da cabana",
    estadia: "Durante a estadia",
    saida: "Conferência de saída",
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export function StayCrewPanel({ stayId, propertyId }: { stayId?: string; propertyId?: string }) {
    const [tasks, setTasks] = useState<StayCrewTask[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        if (!stayId) { setTasks([]); return; }
        setLoading(true); setFailed(false);
        const qs = new URLSearchParams({ stayId, ...(propertyId ? { propertyId } : {}) });
        fetch(`/api/admin/survey-responses/housekeeping?${qs}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
            .then(d => { if (alive) setTasks(Array.isArray(d?.tasks) ? d.tasks : []); })
            .catch(() => { if (alive) { setTasks([]); setFailed(true); } })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [stayId, propertyId]);

    const groups = (["preparo", "estadia", "saida"] as const)
        .map(phase => ({ phase, items: (tasks || []).filter(t => t.phase === phase) }))
        .filter(g => g.items.length > 0);

    return (
        <div>
            <h3 className="text-sm font-bold border-b pb-2 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Limpeza e conferência
            </h3>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando a equipe…
                </div>
            ) : !groups.length ? (
                <p className="text-sm text-muted-foreground italic">
                    {failed ? "Não foi possível carregar a equipe desta estadia." : "Sem registro de governança para esta estadia."}
                </p>
            ) : (
                <div className="space-y-4">
                    {groups.map(g => (
                        <div key={g.phase}>
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{PHASE_LABEL[g.phase]}</h4>
                            <div className="space-y-2">
                                {g.items.map(t => (
                                    <div key={t.id} className="bg-muted/30 rounded-lg px-3 py-2.5">
                                        <div className="flex items-center justify-between gap-2 text-sm">
                                            <span className="font-semibold text-foreground">{t.typeLabel}</span>
                                            <span className="text-xs text-muted-foreground shrink-0">{fmt(t.date)}</span>
                                        </div>
                                        <div className="mt-1.5 flex flex-col gap-1 text-xs">
                                            <span className="flex items-center gap-1.5 text-foreground/80">
                                                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                {t.cleaners.length ? t.cleaners.join(", ") : "Ninguém registrado na execução"}
                                            </span>
                                            <span className="flex items-center gap-1.5 text-foreground/80">
                                                <UserCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                {t.conferredBy ? `Conferida por ${t.conferredBy}` : `Sem conferência registrada · ${t.statusLabel}`}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
