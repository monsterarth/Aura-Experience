"use client";

import { useProperty } from "@/context/PropertyContext";
import { Button } from "@/components/ui/button";
import { Bot, MessageSquareOff } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ComunicacaoPage() {
  const router = useRouter();
  const { currentProperty: property, loading: isLoading } = useProperty();

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center w-full">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center w-full bg-muted/20 rounded-xl border border-dashed">
        <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Nenhuma propriedade selecionada. Utilize o menu lateral para selecionar a propriedade.
        </p>
      </div>
    );
  }

  const chatwootUrl = property.settings?.whatsappConfig?.chatwootUrl || "";

  if (!chatwootUrl) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center w-full bg-muted/20 rounded-xl border border-dashed">
        <MessageSquareOff className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Chatwoot não configurado</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          A URL do Chatwoot não foi configurada para{" "}
          <strong className="text-foreground">{property.name}</strong>.
        </p>
      </div>
    );
  }

  return (
    // Cancela o padding do layout admin (p-4 lg:p-8 pb-20) para o iframe ser borda a borda
    <div className="-mt-4 -mb-20 -mx-4 lg:-mt-8 lg:-mb-20 lg:-mx-8 relative">
      <iframe
        src={chatwootUrl}
        className="w-full block"
        style={{ height: "100dvh" }}
      />

      {/* Botão flutuante — Fila de Automações */}
      <div className="fixed top-6 right-6 z-50">
        <Button
          onClick={() => router.push("/admin/comunicacao/automations")}
          className="gap-2 shadow-lg"
        >
          <Bot className="w-4 h-4" />
          Fila de Automações
        </Button>
      </div>
    </div>
  );
}
