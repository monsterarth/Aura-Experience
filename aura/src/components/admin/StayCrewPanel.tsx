// src/components/admin/StayCrewPanel.tsx
// "Quem cuidou desta estadia": recepção (check-in/check-out), conferência de frigobar,
// camareiras e a governanta que liberou. Carrega sob demanda (só ao abrir a ficha) via
// /api/admin/survey-responses/housekeeping.
"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, UserCheck, Users, LogIn, LogOut, ConciergeBell, ClipboardCheck } from "lucide-react";
import type { CrewActor, CrewConference, StayCrewTask } from "@/services/housekeeping-service";

const PHASE_LABEL: Record<string, string> = {
    preparo: "Preparo da cabana",
    estadia: "Durante a estadia",
    saida: "Após o check-out",
};

// Cada tarefa tem seu próprio jogo de responsáveis — mostrar linha vazia onde o papel não
// existe faz parecer que alguém esqueceu de registrar:
// · revisão de entrada é a própria conferência da governanta (não tem executor a cobrar);
// · arrumação e troca de enxoval são executadas e não passam por conferência;
// · faxina de troca tem os dois papéis.
const ROLES: Record<string, { exec: "always" | "ifAny" | "never"; release: boolean }> = {
    inspection_checkin: { exec: "ifAny", release: true },
    inspection_checkout: { exec: "ifAny", release: true },
    daily: { exec: "always", release: false },
    linen_change: { exec: "always", release: false },
};
const rolesOf = (type: string) => ROLES[type] ?? { exec: "always" as const, release: true };

const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const fmtStamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

interface Crew {
    tasks: StayCrewTask[];
    reception: { checkIn: CrewActor | null; checkOut: CrewActor | null };
    conference: CrewConference | null;
}

export function StayCrewPanel({ stayId, propertyId }: { stayId?: string; propertyId?: string }) {
    const [crew, setCrew] = useState<Crew | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        if (!stayId) { setCrew(null); return; }
        setLoading(true); setFailed(false);
        const qs = new URLSearchParams({ stayId, ...(propertyId ? { propertyId } : {}) });
        fetch(`/api/admin/survey-responses/housekeeping?${qs}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
            .then(d => {
                if (!alive) return;
                setCrew({
                    tasks: Array.isArray(d?.tasks) ? d.tasks : [],
                    reception: { checkIn: d?.reception?.checkIn ?? null, checkOut: d?.reception?.checkOut ?? null },
                    conference: d?.conference ?? null,
                });
            })
            .catch(() => { if (alive) { setCrew(null); setFailed(true); } })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [stayId, propertyId]);

    const groups = (["preparo", "estadia", "saida"] as const)
        .map(phase => ({ phase, items: (crew?.tasks || []).filter(t => t.phase === phase) }))
        .filter(g => g.items.length > 0 || (g.phase === "saida" && !!crew?.conference));

    const DeskLine = ({ icon, label, actor }: { icon: React.ReactNode; label: string; actor: CrewActor | null }) => (
        <div className="flex items-center justify-between gap-3 bg-muted/30 rounded-lg px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm text-foreground/80 shrink-0">{icon} {label}</span>
            <span className="text-sm text-right min-w-0">
                {actor ? (
                    <>
                        <span className="font-semibold text-foreground">{actor.name}</span>
                        {actor.at && <span className="block text-[11px] text-muted-foreground">{fmtStamp(actor.at)}</span>}
                    </>
                ) : <span className="text-muted-foreground italic">Sem registro</span>}
            </span>
        </div>
    );

    const Header = () => (
        <h3 className="text-sm font-bold border-b pb-2 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Quem atendeu esta estadia
        </h3>
    );

    if (loading) {
        return (
            <div>
                <Header />
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando a equipe…
                </div>
            </div>
        );
    }

    return (
        <div>
            <Header />

            {failed ? (
                <p className="text-sm text-muted-foreground italic">Não foi possível carregar a equipe desta estadia.</p>
            ) : (
                <div className="space-y-4">
                    <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                            <ConciergeBell className="w-3.5 h-3.5" /> Recepção
                        </h4>
                        <div className="space-y-2">
                            <DeskLine icon={<LogIn className="w-3.5 h-3.5 text-muted-foreground" />} label="Check-in" actor={crew?.reception.checkIn ?? null} />
                            <DeskLine icon={<LogOut className="w-3.5 h-3.5 text-muted-foreground" />} label="Check-out" actor={crew?.reception.checkOut ?? null} />
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Limpeza e conferência
                        </h4>
                        {!groups.length ? (
                            <p className="text-sm text-muted-foreground italic">Sem registro de governança para esta estadia.</p>
                        ) : (
                            <div className="space-y-4">
                                {groups.map(g => (
                                    <div key={g.phase}>
                                        <p className="text-[11px] font-semibold text-foreground/70 mb-1.5">{PHASE_LABEL[g.phase]}</p>
                                        <div className="space-y-2">
                                            {/* A conferência do frigobar vem antes de qualquer limpeza — por isso abre a fase. */}
                                            {g.phase === "saida" && crew?.conference && (
                                                <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5">
                                                    <div className="flex items-center justify-between gap-2 text-sm">
                                                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                                                            <ClipboardCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                                                            Conferência de frigobar e achados
                                                        </span>
                                                        {crew.conference.at && (
                                                            <span className="text-xs text-muted-foreground shrink-0">{fmtStamp(crew.conference.at)}</span>
                                                        )}
                                                    </div>
                                                    <p className="mt-1.5 text-xs text-foreground/80">
                                                        {crew.conference.by
                                                            ? <>Conferida por <strong className="font-semibold">{crew.conference.by}</strong></>
                                                            : "Concluída, sem autor registrado"}
                                                    </p>
                                                    {crew.conference.source === "lost_items" && (
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">deduzido de quem registrou os objetos esquecidos</p>
                                                    )}
                                                </div>
                                            )}

                                            {g.items.map(t => {
                                                const roles = rolesOf(t.type);
                                                const showExec = roles.exec === "always" || (roles.exec === "ifAny" && t.cleaners.length > 0);
                                                return (
                                                    <div key={t.id} className="bg-muted/30 rounded-lg px-3 py-2.5">
                                                        <div className="flex items-center justify-between gap-2 text-sm">
                                                            <span className="font-semibold text-foreground">{t.typeLabel}</span>
                                                            <span className="text-xs text-muted-foreground shrink-0">{fmtDay(t.date)}</span>
                                                        </div>
                                                        <div className="mt-1.5 flex flex-col gap-1 text-xs">
                                                            {showExec && (
                                                                <span className="flex items-center gap-1.5 text-foreground/80">
                                                                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                                    {t.cleaners.length ? t.cleaners.join(", ") : "Ninguém registrado na execução"}
                                                                </span>
                                                            )}
                                                            {roles.release && (
                                                                <span className="flex items-center gap-1.5 text-foreground/80">
                                                                    <UserCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                                    {t.conferredBy ? `Liberada por ${t.conferredBy}` : `Sem liberação registrada · ${t.statusLabel}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
