// src/app/admin/patrimonio/[id]/page.tsx
// Ficha do ativo: tudo sobre um item de patrimônio numa tela só.
// Uma única chamada (StockClient.assetDetail) devolve o payload composto —
// mesma ideia do ProductDetailModal no estoque.
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { AssetDetail, AssetMovement, MaintenanceTask } from "@/types/aura";
import { toast } from "sonner";
import { PageShell, PageHeader, useConfirm, usePrompt, PageSkeleton } from "@/components/aura";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Pencil, Trash2, ShieldCheck, ArrowRightLeft, ArchiveX,
  Wrench, History, FileText, TrendingDown, ScrollText, RotateCcw, MapPin, User, ExternalLink,
} from "lucide-react";
import AssetFormModal, { ASSET_STATUS } from "@/components/admin/AssetFormModal";
import AssetDisposalModal from "@/components/admin/AssetDisposalModal";
import AssetTransferModal from "@/components/admin/AssetTransferModal";
import AssetQr from "@/components/admin/AssetQr";

const money = (n?: number | null) => `R$ ${Number(n ?? 0).toFixed(2)}`;
const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const dateTime = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");

const MOVEMENT_LABEL: Record<AssetMovement["type"], string> = {
  transfer: "Transferência", custody: "Troca de responsável",
  status: "Mudança de status", disposal: "Baixa", inventory: "Conferência",
};

const TASK_STATUS: Record<string, string> = {
  pending: "Pendente", in_progress: "Em andamento", waiting_conference: "Aguardando conferência",
  completed: "Concluída", cancelled: "Cancelada", paused: "Pausada",
};

function Section({ icon, title, right, children }: {
  icon: React.ReactNode; title: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          {icon} {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{children}</p>
    </div>
  );
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentProperty: property } = useProperty();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [data, setData] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    if (!property?.id || !id) return;
    try {
      setData(await StockClient.assetDetail(property.id, id));
    } catch (e) {
      toast.error((e as Error).message);
      setData(null);
    } finally { setLoading(false); }
  }, [property?.id, id]);

  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    if (!property?.id || !data) return;
    if (!(await confirm({ title: "Excluir este ativo?", description: "Só é possível para cadastros sem histórico — para tirar do patrimônio, use Dar baixa.", confirmLabel: "Excluir", tone: "danger" }))) return;
    try {
      await StockClient.deleteAsset(property.id, data.asset.id);
      toast.success("Ativo excluído.");
      router.push("/admin/patrimonio");
    } catch (e) { toast.error((e as Error).message); }
  };

  const reinstate = async () => {
    if (!property?.id || !data) return;
    const reason = await prompt({ title: "Reverter a baixa", label: "Motivo", placeholder: "Por que o ativo volta ao patrimônio?", required: true, confirmLabel: "Reverter" });
    if (!reason?.trim()) return;
    try {
      await StockClient.reinstateAsset(property.id, data.asset.id, reason.trim());
      toast.success("Baixa revertida.");
      await load();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;
  if (loading) return <PageSkeleton kpis={0} rows={5} />;
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-muted-foreground">Ativo não encontrado.</p>
        <Link href="/admin/patrimonio" className="text-sm text-primary font-bold mt-3 inline-block">← Voltar ao patrimônio</Link>
      </div>
    );
  }

  const a = data.asset;
  const st = ASSET_STATUS[a.status];
  const isDisposed = a.status === "disposed";

  return (
    <PageShell>
      <Link href="/admin/patrimonio" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> Patrimônio
      </Link>

      {/* Cabeçalho */}
      <header className="bg-card border border-border rounded-2xl p-5 flex flex-wrap gap-5">
        {a.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.imageUrl} alt={a.name} className="w-32 h-32 rounded-2xl object-cover border border-border" />
        )}
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{a.name}</h1>
            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md", st.cls)}>{st.label}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {a.assetTag && <span className="font-mono">#{a.assetTag}</span>}
            {a.category?.name && <> · {a.category.name}</>}
            {a.serialNumber && <> · SN {a.serialNumber}</>}
          </p>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><MapPin size={13} /> {a.cabinName ?? a.location?.name ?? "Local não informado"}</span>
            {a.custodianName && <span className="inline-flex items-center gap-1"><User size={13} /> {a.custodianName}</span>}
          </p>

          <div className="flex gap-2 mt-4 flex-wrap">
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-secondary text-foreground hover:opacity-90">
              <Pencil size={14} /> Editar
            </button>
            {!isDisposed && (
              <>
                <button onClick={() => setMoving(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-secondary text-foreground hover:opacity-90">
                  <ArrowRightLeft size={14} /> Movimentar
                </button>
                <button onClick={() => setDisposing(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-secondary text-foreground hover:opacity-90">
                  <ArchiveX size={14} /> Dar baixa
                </button>
              </>
            )}
            {isDisposed && (
              <button onClick={reinstate} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-secondary text-foreground hover:opacity-90">
                <RotateCcw size={14} /> Reverter baixa
              </button>
            )}
            <button onClick={remove} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-muted-foreground hover:text-destructive">
              <Trash2 size={14} /> Excluir
            </button>
          </div>
        </div>

        {/* Plaqueta */}
        {a.publicCode && (
          <div className="text-center shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Plaqueta</p>
            <div className="inline-block rounded-xl bg-white p-1.5 border border-border">
              <AssetQr url={data.publicUrl} size={92} />
            </div>
            <p className="font-mono text-sm font-bold text-foreground tracking-widest mt-1.5">{a.publicCode}</p>
            <div className="flex items-center justify-center gap-3 mt-1">
              {data.publicUrl && (
                <a href={data.publicUrl} target="_blank" rel="noreferrer"
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                  abrir <ExternalLink size={11} />
                </a>
              )}
              <Link href="/admin/patrimonio/etiquetas" className="text-[11px] text-primary hover:underline">
                imprimir
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Baixa registrada */}
      {isDisposed && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <p className="text-sm font-bold text-red-500 flex items-center gap-1.5"><ArchiveX size={15} /> Ativo baixado em {date(a.disposalDate)}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <Field label="Tipo">{a.disposalType ?? "—"}</Field>
            <Field label="Valor recebido">{money(a.disposalValue)}</Field>
            <Field label="Valor contábil na baixa">{money(a.bookValueAtDisposal)}</Field>
            <Field label="Resultado">
              <span className={Number(a.disposalResult ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}>
                {money(a.disposalResult)}
              </span>
            </Field>
          </div>
          {a.disposalReason && <p className="text-sm text-muted-foreground mt-3">{a.disposalReason}</p>}
          <p className="text-xs text-muted-foreground mt-2">
            Registrada por {a.disposedByName ?? "—"}
            {a.disposalDocUrl && <> · <a href={a.disposalDocUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">ver documento</a></>}
          </p>
        </div>
      )}

      {/* Financeiro */}
      <Section icon={<TrendingDown size={13} />} title="Financeiro">
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Custo de aquisição">{money(a.acquisitionCost)}</Field>
          <Field label="Valor contábil">{money(a.bookValue)}</Field>
          <Field label="Depreciação acumulada">{money(a.accumulatedDepreciation)}</Field>
          <Field label="Depreciação mensal">{money(a.monthlyDepreciation)}</Field>
          <Field label="Método">{a.depreciationMethod === "linear" ? "Linear" : "Não deprecia"}</Field>
          <Field label="Vida útil">{a.usefulLifeMonths ? `${a.usefulLifeMonths} meses` : "—"}</Field>
          <Field label="Valor residual">{money(a.residualValue)}</Field>
          <Field label="Custo de manutenção">{money(data.maintenanceCost)}</Field>
        </div>
      </Section>

      {/* Dados + garantia + documentos */}
      <div className="grid md:grid-cols-2 gap-5">
        <Section icon={<FileText size={13} />} title="Dados">
          <div className="p-4 grid grid-cols-2 gap-4">
            <Field label="Marca">{a.brand || "—"}</Field>
            <Field label="Modelo">{a.model || "—"}</Field>
            <Field label="Data de aquisição">{date(a.acquisitionDate)}</Field>
            <Field label="Início depreciação">{date(a.depreciationStart)}</Field>
            <div className="col-span-2"><Field label="Observações">{a.notes || "—"}</Field></div>
          </div>
        </Section>

        <Section icon={<ShieldCheck size={13} />} title="Garantia e documentos">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Garantia até">
                <span className={cn(
                  a.warrantyStatus === "active" && "text-emerald-500",
                  a.warrantyStatus === "expiring" && "text-amber-500",
                  a.warrantyStatus === "expired" && "text-muted-foreground",
                )}>
                  {date(a.warrantyUntil)}
                  {a.warrantyStatus === "expiring" && " (vencendo)"}
                  {a.warrantyStatus === "expired" && " (vencida)"}
                </span>
              </Field>
              <Field label="Garantidor">{a.warrantyProvider || "—"}</Field>
            </div>
            {a.warrantyNotes && <Field label="Observações da garantia">{a.warrantyNotes}</Field>}
            <div className="flex gap-3 flex-wrap text-sm">
              {a.invoiceUrl && <a href={a.invoiceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Nota fiscal</a>}
              {a.warrantyDocUrl && <a href={a.warrantyDocUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Documento de garantia</a>}
              {a.specImageUrl && <a href={a.specImageUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Etiqueta de especificações</a>}
              {!a.invoiceUrl && !a.warrantyDocUrl && !a.specImageUrl && <span className="text-muted-foreground">Nenhum documento anexado.</span>}
            </div>
          </div>
        </Section>
      </div>

      {/* Manutenção */}
      <Section
        icon={<Wrench size={13} />}
        title="Manutenção"
        right={<span className="text-xs text-muted-foreground">{data.maintenance.length} chamado(s) · {money(data.maintenanceCost)}</span>}
      >
        {data.maintenance.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum chamado registrado para este ativo.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {data.maintenance.map((t: MaintenanceTask) => (
              <li key={t.id} className="px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateTime(t.createdAt)} · {TASK_STATUS[t.status] ?? t.status}
                    {t.reportSource === "qr" && <> · via plaqueta</>}
                  </p>
                </div>
                {t.cost != null && <span className="text-sm tabular-nums text-muted-foreground shrink-0">{money(t.cost)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Movimentações */}
      <Section icon={<History size={13} />} title="Movimentações">
        {data.movements.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {data.movements.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{MOVEMENT_LABEL[m.type]}</span>
                  <span className="text-xs text-muted-foreground">{dateTime(m.createdAt)} · {m.performedByName ?? "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {m.type === "transfer" && (
                    <>{m.fromCabinName ?? m.fromLocationName ?? "—"} → {m.toCabinName ?? m.toLocationName ?? "—"}</>
                  )}
                  {m.type === "custody" && <>{m.fromCustodianName ?? "—"} → {m.toCustodianName ?? "—"}</>}
                  {(m.type === "status" || m.type === "disposal") && (
                    <>{ASSET_STATUS[m.fromStatus ?? "active"]?.label ?? m.fromStatus} → {ASSET_STATUS[m.toStatus ?? "active"]?.label ?? m.toStatus}</>
                  )}
                  {m.reason && <> · {m.reason}</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Razão de depreciação */}
      <Section icon={<TrendingDown size={13} />} title="Razão de depreciação">
        {data.depreciation.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum lançamento ainda — o cron mensal grava no dia 1º.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="text-left px-4 py-2">Período</th>
                  <th className="text-right px-4 py-2">Depreciação</th>
                  <th className="text-right px-4 py-2">Acumulada</th>
                  <th className="text-right px-4 py-2">Valor contábil</th>
                </tr>
              </thead>
              <tbody>
                {data.depreciation.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{d.period}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{money(d.amount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{money(d.accumulatedDepreciation)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-foreground">{money(d.bookValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Auditoria */}
      <Section icon={<ScrollText size={13} />} title="Auditoria">
        {data.audit.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sem registros.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {data.audit.map((l) => (
              <li key={l.id} className="px-4 py-2.5 flex items-start justify-between gap-4">
                <p className="text-sm text-foreground">{l.details}</p>
                <span className="text-xs text-muted-foreground shrink-0">{dateTime(l.timestamp)} · {l.userName}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing && (
        <AssetFormModal
          propertyId={property.id}
          initial={a}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await load(); }}
        />
      )}
      {disposing && (
        <AssetDisposalModal
          propertyId={property.id} asset={a}
          onClose={() => setDisposing(false)}
          onDone={async () => { setDisposing(false); await load(); }}
        />
      )}
      {moving && (
        <AssetTransferModal
          propertyId={property.id} asset={a}
          onClose={() => setMoving(false)}
          onDone={async () => { setMoving(false); await load(); }}
        />
      )}
    </PageShell>
  );
}
