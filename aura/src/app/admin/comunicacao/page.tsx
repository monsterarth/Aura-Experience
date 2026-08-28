"use client";

import { useEffect, useRef } from "react";
import { Bot, Building2, MessageSquareOff, MessagesSquare } from "lucide-react";
import { useProperty } from "@/context/PropertyContext";
import { useNotifications } from "@/context/NotificationContext";
import { T } from "@/lib/admin-tokens";
import { PageShell, PageHeader, PageSkeleton, EmptyState, Button } from "@/components/aura";

/** Central de comunicação: o Chatwoot embutido (iframe) com atalho para a fila de automações. */
export default function ComunicacaoPage() {
  const { currentProperty: property, loading } = useProperty();
  const { counts, refetch: refetchNotifCounts } = useNotifications();
  const propertyId = property?.id;

  // Abrir esta tela É ler as mensagens — a leitura de verdade acontece no Chatwoot
  // aqui dentro, e o AURA não tem como saber disso sozinho. Sem este efeito o
  // contador só descia por um link cinza de 10px no sino: em produção ele ficou
  // NOVE DIAS sem ser tocado (última leitura em 19/08 16:01), 3.503 mensagens se
  // acumularam e o sino virou paisagem — a recepção parou de tratá-lo como urgente.
  // Enquanto a tela estiver aberta o badge se mantém em zero: se chegou mensagem,
  // ela já está à vista no iframe. O botão "Limpar mensagens" do sino continua
  // valendo para quem não quer abrir a tela.
  const marcando = useRef(false);
  useEffect(() => {
    if (!propertyId || counts.messages === 0 || marcando.current) return;
    marcando.current = true;
    fetch("/api/admin/notifications/mark-read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true, propertyId }),
    })
      .then((res) => { if (res.ok) refetchNotifCounts(); })
      // Falha fica silenciosa de propósito: o sino segue mostrando o número, que é
      // o lado seguro do erro. Avisar aqui só ensinaria a recepção a ignorar toast.
      .catch(() => {})
      .finally(() => { marcando.current = false; });
  }, [propertyId, counts.messages, refetchNotifCounts]);

  if (loading) return <PageShell maxWidth="full"><PageSkeleton kpis={0} rows={6} /></PageShell>;

  if (!property) {
    return (
      <PageShell maxWidth="full">
        <EmptyState icon={Building2} title="Selecione uma propriedade" description="Use o menu lateral para escolher a propriedade e abrir a central de comunicação." />
      </PageShell>
    );
  }

  const chatwootUrl = property.settings?.whatsappConfig?.chatwootUrl || "";
  if (!chatwootUrl) {
    return (
      <PageShell maxWidth="full">
        <PageHeader icon={MessagesSquare} title="Comunicação" subtitle={property.name} />
        <EmptyState
          icon={MessageSquareOff}
          title="Chatwoot não configurado"
          description={<>A URL do Chatwoot ainda não foi configurada para <strong style={{ color: T.text }}>{property.name}</strong>.</>}
          action={{ label: "Abrir configurações", href: "/admin/configuracoes" }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="full" gap={12}>
      <PageHeader
        icon={MessagesSquare}
        title="Comunicação"
        subtitle="Conversas de WhatsApp (Chatwoot)"
        actions={<Button variant="secondary" icon={Bot} href="/admin/comunicacao/automations">Fila de automações</Button>}
      />
      {/* Altura: viewport menos topbar, padding da página, header e tab bar (celular). */}
      <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.border}`, background: T.card, minHeight: 320, height: "calc(100dvh - var(--topbar-h, 48px) - 2 * var(--page-pad) - 96px - var(--tabbar-h, 0px))" }}>
        <iframe src={chatwootUrl} title="Chatwoot" style={{ width: "100%", height: "100%", border: 0, display: "block" }} allow="clipboard-read; clipboard-write; microphone" />
      </div>
    </PageShell>
  );
}
