"use client";

import { Bot, Building2, MessageSquareOff, MessagesSquare } from "lucide-react";
import { useProperty } from "@/context/PropertyContext";
import { T } from "@/lib/admin-tokens";
import { PageShell, PageHeader, PageSkeleton, EmptyState, Button } from "@/components/aura";

/** Central de comunicação: o Chatwoot embutido (iframe) com atalho para a fila de automações. */
export default function ComunicacaoPage() {
  const { currentProperty: property, loading } = useProperty();

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
