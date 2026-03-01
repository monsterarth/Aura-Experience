"use client";

import { useProperty } from "@/context/PropertyContext";
import { CommunicationCenter } from "@/components/admin/CommunicationCenter";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ComunicacaoPage() {
  const router = useRouter();
  const { property, isLoading } = useProperty() as any; 

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

  return (
    <div className="h-full flex flex-col space-y-4 px-2 md:px-0">
      <div className="flex items-center justify-between mt-2 md:mt-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Central de Comunicação</h1>
          <p className="text-sm text-muted-foreground mt-1 hidden sm:block">
            Gestão omnichannel e WhatsApp para <strong className="text-foreground">{property.name}</strong>
          </p>
        </div>
        
        {/* BOTÃO DA FILA DE AUTOMAÇÕES */}
        <Button 
          variant="outline" 
          onClick={() => router.push('/admin/comunicacao/automations')} 
          className="gap-2 shadow-sm border-primary/20 hover:bg-primary/5 text-primary"
        >
          <Bot className="w-4 h-4" />
          <span className="hidden sm:inline">Fila de Automações</span>
        </Button>
      </div>
      
      <div className="flex-1 w-full pb-4">
        <CommunicationCenter propertyId={property.id} />
      </div>
    </div>
  );
}
