"use client";

import { useConfirm } from "@/components/aura";

// src/app/admin/configuracoes/_components/WhatsAppSessionCard.tsx
//
// Estado da sessão de WhatsApp + reconexão por QR, sem abrir o manager da Evolution.
//
// A razão de existir está na rota `api/admin/whatsapp/session`: a Evolution é um processo
// só, então quando ela trava o /manager trava junto e não consegue avisar que travou. Este
// cartão observa de fora — é o ponto de vista que enxerga a trava.
//
// A UI é deliberadamente honesta sobre o que cada sinal prova: "conectada" aparece em tom
// neutro, não verde comemorativo, porque a Evolution relata "open" com o socket fechado.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  PropertySettingsClient, WhatsAppSessionView, WhatsAppSessionStatus,
} from "@/lib/property-settings-client";
import { toast } from "sonner";
import {
  Activity, AlertOctagon, AlertTriangle, CheckCircle2, Loader2, QrCode, RefreshCw, PowerOff, RotateCcw,
} from "lucide-react";

interface Props {
  propertyId: string;
  /** Sem URL/instância/chave não há o que diagnosticar — o cartão explica em vez de errar. */
  configured: boolean;
}

const LOOK: Record<WhatsAppSessionStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  conectada:    { label: "Respondendo",        cls: "text-emerald-500 bg-emerald-500/10", Icon: CheckCircle2 },
  desconectada: { label: "Desconectada",       cls: "text-amber-500 bg-amber-500/10",     Icon: AlertTriangle },
  travada:      { label: "Travada",            cls: "text-red-500 bg-red-500/10",         Icon: AlertOctagon },
  inacessivel:  { label: "Inacessível",        cls: "text-red-500 bg-red-500/10",         Icon: AlertOctagon },
  credencial:   { label: "Chave recusada",     cls: "text-red-500 bg-red-500/10",         Icon: AlertOctagon },
  erro:         { label: "Erro",               cls: "text-amber-500 bg-amber-500/10",     Icon: AlertTriangle },
};

export function WhatsAppSessionCard({ propertyId, configured }: Props) {
  const [view, setView] = useState<WhatsAppSessionView | null>(null);
  const confirm = useConfirm();
  const [checking, setChecking] = useState(false);
  const [acting, setActing] = useState<"reconnect" | "logout" | "restart" | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [needsLogout, setNeedsLogout] = useState(false);
  const recheckTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const check = useCallback(async () => {
    if (!configured) return;
    setChecking(true);
    try { setView(await PropertySettingsClient.whatsappSession(propertyId)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setChecking(false); }
  }, [propertyId, configured]);

  useEffect(() => { check(); }, [check]);
  useEffect(() => () => { recheckTimers.current.forEach(clearTimeout); }, []);

  /** O restart leva ~1 min até a Evolution voltar — re-verifica sozinho em 30s e 90s. */
  const scheduleRechecks = useCallback(() => {
    recheckTimers.current.forEach(clearTimeout);
    recheckTimers.current = [30_000, 90_000].map((ms) => setTimeout(check, ms));
  }, [check]);

  const act = async (action: "reconnect" | "logout") => {
    if (action === "logout" && !(await confirm({ title: "Encerrar a sessão do WhatsApp?", description: "Derruba o WhatsApp desta propriedade e exige ler um QR novo. Só faça isso se ela já estiver caída ou zumbi.", confirmLabel: "Encerrar sessão", tone: "danger" }))) return;

    setActing(action);
    setQr(null);
    setPairingCode(null);
    setNeedsLogout(false);
    try {
      const r = await PropertySettingsClient.whatsappReconnect(propertyId, action);
      if (r.ok) {
        if (r.qr || r.pairingCode) {
          setQr(r.qr ?? null);
          setPairingCode(r.pairingCode ?? null);
          toast.success("QR gerado. Leia pelo celular em Aparelhos conectados.");
        } else {
          toast.success(r.message ?? "Pronto.");
        }
      } else {
        setNeedsLogout(!!r.needsLogout);
        toast.error(r.message ?? "Não foi possível.");
      }
      await check();
    } catch (e) { toast.error((e as Error).message); }
    finally { setActing(null); }
  };

  /** Recria o container via Coolify — o remédio quando o processo trava ou o logout não pega. */
  const restart = async () => {
    if (!(await confirm({ title: "Reiniciar a Evolution?", description: "Recria o container no servidor (o mesmo Restart do Coolify) e derruba TODAS as instâncias por cerca de 1 minuto. Use quando estiver travada ou quando a sessão zumbi não desconectar.", confirmLabel: "Reiniciar", tone: "danger" }))) return;

    setActing("restart");
    setQr(null);
    setPairingCode(null);
    setNeedsLogout(false);
    try {
      const r = await PropertySettingsClient.whatsappRestart(propertyId);
      if (r.ok) {
        toast.success(r.message ?? "Reinício disparado.");
        scheduleRechecks();
      } else {
        toast.error(r.message ?? "Não foi possível reiniciar.");
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setActing(null); }
  };

  const look = view ? LOOK[view.status] : null;
  const busy = checking || acting !== null;

  return (
    <SectionCard
      title="Estado da sessão"
      icon={Activity}
      description="Verificado de fora da Evolution — é assim que dá para ver que ela travou, já que travada ela não consegue avisar."
      aside={
        <button
          onClick={check} disabled={busy || !configured}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50"
        >
          {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Verificar
        </button>
      }
    >
      {!configured ? (
        <p className="text-xs text-muted-foreground">
          Preencha URL, nome da instância e chave da Evolution acima para poder verificar.
        </p>
      ) : (
        <>
          {look && view && (
            <div className={`flex items-start gap-2 text-xs font-bold p-3 rounded-xl ${look.cls}`}>
              <look.Icon size={14} className="flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p>{look.label}{view.instance ? ` · ${view.instance}` : ""}</p>
                <p className="font-normal opacity-90 mt-1 leading-snug">{view.detail}</p>
              </div>
            </div>
          )}

          {view?.status === "travada" && (
            <p className="text-[11px] text-muted-foreground leading-snug">
              Nada aqui (nem o QR) funciona com o processo enroscado, porque é ele que gera o QR.
              {view.restartAvailable
                ? " Use Reiniciar Evolution abaixo — ele passa por fora dela, via Coolify, e funciona mesmo com tudo travado."
                : " Com o autoheal instalado no servidor, o restart acontece sozinho em segundos — espere e clique em Verificar de novo."}
            </p>
          )}

          {typeof view?.disconnectionReasonCode === "number" && (
            <p className="text-[11px] text-amber-500 leading-snug">
              Último motivo de desconexão registrado: <b>{view.disconnectionReasonCode}</b>
              {view.disconnectionReasonCode === 401 && " (aparelho removido — precisa de QR novo, restart não resolve)"}.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => act("reconnect")} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {acting === "reconnect" ? <Loader2 size={12} className="animate-spin" /> : <QrCode size={12} />} Gerar QR
            </button>
            <button
              onClick={() => act("logout")} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50"
            >
              {acting === "logout" ? <Loader2 size={12} className="animate-spin" /> : <PowerOff size={12} />} Encerrar sessão
            </button>
            {view?.restartAvailable && (
              <button
                onClick={restart} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 disabled:opacity-50"
                title="Recria o container da Evolution via Coolify — funciona mesmo com o processo travado."
              >
                {acting === "restart" ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Reiniciar Evolution
              </button>
            )}
          </div>

          {needsLogout && (
            <p className="text-[11px] text-amber-500 leading-snug">
              Sessão zumbi: ela devolveu &quot;open&quot; em vez de um QR. Use <b>Encerrar sessão</b> e
              depois <b>Gerar QR</b> — é a sequência que força uma sessão nova de verdade.
            </p>
          )}

          {(qr || pairingCode) && (
            <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-secondary/40 border border-border">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                  alt="QR Code para conectar o WhatsApp"
                  className="w-56 h-56 rounded-xl bg-white p-2"
                />
              )}
              {pairingCode && (
                <p className="text-sm font-mono font-bold tracking-widest">{pairingCode}</p>
              )}
              <p className="text-[11px] text-muted-foreground text-center leading-snug">
                No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
                O QR expira em cerca de 40 segundos; clique em <b>Gerar QR</b> de novo se passar.
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground leading-snug">
            Timeout aqui é sinal confiável de trava. Já &quot;Respondendo&quot; não garante entrega:
            a Evolution relata &quot;open&quot; até com o socket fechado — só um envio real prova.
          </p>
        </>
      )}
    </SectionCard>
  );
}
