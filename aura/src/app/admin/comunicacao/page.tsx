"use client";

import { useState } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { CommunicationCenter } from "@/components/admin/CommunicationCenter";
import { ContactsPanel } from "@/components/admin/ContactsPanel";
import { MessengerMaskModal } from "@/components/admin/MessengerMaskModal";
import { BroadcastPanel } from "@/components/admin/BroadcastPanel";
import { Button } from "@/components/ui/button";
import { Bot, MessageSquareOff, MessageSquare, ContactRound, Palette, Megaphone } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ComunicacaoPage() {
  const router = useRouter();
  const { currentProperty: property, loading: isLoading } = useProperty();
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<'chat' | 'contacts' | 'broadcast'>('chat');
  const [showMaskModal, setShowMaskModal] = useState(false);
  const [localMaskName, setLocalMaskName] = useState<string | undefined>(undefined);
  const [localMaskColor, setLocalMaskColor] = useState<string | undefined>(undefined);

  const effectiveName = localMaskName ?? userData?.messengerName;
  const effectiveColor = localMaskColor ?? userData?.messengerColor;

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

  const whatsappConfigured = property.settings?.whatsappConfig?.apiUrl && property.settings?.whatsappConfig?.apiKey;

  if (!whatsappConfigured) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center w-full bg-muted/20 rounded-xl border border-dashed">
        <MessageSquareOff className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Módulo de Mensagens não configurado</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          O WhatsApp ainda não foi configurado para <strong className="text-foreground">{property.name}</strong>.
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
            onClick={() => setShowMaskModal(true)}
            className="gap-2 shadow-sm border-border/50 hover:bg-muted/50 relative"
          >
            <Palette className="w-4 h-4" />
            <span className="hidden sm:inline">Minha Máscara</span>
            {!effectiveName && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-background" />
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/admin/comunicacao/automations')}
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
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition-all ${
            activeTab === 'chat' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex items-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition-all ${
            activeTab === 'contacts' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ContactRound className="w-3.5 h-3.5" />
          Contatos
        </button>
        <button
          onClick={() => setActiveTab('broadcast')}
          className={`flex items-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition-all ${
            activeTab === 'broadcast' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          Comunicado
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 w-full pb-4">
        {activeTab === 'chat' ? (
          <CommunicationCenter
            propertyId={property.id}
            messengerName={effectiveName}
            messengerColor={effectiveColor}
          />
        ) : activeTab === 'contacts' ? (
          <ContactsPanel propertyId={property.id} />
        ) : (
          <BroadcastPanel
            propertyId={property.id}
            messengerName={effectiveName}
            messengerColor={effectiveColor}
          />
        )}
      </div>

      {showMaskModal && (
        <MessengerMaskModal
          onClose={() => setShowMaskModal(false)}
          onSave={(name, color) => {
            setLocalMaskName(name);
            setLocalMaskColor(color);
          }}
        />
      )}
    </div>
  );
}
