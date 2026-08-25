"use client";

// /admin/hsystem — central da integração Hsystem (HUNIT/HBOOK/HPRICE).
// Conexão (cofre write-only) · modo sombra/ativo · mapeamento categoria↔roomTypeId ·
// fila de reservas espelhadas · log de sincronização. O polling contínuo é do cron
// externo (api/cron/hsystem-sync); os botões aqui disparam o mesmo fluxo na hora.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownToLine, CalendarRange, Inbox, KeyRound, Link2, Plug,
  RefreshCw, Save, Satellite, SendHorizonal, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import {
  T, alpha, PageShell, PageHeader, KpiGrid, KpiCard, Loadable, PageSkeleton,
  Card, Pill, Button, Field, FieldRow, Input, Select, Switch, EmptyState,
} from "@/components/aura";
import type { HsystemConfig, HunitRoomRate } from "@/types/aura";

// ─── Tipos locais (payload da API) ───────────────────────────────────────────
interface SecretsInfo {
  hasHunitUserName: boolean; hunitUserNameMask: string | null;
  hasHunitPassword: boolean; hunitPasswordMask: string | null;
}
interface SyncLogRow {
  id: string; kind: string; ok: boolean; itemCount: number;
  detail?: Record<string, unknown> | null; error?: string | null; startedAt: string;
}
interface ReservationRow {
  locatorId: string; portalName?: string | null; status?: string | null;
  action?: string | null; actionDetail?: string | null; guestName?: string | null;
  checkIn?: string | null; checkOut?: string | null; totalValue?: number | null;
  collectType?: string | null; stayGroupId?: string | null; stayIds?: string[];
  receivedAt: string; confirmedAt?: string | null; error?: string | null;
}
interface HsStatus {
  enabled: boolean;
  config: HsystemConfig;
  secrets: SecretsInfo;
  syncLogs: SyncLogRow[];
  reservations: ReservationRow[];
  categories: { id: string; name: string }[];
  needsAttention: number;
}

const ACTION_META: Record<string, { label: string; tone: "green" | "blue" | "amber" | "red" | "neutral" }> = {
  created: { label: "Criada", tone: "green" },
  updated: { label: "Atualizada", tone: "blue" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  skipped: { label: "Ignorada", tone: "neutral" },
  needs_attention: { label: "Atenção", tone: "amber" },
  failed: { label: "Falhou", tone: "red" },
};
const KIND_LABEL: Record<string, string> = {
  bookings: "Reservas", availability: "Disponibilidade", test: "Teste", kpi: "KPIs",
};

const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtD = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const brl = (v?: number | null) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function HsystemPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager"]}>
      <HsystemInner />
    </RoleGuard>
  );
}

function HsystemInner() {
  const { userData, isSuperAdmin } = useAuth();
  const { currentProperty } = useProperty();
  const propertyId = currentProperty?.id ?? userData?.propertyId ?? null;

  const [status, setStatus] = useState<HsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rascunhos locais (sem autosave — sempre botão Salvar).
  const [hotelId, setHotelId] = useState("");
  const [userDraft, setUserDraft] = useState("");
  const [passDraft, setPassDraft] = useState("");
  const [enabledDraft, setEnabledDraft] = useState(false);
  const [modeDraft, setModeDraft] = useState<"shadow" | "active">("shadow");
  const [pushDraft, setPushDraft] = useState(false);
  const [horizonDraft, setHorizonDraft] = useState(365);
  const [mapDraft, setMapDraft] = useState<Record<string, string>>({});

  const [roomRates, setRoomRates] = useState<HunitRoomRate[]>([]);
  const [testing, setTesting] = useState(false);
  const [savingConn, setSavingConn] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);

  const applyStatus = useCallback((s: HsStatus) => {
    setStatus(s);
    setHotelId(s.config.hotelId ?? "");
    setEnabledDraft(s.enabled);
    setModeDraft(s.config.mode ?? "shadow");
    setPushDraft(!!s.config.pushAvailability);
    setHorizonDraft(s.config.horizonDays ?? 365);
    setMapDraft({ ...(s.config.categoryMap ?? {}) });
  }, []);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hsystem?propertyId=${encodeURIComponent(propertyId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar o módulo.");
      applyStatus(data as HsStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar o módulo.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, applyStatus]);

  useEffect(() => { load(); }, [load]);

  /** Config completa a partir dos rascunhos — o merge de settings é raso, então o
   *  objeto hsystemConfig vai SEMPRE inteiro (senão salvar um card apagaria o outro). */
  const buildConfig = useCallback((): HsystemConfig => ({
    ...(status?.config ?? { mode: "shadow", hotelId: "", categoryMap: {}, pushAvailability: false, horizonDays: 365, hbookPortalIds: [27] }),
    hotelId: hotelId.trim(),
    mode: modeDraft,
    pushAvailability: pushDraft,
    horizonDays: Math.min(730, Math.max(30, Number(horizonDraft) || 365)),
    categoryMap: Object.fromEntries(Object.entries(mapDraft).filter(([, v]) => !!v)),
  }), [status, hotelId, modeDraft, pushDraft, horizonDraft, mapDraft]);

  const put = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/hsystem", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, ...body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Falha ao salvar.");
    applyStatus(data as HsStatus);
  }, [propertyId, applyStatus]);

  const saveConnection = async () => {
    setSavingConn(true);
    try {
      const secrets: Record<string, string> = {};
      if (userDraft.trim() !== "") secrets.hunitUserName = userDraft.trim();
      if (passDraft.trim() !== "") secrets.hunitPassword = passDraft.trim();
      await put({
        settings: { hsystemConfig: buildConfig() },
        ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
      });
      setUserDraft(""); setPassDraft("");
      toast.success("Conexão salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally { setSavingConn(false); }
  };

  const saveModule = async () => {
    setSavingModule(true);
    try {
      const settings: Record<string, unknown> = { hsystemConfig: buildConfig() };
      if (isSuperAdmin && enabledDraft !== status?.enabled) settings.hasHsystem = enabledDraft;
      await put({ settings });
      toast.success("Configuração do módulo salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally { setSavingModule(false); }
  };

  const saveMapping = async () => {
    setSavingMap(true);
    try {
      await put({ settings: { hsystemConfig: buildConfig() } });
      toast.success("Mapeamento salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally { setSavingMap(false); }
  };

  const testConnection = useCallback(async (silent = false) => {
    if (!propertyId) return;
    setTesting(true);
    try {
      const res = await fetch("/api/admin/hsystem/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (data.ok) {
        setRoomRates((data.roomRates ?? []) as HunitRoomRate[]);
        if (!silent) {
          const active = (data.portals ?? []).filter((p: { isActive: boolean }) => p.isActive);
          toast.success(`Conexão OK — ${data.roomRates?.length ?? 0} tipos de quarto, ${active.length} portal(is) ativo(s): ${active.map((p: { name: string }) => p.name).join(", ") || "nenhum"}.`);
        }
      } else if (!silent) {
        toast.error(data.error || "Falha no teste de conexão.");
      }
    } catch {
      if (!silent) toast.error("Falha no teste de conexão.");
    } finally { setTesting(false); }
  }, [propertyId]);

  // Com credenciais no cofre, carrega os tipos de quarto sozinho (alimenta o mapeamento).
  useEffect(() => {
    if (status?.secrets.hasHunitUserName && status.secrets.hasHunitPassword && status.config.hotelId) {
      testConnection(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.secrets.hasHunitUserName, status?.secrets.hasHunitPassword, status?.config.hotelId]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/hsystem/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, action: "bookings" }),
      });
      const data = await res.json();
      if (data.ok) {
        const c = data.counts ?? {};
        toast.success(`Busca concluída: ${data.received} recebida(s) — ${c.created ?? 0} criada(s), ${c.updated ?? 0} atualizada(s), ${c.cancelled ?? 0} cancelada(s), ${c.needs_attention ?? 0} p/ atenção.`);
      } else {
        toast.error(data.error || "Falha na sincronização.");
      }
      await load();
    } catch {
      toast.error("Falha na sincronização.");
    } finally { setSyncing(false); }
  };

  const pushNow = async () => {
    setPushing(true);
    try {
      const res = await fetch("/api/admin/hsystem/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, action: "availability", force: true }),
      });
      const data = await res.json();
      if (data.ok) toast.success(data.skipped ? `Disponibilidade: ${data.skipped}.` : `Disponibilidade enviada — ${data.sent} período(s).`);
      else toast.error(data.error || data.skipped || "Falha ao enviar disponibilidade.");
      await load();
    } catch {
      toast.error("Falha ao enviar disponibilidade.");
    } finally { setPushing(false); }
  };

  const lastBookings = useMemo(
    () => status?.syncLogs.find((l) => l.kind === "bookings") ?? null,
    [status?.syncLogs],
  );
  const mappableRates = useMemo(() => {
    const masters = roomRates.filter((r) => !r.isChildRoomRate && r.isActive);
    const seen = new Set<string>();
    return masters.filter((r) => (seen.has(r.roomTypeId) ? false : (seen.add(r.roomTypeId), true)));
  }, [roomRates]);
  const importedCount = useMemo(
    () => (status?.reservations ?? []).filter((r) => r.action === "created" || r.action === "updated").length,
    [status?.reservations],
  );

  const modeBadge = !status?.enabled
    ? <Pill tone="neutral" dot label="Desligado" />
    : status.config.mode === "active"
      ? <Pill tone="green" dot label="Modo ativo" />
      : <Pill tone="amber" dot label="Modo sombra" />;

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    padding: "10px 0", borderTop: `1px solid ${T.border}`, minWidth: 0,
  };

  return (
    <PageShell>
      <PageHeader
        title="Hsystem"
        titleAccent="Channel"
        icon={Plug}
        badge={modeBadge}
        subtitle="HUNIT · HBOOK · HPrice — reservas dos canais e disponibilidade"
        actions={
          status?.enabled && status.config.mode === "active" ? (
            <Button variant="secondary" icon={SendHorizonal} loading={pushing} onClick={pushNow}>
              Enviar disponibilidade
            </Button>
          ) : undefined
        }
        primaryAction={{ label: "Buscar reservas", icon: RefreshCw, onClick: syncNow }}
      />

      <Loadable loading={loading || !status} skeleton={<PageSkeleton kpis={4} rows={5} />} error={error} onRetry={load}>
        {status && (
          <>
            <KpiGrid cols={4}>
              <KpiCard
                label="Modo"
                value={!status.enabled ? "Desligado" : status.config.mode === "active" ? "Ativo" : "Sombra"}
                sub={status.config.mode === "active" ? "confirma e envia disponibilidade" : "espelha sem confirmar (HMAX oficial)"}
                icon={Satellite}
                tone={!status.enabled ? "neutral" : status.config.mode === "active" ? "green" : "amber"}
              />
              <KpiCard
                label="Última busca"
                value={lastBookings ? fmtDT(lastBookings.startedAt) : "—"}
                sub={lastBookings ? (lastBookings.ok ? `${lastBookings.itemCount} reserva(s) no ciclo` : "falhou — ver log") : "nenhuma sincronização ainda"}
                icon={RefreshCw}
                tone={lastBookings && !lastBookings.ok ? "red" : "blue"}
              />
              <KpiCard
                label="Importadas"
                value={importedCount}
                sub="nas últimas 40 recebidas"
                icon={ArrowDownToLine}
                tone="brand"
              />
              <KpiCard
                label="Precisam de atenção"
                value={status.needsAttention}
                sub={status.needsAttention > 0 ? "resolver na fila abaixo" : "tudo em ordem"}
                icon={AlertTriangle}
                tone={status.needsAttention > 0 ? "amber" : "green"}
              />
            </KpiGrid>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ── Conexão ── */}
              <Card
                header={{
                  title: "Conexão com o HUNIT",
                  sub: "Credenciais de integração PMS (cofre write-only — o valor nunca volta ao navegador)",
                  icon: KeyRound,
                }}
                footer={
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <Button variant="secondary" icon={ShieldCheck} loading={testing} onClick={() => testConnection(false)}>
                      Testar conexão
                    </Button>
                    <Button variant="primary" icon={Save} loading={savingConn} onClick={saveConnection}>
                      Salvar conexão
                    </Button>
                  </div>
                }
              >
                <FieldRow cols={3}>
                  <Field label="Código do hotel" hint="hotelId no HUNIT">
                    <Input value={hotelId} onChange={(e) => setHotelId(e.target.value)} placeholder="ex.: 2856" />
                  </Field>
                  <Field
                    label="Usuário"
                    hint={status.secrets.hasHunitUserName ? `salvo: ${status.secrets.hunitUserNameMask} (deixe vazio p/ manter)` : "userName de integração"}
                  >
                    <Input value={userDraft} onChange={(e) => setUserDraft(e.target.value)} placeholder={status.secrets.hasHunitUserName ? "••••••••" : "ex.: aura.2856"} autoComplete="off" />
                  </Field>
                  <Field
                    label="Senha"
                    hint={status.secrets.hasHunitPassword ? `salva: ${status.secrets.hunitPasswordMask} (deixe vazio p/ manter)` : "senha de integração"}
                  >
                    <Input type="password" value={passDraft} onChange={(e) => setPassDraft(e.target.value)} placeholder={status.secrets.hasHunitPassword ? "••••••••" : "senha"} autoComplete="new-password" />
                  </Field>
                </FieldRow>
              </Card>

              {/* ── Módulo e modo ── */}
              <Card
                header={{
                  title: "Módulo e modo de operação",
                  sub: "Sombra espelha sem tocar a fila (HMAX segue oficial); ativo confirma e envia disponibilidade",
                  icon: Satellite,
                  tone: "amber",
                }}
                footer={
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button variant="primary" icon={Save} loading={savingModule} onClick={saveModule}>
                      Salvar configuração
                    </Button>
                  </div>
                }
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Switch checked={enabledDraft} onChange={isSuperAdmin ? setEnabledDraft : undefined} disabled={!isSuperAdmin} hint={isSuperAdmin ? "liga o polling do cron para esta propriedade" : "somente o super admin liga/desliga o módulo"}>
                    Módulo ligado
                  </Switch>
                  <FieldRow cols={2}>
                    <Field label="Modo" hint={modeDraft === "active" ? "confirma reservas e envia disponibilidade — sandbox/homologação ou pós-troca de PMS" : "só espelha — produção em paralelo com o HMAX"}>
                      <Select value={modeDraft} onChange={(e) => setModeDraft(e.target.value as "shadow" | "active")}>
                        <option value="shadow">Sombra (paralelo ao HMAX)</option>
                        <option value="active">Ativo (confirma + disponibilidade)</option>
                      </Select>
                    </Field>
                    <Field label="Janela de disponibilidade" hint="dias enviados ao HUNIT (máx. 730)">
                      <Input
                        type="number" min={30} max={730}
                        value={horizonDraft}
                        onChange={(e) => setHorizonDraft(Number(e.target.value))}
                        disabled={modeDraft !== "active"}
                      />
                    </Field>
                  </FieldRow>
                  <Switch
                    checked={pushDraft && modeDraft === "active"}
                    onChange={modeDraft === "active" ? setPushDraft : undefined}
                    disabled={modeDraft !== "active"}
                    hint={modeDraft === "active" ? "o cron recomputa o mapa e só envia quando algo muda" : "disponível apenas no modo ativo"}
                  >
                    Enviar disponibilidade automaticamente
                  </Switch>
                </div>
              </Card>
            </div>

            {/* ── Mapeamento ── */}
            <Card
              header={{
                title: "Mapeamento de categorias",
                sub: "Tipo de quarto do HUNIT → categoria de cabana do AURA (o encaixe automático usa isto)",
                icon: Link2,
                tone: "blue",
                aside: mappableRates.length > 0 ? <Pill tone="blue" label={`${mappableRates.length} tipos`} /> : undefined,
              }}
              footer={
                mappableRates.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button variant="primary" icon={Save} loading={savingMap} onClick={saveMapping}>
                      Salvar mapeamento
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {mappableRates.length === 0 ? (
                <EmptyState
                  compact
                  icon={Link2}
                  title="Tipos de quarto ainda não carregados"
                  description="Salve as credenciais e teste a conexão — os tipos de quarto do HUNIT aparecem aqui para mapear."
                  action={{ label: "Testar conexão", icon: ShieldCheck, onClick: () => testConnection(false) }}
                />
              ) : (
                <div>
                  {mappableRates.map((r) => (
                    <div key={r.roomTypeId} style={rowStyle}>
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: T.muted }}>roomTypeId {r.roomTypeId}{r.rateTypeId ? ` · tarifa ${r.rateTypeId}` : ""}</div>
                      </div>
                      <div style={{ flex: "0 1 260px", minWidth: 200 }}>
                        <Select
                          fieldSize="sm"
                          value={mapDraft[r.roomTypeId] ?? ""}
                          onChange={(e) => setMapDraft((m) => ({ ...m, [r.roomTypeId]: e.target.value }))}
                        >
                          <option value="">— não mapear —</option>
                          {status.categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── Reservas espelhadas ── */}
            <Card
              header={{
                title: "Reservas do canal",
                sub: "Últimas reservas recebidas do HUNIT e o que o AURA fez com cada uma",
                icon: Inbox,
                tone: "brand",
                aside: status.needsAttention > 0 ? <Pill tone="amber" dot label={`${status.needsAttention} p/ atenção`} /> : undefined,
              }}
            >
              {status.reservations.length === 0 ? (
                <EmptyState
                  compact
                  icon={Inbox}
                  title="Nenhuma reserva recebida ainda"
                  description='Crie uma reserva de teste no HBook do sandbox e clique em "Buscar reservas".'
                  action={{ label: "Buscar reservas", icon: RefreshCw, onClick: syncNow }}
                />
              ) : (
                <div>
                  {status.reservations.map((r) => {
                    const meta = ACTION_META[r.action ?? ""] ?? { label: r.action ?? "—", tone: "neutral" as const };
                    return (
                      <div key={r.locatorId} style={rowStyle}>
                        <Pill tone={meta.tone} dot label={meta.label} />
                        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.guestName || "Hóspede (canal)"}
                            <span style={{ color: T.muted, fontWeight: 500 }}> · {r.portalName || "portal"}</span>
                          </div>
                          <div style={{ fontSize: 11, color: T.muted }}>
                            <CalendarRange size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
                            {fmtD(r.checkIn)} → {fmtD(r.checkOut)} · {brl(r.totalValue)}
                            {r.collectType === "CanalCollect" ? " · pré-paga no canal" : ""}
                            {" · HUNIT "}{r.locatorId}
                          </div>
                          {r.actionDetail && (
                            <div style={{ fontSize: 11, color: meta.tone === "amber" ? T.amber : meta.tone === "red" ? T.red : T.muted, marginTop: 2 }}>
                              {r.actionDetail}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: T.muted2 }}>
                          <span title="recebida">{fmtDT(r.receivedAt)}</span>
                          {r.confirmedAt && <Pill tone="green" size="sm" label="confirmada" title={`Confirmada ao HUNIT em ${fmtDT(r.confirmedAt)}`} />}
                          {(r.stayIds?.length ?? 0) > 0 && (
                            <Button variant="ghost" size="sm" href="/admin/stays">ver estadias</Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* ── Log ── */}
            <Card header={{ title: "Log de sincronização", sub: "Últimos 20 ciclos (reservas, disponibilidade, testes)", icon: RefreshCw, tone: "neutral", bare: false }}>
              {status.syncLogs.length === 0 ? (
                <div style={{ fontSize: 12, color: T.muted, padding: "6px 0" }}>Nenhum ciclo registrado ainda.</div>
              ) : (
                <div>
                  {status.syncLogs.map((l) => (
                    <div key={l.id} style={rowStyle}>
                      <Pill tone={l.ok ? "green" : "red"} dot label={l.ok ? "OK" : "Erro"} />
                      <div style={{ flex: "0 0 120px", fontSize: 12, fontWeight: 700, color: T.text }}>{KIND_LABEL[l.kind] ?? l.kind}</div>
                      <div style={{ flex: "1 1 160px", fontSize: 11, color: l.error ? T.red : T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.error
                          ? l.error
                          : l.kind === "bookings"
                            ? `${l.itemCount} reserva(s) no ciclo`
                            : l.kind === "availability"
                              ? `${l.itemCount} período(s) enviados`
                              : `${l.itemCount} item(ns)`}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted2 }}>{fmtDT(l.startedAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Rodapé de contexto — como ligar o polling contínuo. */}
            <div style={{
              fontSize: 11, color: T.muted, background: alpha(T.g1, 4),
              border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px",
            }}>
              Polling contínuo: aponte um cron externo (ex.: cronjob.org, a cada 1–5 min) para{" "}
              <code style={{ color: T.brandText }}>GET /api/cron/hsystem-sync</code> com o header{" "}
              <code style={{ color: T.brandText }}>Authorization: Bearer CRON_SECRET</code>. Os botões desta página disparam o mesmo fluxo manualmente.
            </div>
          </>
        )}
      </Loadable>
    </PageShell>
  );
}
