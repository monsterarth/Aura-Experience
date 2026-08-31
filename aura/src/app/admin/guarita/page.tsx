"use client";

// /admin/guarita — o lado da recepção e da gestão: tarifa do dia, o número do
// período (que substitui a reserva-fantasma no HMAX), turnos fechados e as
// placas marcadas, e o CADASTRO de placas. Ver docs/GUARITA.md.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, Car, CircleDollarSign, Receipt, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import {
  T, PageShell, PageHeader, KpiGrid, KpiCard, Loadable, PageSkeleton,
  Card, Pill, Button, Field, FieldRow, Input, SectionLabel, EmptyState,
} from "@/components/aura";
import type { ParkingRate, ParkingShift, Vehicle, VehicleMovement } from "@/types/aura";
import { VehicleRegistry } from "./_components/VehicleRegistry";
import { formatBRL } from "@/lib/money";

interface Report {
  from: string; to: string;
  total: number; paidCount: number; freeCount: number;
  byMethod: Record<string, { count: number; total: number }>;
  byDay: { date: string; total: number; count: number; free: number }[];
  movements: VehicleMovement[];
}

interface GuaritaAdmin {
  today: string;
  rate: ParkingRate | null;
  presets: number[];
  report: Report;
  shifts: ParkingShift[];
  flaggedVehicles: Vehicle[];
}

const METHOD_LABEL: Record<string, string> = { credit: "Crédito", debit: "Débito", pix: "Pix", cash: "Dinheiro" };
const money = (v: number) => formatBRL(v);
const br = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

export default function GuaritaAdminPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "reception"]}>
      <GuaritaAdminInner />
    </RoleGuard>
  );
}

function GuaritaAdminInner() {
  const { userData } = useAuth();
  const { currentProperty } = useProperty();
  const propertyId = currentProperty?.id ?? userData?.propertyId ?? null;

  const [data, setData] = useState<GuaritaAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState("");

  const monthStart = useMemo(() => new Date().toISOString().slice(0, 8) + "01", []);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10));

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ propertyId, from, to });
      const res = await fetch(`/api/admin/guarita?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao carregar.");
      setData(json as GuaritaAdmin);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, from, to]);

  useEffect(() => { void load(); }, [load]);

  const setRate = async (amount: number, closed = false) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/guarita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, action: "set_rate", amount, closed, date: data?.today }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao salvar.");
      toast.success(closed ? "Hoje marcado como fechado." : "Tarifa do dia definida.");
      setCustom("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally { setSaving(false); }
  };

  const rate = data?.rate ?? null;
  const report = data?.report;

  return (
    <PageShell>
      <PageHeader
        title="Guarita"
        titleAccent="Estacionamento"
        icon={Car}
        badge={rate
          ? <Pill tone={rate.closed ? "neutral" : "brand"} dot label={rate.closed ? "Hoje fechado" : `Hoje ${money(rate.amount)}`} />
          : <Pill tone="amber" dot label="Tarifa de hoje não definida" />}
        subtitle="Tarifa do dia, movimento do período e turnos fechados"
        actions={<Button variant="secondary" icon={RefreshCw} onClick={load} loading={loading}>Atualizar</Button>}
      />

      <Loadable loading={loading && !data} skeleton={<PageSkeleton kpis={4} rows={5} />} error={error} onRetry={load}>
        {data && report && (
          <>
            <KpiGrid cols={4}>
              <KpiCard label="No período" value={money(report.total)} sub={`${br(report.from)} a ${br(report.to)}`} icon={CircleDollarSign} tone="brand" />
              <KpiCard label="Pagantes" value={report.paidCount} sub="veículos cobrados" icon={Receipt} tone="green" />
              <KpiCard label="Isentos" value={report.freeCount} sub="hóspedes, equipe, fornecedores" icon={Car} tone="blue" />
              <KpiCard
                label="Placas marcadas"
                value={data.flaggedVehicles.length}
                sub={data.flaggedVehicles.length ? "atenção ou liberação" : "nenhuma"}
                icon={AlertTriangle}
                tone={data.flaggedVehicles.some(v => v.status === "blacklist") ? "amber" : "neutral"}
              />
            </KpiGrid>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {/* Tarifa do dia */}
              <Card header={{ icon: CircleDollarSign, tone: "brand", title: "Tarifa de hoje", sub: rate?.setByName ? `definida por ${rate.setByName}` : "ninguém definiu ainda" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", color: rate?.closed ? T.muted : T.text }}>
                    {rate ? (rate.closed ? "Fechado" : money(rate.amount)) : "—"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {data.presets.map(v => (
                      <Button key={v} size="sm" variant="secondary" loading={saving} onClick={() => void setRate(v)}>{money(v)}</Button>
                    ))}
                  </div>
                  <FieldRow cols={2}>
                    <Field label="Outro valor">
                      <Input inputMode="decimal" value={custom} onChange={e => setCustom(e.target.value)} placeholder="0,00" />
                    </Field>
                    <Field label="&nbsp;">
                      <Button variant="primary" fullWidth loading={saving} disabled={!custom}
                        onClick={() => { const v = parseFloat(custom.replace(",", ".")); if (v > 0) void setRate(v); }}>
                        Definir
                      </Button>
                    </Field>
                  </FieldRow>
                  <Button variant="ghost" size="sm" loading={saving} onClick={() => void setRate(0, true)}>Hoje não abre</Button>
                </div>
              </Card>

              {/* Por forma */}
              <Card header={{ icon: Receipt, tone: "green", title: "Como entrou", sub: "período selecionado" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {Object.keys(report.byMethod).length === 0 ? (
                    <EmptyState compact icon={Receipt} title="Nada cobrado no período" />
                  ) : Object.entries(report.byMethod).map(([m, v]) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{METHOD_LABEL[m] ?? m}</span>
                        <span style={{ fontSize: 11.5, color: T.muted2 }}>{v.count} veículo(s)</span>
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(v.total)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Movimento por dia */}
            <Card
              header={{
                icon: CalendarRange, tone: "blue", title: "Movimento por dia",
                sub: "é este o número que a recepção lançava no HMAX",
                aside: (
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <Input type="date" fieldSize="sm" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 148 }} />
                    <Input type="date" fieldSize="sm" value={to} onChange={e => setTo(e.target.value)} style={{ width: 148 }} />
                  </span>
                ),
              }}
            >
              {report.byDay.length === 0 ? (
                <EmptyState compact icon={CalendarRange} title="Sem movimento no período" description="Escolha outras datas ou registre entradas pelo app da guarita." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {report.byDay.map(d => (
                    <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, width: 92, flexShrink: 0 }}>{br(d.date)}</span>
                      <span style={{ flex: 1, fontSize: 12, color: T.muted }}>
                        {d.count} pagante(s){d.free > 0 ? ` · ${d.free} isento(s)` : ""}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(d.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {/* Turnos */}
              <Card header={{ icon: RefreshCw, tone: "neutral", title: "Turnos", sub: "últimos fechamentos" }}>
                {data.shifts.length === 0 ? (
                  <EmptyState compact icon={RefreshCw} title="Nenhum turno ainda" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.shifts.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                        <Pill tone={s.status === "open" ? "green" : "neutral"} dot label={s.status === "open" ? "aberto" : `#${s.number}`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {s.closedByName ?? s.openedByName ?? "—"}
                          </div>
                          <div style={{ fontSize: 11.5, color: T.muted }}>
                            {new Date(s.openedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            {s.closedAt ? ` → ${new Date(s.closedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                          </div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                          {s.summary ? money(s.summary.total) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Placas marcadas */}
              {propertyId && <VehicleRegistry propertyId={propertyId} />}

              <Card header={{ icon: AlertTriangle, tone: "amber", title: "Placas marcadas", sub: "atenção e liberação permanente" }}>
                {data.flaggedVehicles.length === 0 ? (
                  <EmptyState compact icon={AlertTriangle} title="Nenhuma placa marcada" description="Placas em atenção aparecem aqui e alertam o guarita na entrada." />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.flaggedVehicles.map(v => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700, letterSpacing: ".05em" }}>{v.plate}</span>
                        <Pill tone={v.status === "blacklist" ? "red" : "green"} label={v.status === "blacklist" ? "atenção" : "liberado"} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {v.statusReason || "sem motivo registrado"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <SectionLabel style={{ marginTop: 4 }}>
              O app da guarita fica em <span style={{ color: T.brandText }}>/porter</span>
            </SectionLabel>
          </>
        )}
      </Loadable>
    </PageShell>
  );
}
