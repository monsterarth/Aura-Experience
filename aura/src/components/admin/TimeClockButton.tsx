"use client";

// src/components/admin/TimeClockButton.tsx
//
// Bater ponto a partir de qualquer página do admin.
//
// Mora no topo porque o gesto acontece duas vezes por dia, sempre com pressa —
// se exigir navegar até uma tela, vira coisa que se lembra às 15h e se registra
// errado. O botão mostra o estado antes da ação: quem está fora vê "Entrar",
// quem está dentro vê há quanto tempo está.
//
// Uma coisa que ele deliberadamente NÃO faz: fechar sozinho uma jornada que
// ficou aberta de ontem. Nesse caso o botão vira um aviso e manda para a página
// de ponto — bater a saída agora carimbaria uma hora que não aconteceu.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, LogIn, LogOut, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { T } from "@/lib/admin-tokens";
import { clockStatus, formatMinutes, localHM, nextPunchKind } from "@/lib/timeclock";
import type { TimeClockEvent } from "@/types/aura";

/** Janela buscada para o botão: o bastante para enxergar uma jornada esquecida. */
const LOOKBACK_DAYS = 7;

/**
 * Coordenada SEM pedir permissão.
 *
 * Só lê a posição se o navegador já tem autorização concedida — um prompt de GPS
 * disparado por um botão de ponto seria atrito puro, e a decisão foi coletar sem
 * bloquear, não interrogar. Sem permissão, a batida vai só com o IP.
 */
async function silentGeo(): Promise<{ lat: number; lng: number; geoAccuracy: number } | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.geolocation || !navigator.permissions) return null;
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    if (status.state !== "granted") return null;
    return await new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, geoAccuracy: pos.coords.accuracy }),
        () => resolve(null),
        { timeout: 4000, maximumAge: 60_000 },
      );
    });
  } catch {
    return null;
  }
}

export function TimeClockButton() {
  const router = useRouter();
  const { userData } = useAuth();
  const { currentProperty } = useProperty();
  const [events, setEvents] = useState<TimeClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Quem manda aqui é a PESSOA, não a propriedade aberta na tela. `timeSource`
  // só pode ser ligado com o módulo ativo, e o super_admin troca de pousada no
  // seletor o tempo todo — amarrar o botão à propriedade atual fazia o ponto
  // dele sumir só por estar olhando outra casa.
  const tracked = (userData?.timeSource ?? "none") === "aura";
  const active = tracked;

  const load = useCallback(async () => {
    const to = new Date();
    to.setDate(to.getDate() + 1);
    const from = new Date();
    from.setDate(from.getDate() - LOOKBACK_DAYS);
    from.setHours(0, 0, 0, 0);

    try {
      const res = await fetch(`/api/admin/timeclock?from=${from.toISOString()}&to=${to.toISOString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      /* topo do admin: falhar em silêncio é melhor que um toast de erro a cada página */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) { setLoading(false); return; }
    load();
  }, [active, load]);

  // O relógio anda sozinho; a rede não é consultada de novo.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [active]);

  const status = useMemo(() => clockStatus(events, now), [events, now]);
  const kind = nextPunchKind(status);

  const punch = async () => {
    if (!kind || saving) return;
    setSaving(true);
    try {
      const geo = await silentGeo();
      const res = await fetch("/api/admin/timeclock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "punch", kind, propertyId: currentProperty?.id, ...(geo ?? {}) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Não foi possível registrar."); return; }

      setEvents(prev => [...prev, data.event]);
      const at = localHM(data.event.ts);
      toast.success(kind === "in" ? `Entrada registrada às ${at}` : `Saída registrada às ${at}`, {
        description: kind === "out" ? `Jornada de ${formatMinutes(status.openMinutes)}.` : undefined,
      });
    } catch {
      toast.error("Sem conexão. A batida não foi registrada.");
    } finally {
      setSaving(false);
    }
  };

  if (!active || loading) return null;

  // Pendência tem precedência sobre tudo: enquanto houver jornada aberta de um
  // dia anterior, o botão não oferece batida — ele cobra a correção.
  if (status.dangling) {
    return (
      <button
        onClick={() => router.push("/admin/ponto")}
        className="ak-press"
        title={`Jornada aberta desde ${localHM(status.dangling.start.ts)} de um dia anterior`}
        style={{
          display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 10px",
          borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
          background: T.amberBg, border: `1px solid ${T.amberBorder}`, color: T.amber,
        }}
      >
        <AlertTriangle size={14} />
        <span className="hidden sm:inline">Ponto em aberto</span>
      </button>
    );
  }

  const inside = status.inside;
  const color = inside ? T.green : T.muted;
  const label = inside ? formatMinutes(status.openMinutes) : "Bater ponto";

  return (
    <button
      onClick={punch}
      disabled={saving}
      className="ak-press"
      title={inside
        ? `Dentro desde ${status.since ? localHM(status.since) : ""} — clique para registrar a saída`
        : `Registrar entrada${status.todayClosedMinutes > 0 ? ` · ${formatMinutes(status.todayClosedMinutes)} hoje` : ""}`}
      style={{
        display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 10px",
        borderRadius: 10, cursor: saving ? "wait" : "pointer", fontFamily: "inherit",
        fontSize: 12, fontWeight: 800, opacity: saving ? 0.6 : 1,
        background: inside ? T.greenBg : T.glass2,
        border: `1px solid ${inside ? T.greenBorder : T.border}`,
        color: inside ? T.green : T.text,
      }}
    >
      {inside
        ? <span style={{ width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0 }} />
        : <Clock size={14} style={{ color: T.muted }} />}
      <span className="hidden sm:inline">{label}</span>
      {inside ? <LogOut size={13} /> : <LogIn size={13} className="sm:hidden" />}
    </button>
  );
}
