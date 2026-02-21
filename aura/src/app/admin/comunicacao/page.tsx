"use client";

import { useProperty } from "@/context/PropertyContext";
import { CommunicationCenter } from "@/components/admin/CommunicationCenter";

export default function ComunicacaoPage() {
  // 1. Correção: Extraindo 'property' (conforme a sua documentação) em vez de 'currentProperty'
  const { property, isLoading } = useProperty() as any; 

  // 2. Estado de Loading: Evita que a página quebre enquanto o Firebase busca a propriedade
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

  // 3. Fallback de Segurança: Se não houver propriedade selecionada
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

  // 4. Renderização do ambiente Multi-tenant isolado
  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Cabeçalho dinâmico informando em qual Pousada o usuário está agindo */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Central de Comunicação</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão omnichannel e WhatsApp para <strong className="text-foreground">{property.name}</strong>
          </p>
        </div>
      </div>
      
      {/* Injeção cirúrgica do property.id dinâmico no componente de chat */}
      <div className="flex-1 w-full">
        <CommunicationCenter propertyId={property.id} />
      </div>
    </div>
  );
}