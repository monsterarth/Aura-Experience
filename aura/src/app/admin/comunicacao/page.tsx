"use client";

import { useState } from "react";
import { useProperty } from "@/context/PropertyContext";
import { ContactsPanel } from "@/components/admin/ContactsPanel";
import { BroadcastPanel } from "@/components/admin/BroadcastPanel";
import { Button } from "@/components/ui/button";
import { Bot, MessageSquareOff, MessageSquare, ContactRound, Megaphone } from "lucide-react";
import { useRouter } from "next/navigation";

function ChatwootEmbed({ chatwootUrl }: { chatwootUrl: string }) {
  return (
    <iframe
      src={chatwootUrl}
      className="w-full rounded-xl border border-border/50"
      style={{ height: "calc(100vh - 200px)", minHeight: "600px" }}
    />
  );
}

export default function ComunicacaoPage() {
  const router = useRouter();
  const { currentProperty: property, loading: isLoading } = useProperty();
  const [activeTab, setActiveTab] = useState<"chat" | "contacts" | "broadcast">("chat");

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center w-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground font-medium">Carregando ambiente da propriedade...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center w-full bg-muted/20 rounded-xl border border-dashed">
        <h2 className="text-xl font-semibold mb-2 text-foreground">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Nenhuma propriedade selecionada no momento. Por favor, utilize o menu lateral (Sidebar) para selecionar o foco da instância.
        </p>
      </div>
    );
  }

  const cfg = property.settings?.whatsappConfig;
  const whatsappConfigured =
    cfg?.apiUrl &&
    cfg?.apiKey &&
    (cfg?.instanceName || (cfg?.instances && cfg.instances.length > 0));

  if (!whatsappConfigured) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center w-full bg-muted/20 rounded-xl border border-dashed">
        <MessageSquareOff className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Módulo de Mensagens não configurado</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          A integração com Evolution API ainda não foi configurada para{" "}
          <strong className="text-foreground">{property.name}</strong>.
          Entre em contato com o administrador para ativar a integração de mensagens desta propriedade.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-4 px-2 md:px-0">
      {/* Header */}
      <div className="flex items-center justify-between mt-2 md:mt-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Central de Comunicação</h1>
          <p className="text-sm text-muted-foreground mt-1 hidden sm:block">
            Gestão omnichannel e WhatsApp para <strong className="text-foreground">{property.name}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/admin/comunicacao/automations")}
            className="gap-2 shadow-sm border-primary/20 hover:bg-primary/5 text-primary"
          >
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">Fila de Automações</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-muted/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex items-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition-all ${
            activeTab === "chat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab("contacts")}
          className={`flex items-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition-all ${
            activeTab === "contacts" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ContactRound className="w-3.5 h-3.5" />
          Contatos
        </button>
        <button
          onClick={() => setActiveTab("broadcast")}
          className={`flex items-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition-all ${
            activeTab === "broadcast" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          Comunicado
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 w-full pb-4">
        {activeTab === "chat" ? (
          <ChatwootEmbed chatwootUrl={cfg?.chatwootUrl || process.env.NEXT_PUBLIC_CHATWOOT_URL || ""} />
        ) : activeTab === "contacts" ? (
          <ContactsPanel propertyId={property.id} />
        ) : (
          <BroadcastPanel propertyId={property.id} />
        )}
      </div>
    </div>
  );
}
